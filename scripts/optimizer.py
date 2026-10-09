#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""麦麦全能搭子 · 决策引擎（零依赖，纯标准库）。

本模块把「AI 的感觉」变成「可复算的确定性结果」，是 Skill 的大脑：

1. `optimize_price`        —— 券后最优价引擎。
   给定购物车与一批优惠券，穷举可行组合（含互斥分组与叠加规则），
   返回实付金额最低的那一种，并给出省了多少钱。

2. `plan_calorie_budget`   —— 热量预算配餐引擎。
   给定热量上限与营养目标（蛋白质 / 钠），在「主餐 + 小食 + 饮品」
   的约束下搜索最优组合，支持多种偏好策略。

3. `compare_set_vs_single` —— 套餐 vs 单点对比。

设计原则：任何报价都必须是「可复算」的 —— 同样的输入永远得到同样的
输出，绝不依赖模型的临场发挥。模型负责理解用户意图与解释结果，
本模块负责把结果算准。

用法::

    python optimizer.py --selftest      # 运行内置单元测试
    python optimizer.py --demo          # 用内置样例数据演示
"""

from __future__ import annotations

import argparse
import itertools
import json
import sys
from dataclasses import dataclass, field, asdict
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

__all__ = [
    "NutritionItem",
    "Coupon",
    "CartLine",
    "PlanResult",
    "PriceResult",
    "optimize_price",
    "plan_calorie_budget",
    "compare_set_vs_single",
]

# ====================================================================== #
# 数据模型
# ====================================================================== #


@dataclass(frozen=True)
class NutritionItem:
    """一份餐品的营养与价格信息。"""

    code: str
    name: str
    category: str  # main / side / drink / dessert
    price: float  # 元
    kcal: float
    protein: float = 0.0  # g
    fat: float = 0.0  # g
    carb: float = 0.0  # g
    sodium: float = 0.0  # mg

    def scale(self, qty: int) -> Dict[str, float]:
        return {
            "kcal": self.kcal * qty,
            "protein": self.protein * qty,
            "fat": self.fat * qty,
            "carb": self.carb * qty,
            "sodium": self.sodium * qty,
        }


@dataclass(frozen=True)
class Coupon:
    """一张优惠券。

    kind:
        - ``full_reduce`` 满减：适用商品小计 >= threshold 时减免 ``value`` 元
        - ``discount``    折扣：适用商品小计减免 ``value`` 比例（0.1 = 打 9 折）
        - ``item_price``  单品特价：把适用商品单价压到 ``value`` 元
    applies_to: 适用的餐品 code 集合；``None`` 表示全场通用
    group:      互斥分组名。同组内最多只能使用一张券；``None`` 表示可自由叠加
    """

    id: str
    name: str
    kind: str
    value: float
    threshold: float = 0.0
    applies_to: Optional[frozenset] = None
    group: Optional[str] = None

    def applies(self, code: str) -> bool:
        return self.applies_to is None or code in self.applies_to


@dataclass
class CartLine:
    """购物车中的一行。"""

    item: NutritionItem
    qty: int = 1


@dataclass
class PriceResult:
    """券后最优价结果。"""

    original: float
    payable: float
    saved: float
    used_coupons: List[Coupon] = field(default_factory=list)
    detail: str = ""

    @property
    def save_rate(self) -> float:
        return (self.saved / self.original) if self.original > 0 else 0.0


@dataclass
class PlanResult:
    """配餐结果。"""

    items: List[Tuple[NutritionItem, int]]
    total_kcal: float
    total_protein: float
    total_fat: float
    total_carb: float
    total_sodium: float
    total_price: float
    score: float
    strategy: str

    def describe(self) -> str:
        lines = [f"【{self.strategy}】方案"]
        for item, qty in self.items:
            tag = f"x{qty}" if qty > 1 else ""
            lines.append(f"  · {item.name}{tag}  ¥{item.price * qty:.2f}")
        lines.append(
            f"  合计 ¥{self.total_price:.2f} | {self.total_kcal:.0f} kcal | "
            f"蛋白 {self.total_protein:.1f}g | 脂肪 {self.total_fat:.1f}g | "
            f"碳水 {self.total_carb:.1f}g | 钠 {self.total_sodium:.0f}mg"
        )
        return "\n".join(lines)


# ====================================================================== #
# 1. 券后最优价引擎
# ====================================================================== #


def _subtotal_for(codes: Iterable[str], unit_price: Dict[str, float], qty: Dict[str, int]) -> float:
    return sum(unit_price[c] * qty.get(c, 0) for c in codes)


def _price_with_coupons(cart: Sequence[CartLine], subset: Sequence[Coupon]) -> float:
    """按固定顺序（单品特价 → 折扣 → 满减）套用一组券，返回实付金额。"""
    unit_price = {line.item.code: line.item.price for line in cart}
    qty = {line.item.code: line.qty for line in cart}
    all_codes = list(unit_price.keys())

    # ① 单品特价：把适用商品单价压到券面价（取最优，不叠加抬价）
    for c in subset:
        if c.kind != "item_price":
            continue
        for code in all_codes:
            if c.applies(code):
                unit_price[code] = min(unit_price[code], c.value)

    total = _subtotal_for(all_codes, unit_price, qty)

    # ② 折扣
    for c in subset:
        if c.kind != "discount":
            continue
        codes = [x for x in all_codes if c.applies(x)]
        total -= _subtotal_for(codes, unit_price, qty) * c.value

    # ③ 满减
    for c in subset:
        if c.kind != "full_reduce":
            continue
        codes = [x for x in all_codes if c.applies(x)]
        if _subtotal_for(codes, unit_price, qty) >= c.threshold:
            total -= c.value

    return max(total, 0.0)


def _candidate_subsets(coupons: Sequence[Coupon], max_stack: int) -> Iterable[Tuple[Coupon, ...]]:
    """生成所有可行的券组合（遵守互斥分组与最大叠加数）。"""
    groups: Dict[str, List[Coupon]] = {}
    free: List[Coupon] = []
    for c in coupons:
        (groups.setdefault(c.group, []) if c.group else free).append(c)

    # 每个分组：空 或 选其中一张
    group_options: List[List[Tuple[Coupon, ...]]] = []
    for members in groups.values():
        opts: List[Tuple[Coupon, ...]] = [()]
        opts.extend((m,) for m in members)
        group_options.append(opts)

    # 自由券：选 / 不选
    free_options: List[Tuple[Coupon, ...]] = [()]
    for r in range(1, len(free) + 1):
        free_options.extend(itertools.combinations(free, r))

    for gcombo in itertools.product(*group_options) if group_options else [()]:
        base = tuple(c for part in gcombo for c in part)
        for fcombo in free_options:
            merged = base + fcombo
            if len(merged) <= max_stack:
                yield merged


def optimize_price(
    cart: Sequence[CartLine],
    coupons: Sequence[Coupon],
    max_stack: int = 4,
) -> PriceResult:
    """穷举可行券组合，返回实付最低的方案。"""
    if not cart:
        return PriceResult(0.0, 0.0, 0.0, [], "购物车为空")

    original = sum(line.item.price * line.qty for line in cart)
    best_total = original
    best_subset: Tuple[Coupon, ...] = ()

    for subset in _candidate_subsets(coupons, max_stack):
        if not subset:
            continue
        total = _price_with_coupons(cart, subset)
        if total < best_total - 1e-9:
            best_total = total
            best_subset = subset

    saved = original - best_total
    detail = "未使用优惠券" if not best_subset else " + ".join(c.name for c in best_subset)
    return PriceResult(
        original=round(original, 2),
        payable=round(best_total, 2),
        saved=round(saved, 2),
        used_coupons=list(best_subset),
        detail=detail,
    )


# ====================================================================== #
# 2. 热量预算配餐引擎
# ====================================================================== #


def _combo_metrics(items: Sequence[Tuple[NutritionItem, int]]) -> Dict[str, float]:
    m = {"kcal": 0.0, "protein": 0.0, "fat": 0.0, "carb": 0.0, "sodium": 0.0, "price": 0.0}
    for item, qty in items:
        m["kcal"] += item.kcal * qty
        m["protein"] += item.protein * qty
        m["fat"] += item.fat * qty
        m["carb"] += item.carb * qty
        m["sodium"] += item.sodium * qty
        m["price"] += item.price * qty
    return m


def plan_calorie_budget(
    menu: Sequence[NutritionItem],
    budget_kcal: float,
    strategy: str = "balanced",
    protein_target: Optional[float] = None,
    sodium_limit: Optional[float] = None,
    top_k: int = 3,
    tolerance: float = 0.15,
) -> List[PlanResult]:
    """在热量预算内，按「主餐 + 小食 + 饮品」搜索最优组合。

    strategy:
        - ``balanced``   均衡：热量贴合预算 + 蛋白质达标
        - ``protein``    增肌：优先拉高蛋白质
        - ``low_sodium`` 控钠：优先压低钠摄入
        - ``cheapest``   省钱：在热量达标前提下选最便宜
    tolerance: 允许超出预算的比例（默认 15%）。
    """
    by_cat: Dict[str, List[NutritionItem]] = {}
    for it in menu:
        by_cat.setdefault(it.category, []).append(it)

    mains = by_cat.get("main", [])
    sides = by_cat.get("side", [])
    drinks = by_cat.get("drink", [])
    if not mains:
        return []

    upper = budget_kcal * (1 + tolerance)
    results: List[PlanResult] = []

    # 允许 1~2 份小食，覆盖「一个人吃 / 两个人分」的场景
    side_choices = [(s,) for s in sides] + [tuple(c) for c in itertools.combinations(sides, 2)] if sides else [()]
    drink_choices = [(d,) for d in drinks] if drinks else [()]

    for main in mains:
        for side_pick in side_choices:
            for drink_pick in drink_choices:
                combo: List[Tuple[NutritionItem, int]] = [(main, 1)]
                combo += [(s, 1) for s in side_pick]
                combo += [(d, 1) for d in drink_pick]
                m = _combo_metrics(combo)
                if m["kcal"] > upper or m["kcal"] <= 0:
                    continue

                kcal_gap = abs(m["kcal"] - budget_kcal) / max(budget_kcal, 1)
                score = 0.0
                if strategy == "protein":
                    p_target = protein_target or 30.0
                    score = -m["protein"] + kcal_gap * 10 + m["price"] * 0.05
                    if m["protein"] < p_target * 0.8:
                        score += (p_target * 0.8 - m["protein"]) * 2
                elif strategy == "low_sodium":
                    s_limit = sodium_limit or 1200.0
                    over = max(0.0, m["sodium"] - s_limit) / max(s_limit, 1)
                    score = m["sodium"] / 1000 + over * 20 + kcal_gap * 5
                elif strategy == "cheapest":
                    score = m["price"] + kcal_gap * 30
                else:  # balanced
                    p_target = protein_target or 25.0
                    score = kcal_gap * 20
                    if m["protein"] < p_target:
                        score += (p_target - m["protein"]) * 1.5
                    if sodium_limit and m["sodium"] > sodium_limit:
                        score += (m["sodium"] - sodium_limit) / 100
                    score += m["price"] * 0.03

                results.append(
                    PlanResult(
                        items=combo,
                        total_kcal=round(m["kcal"], 1),
                        total_protein=round(m["protein"], 1),
                        total_fat=round(m["fat"], 1),
                        total_carb=round(m["carb"], 1),
                        total_sodium=round(m["sodium"], 0),
                        total_price=round(m["price"], 2),
                        score=round(score, 3),
                        strategy=strategy,
                    )
                )

    results.sort(key=lambda r: (r.score, r.total_price))
    return results[:top_k]


# ====================================================================== #
# 3. 套餐 vs 单点
# ====================================================================== #


def compare_set_vs_single(
    set_price: float,
    set_items: Sequence[NutritionItem],
    single_menu: Sequence[NutritionItem],
) -> Dict[str, float]:
    """对比「套餐一口价」与「按单点价逐项相加」的差额。

    返回 ``{'single_total':..., 'set_price':..., 'diff':..., 'save_rate':...}``。
    diff > 0 表示套餐更省。
    """
    single_total = sum(i.price for i in set_items)
    diff = single_total - set_price
    return {
        "single_total": round(single_total, 2),
        "set_price": round(set_price, 2),
        "diff": round(diff, 2),
        "save_rate": round(diff / single_total, 4) if single_total > 0 else 0.0,
    }


# ====================================================================== #
# 内置样例数据（用于离线演示与自测，真实数据一律以 MCP 为准）
# ====================================================================== #

SAMPLE_MENU: List[NutritionItem] = [
    NutritionItem("bigmac", "巨无霸", "main", 25.5, 550, 26.0, 30.0, 45.0, 950),
    NutritionItem("mchicken", "麦辣鸡腿汉堡", "main", 22.0, 540, 25.0, 27.0, 47.0, 1050),
    NutritionItem("filet", "麦香鱼", "main", 18.5, 340, 15.0, 14.0, 38.0, 580),
    NutritionItem("gcb", "板烧鸡腿堡", "main", 24.0, 430, 27.0, 18.0, 41.0, 900),
    NutritionItem("doublecheese", "双层吉士汉堡", "main", 21.0, 450, 25.0, 22.0, 34.0, 1100),
    NutritionItem("fries-m", "中薯条", "side", 11.5, 340, 4.0, 16.0, 44.0, 260),
    NutritionItem("fries-s", "小薯条", "side", 8.0, 230, 2.5, 11.0, 30.0, 180),
    NutritionItem("nuggets5", "麦乐鸡（5块）", "side", 12.0, 230, 14.0, 13.0, 13.0, 500),
    NutritionItem("mcwings2", "麦辣鸡翅（2块）", "side", 13.5, 240, 15.0, 15.0, 9.0, 620),
    NutritionItem("salad", "鲜蔬杯", "side", 12.0, 35, 2.0, 0.5, 6.0, 30),
    NutritionItem("coke-m", "可口可乐（中）", "drink", 9.0, 150, 0.0, 0.0, 38.0, 15),
    NutritionItem("coke-zero-m", "零度可乐（中）", "drink", 9.0, 1, 0.0, 0.0, 0.0, 20),
    NutritionItem("sprite-m", "雪碧（中）", "drink", 9.0, 140, 0.0, 0.0, 36.0, 40),
    NutritionItem("coffee-amer", "美式咖啡（中）", "drink", 13.0, 5, 0.5, 0.0, 0.0, 10),
    NutritionItem("orange-juice", "橙汁", "drink", 11.0, 130, 1.5, 0.0, 30.0, 5),
    NutritionItem("mcfreeze", "原味冰淇淋", "dessert", 6.0, 200, 4.0, 5.0, 32.0, 90),
]

SAMPLE_COUPONS: List[Coupon] = [
    # 同一张订单通常只能用一张「满减 / 折扣」券 → 放进同一互斥分组 ORDER
    Coupon("C1", "全场满 30 减 6", "full_reduce", 6.0, threshold=30.0, group="ORDER"),
    Coupon("C2", "全场 9 折", "discount", 0.10, group="ORDER"),
    Coupon("C3", "满 20 减 3", "full_reduce", 3.0, threshold=20.0, group="ORDER"),
    # 单品特价券，独立分组
    Coupon("C4", "薯条特价 8 元", "item_price", 8.0,
           applies_to=frozenset({"fries-m", "fries-s"}), group="ITEM"),
    # 会员日叠加券：group=None 表示可与其它券自由叠加
    Coupon("C5", "会员日立减 2 元", "full_reduce", 2.0, threshold=0.0),
]


# ====================================================================== #
# 自测 & 演示
# ====================================================================== #


def _selftest() -> int:
    failures: List[str] = []

    def check(name: str, got: object, want: object) -> None:
        ok = got == want
        print(f"  [{'PASS' if ok else 'FAIL'}] {name}: got={got!r} want={want!r}")
        if not ok:
            failures.append(name)

    print("== 1. 券后最优价 ==")
    order_coupons = SAMPLE_COUPONS[:3]  # C1 / C2 / C3 互斥
    bigmac = SAMPLE_MENU[0]
    cart = [CartLine(bigmac, 1)]  # 25.5
    # 25.5 元：C1(满30减6 不达门槛) vs C2(9折→22.95) vs C3(满20减3→22.5)
    r = optimize_price(cart, order_coupons, max_stack=4)
    check("25.5 元单点最优价", r.payable, 22.5)
    check("省钱金额", r.saved, 3.0)

    # 两份巨无霸 = 51.0：互斥组内 C1 满30减6 最优 → 45.0
    cart2 = [CartLine(bigmac, 2)]
    r2 = optimize_price(cart2, order_coupons, max_stack=4)
    check("51 元双份最优价", r2.payable, 45.0)

    # 互斥分组：C1 与 C2 同组，只能选一张（C1 门槛不达 → 选 C2）
    cart3 = [CartLine(bigmac, 1)]
    r3 = optimize_price(cart3, [SAMPLE_COUPONS[0], SAMPLE_COUPONS[1]], max_stack=4)
    check("互斥组只选一张", r3.payable, 22.95)

    # 叠加券：C3(满20减3) + C5(会员日立减2，可叠加) → 25.5 - 3 - 2
    r5 = optimize_price(cart3, [SAMPLE_COUPONS[2], SAMPLE_COUPONS[4]], max_stack=4)
    check("叠加券生效", r5.payable, 20.5)

    # 单品特价
    fries = SAMPLE_MENU[5]  # 中薯 11.5
    cart4 = [CartLine(fries, 2)]
    r4 = optimize_price(cart4, [SAMPLE_COUPONS[3]], max_stack=4)
    check("薯条特价 8 元", r4.payable, 16.0)

    print("== 2. 热量预算配餐 ==")
    plans = plan_calorie_budget(SAMPLE_MENU, budget_kcal=600, strategy="balanced")
    if not plans:
        failures.append("配餐返回空")
        print("  [FAIL] 配餐返回空")
    else:
        p = plans[0]
        ok = p.total_kcal <= 600 * 1.15
        print(f"  [{'PASS' if ok else 'FAIL'}] 预算内: {p.total_kcal} kcal <= 690")
        if not ok:
            failures.append("配餐超预算")

    # 增肌策略应给出不低于均衡策略的蛋白质
    p_protein = plan_calorie_budget(SAMPLE_MENU, 700, "protein")[0]
    p_balanced = plan_calorie_budget(SAMPLE_MENU, 700, "balanced")[0]
    ok = p_protein.total_protein >= p_balanced.total_protein - 1e-9
    print(
        f"  [{'PASS' if ok else 'FAIL'}] 增肌蛋白 {p_protein.total_protein}g "
        f">= 均衡 {p_balanced.total_protein}g"
    )
    if not ok:
        failures.append("增肌策略蛋白不足")

    print("== 3. 套餐 vs 单点 ==")
    items = [SAMPLE_MENU[0], SAMPLE_MENU[5], SAMPLE_MENU[10]]  # 巨无霸+中薯+中可
    cmp = compare_set_vs_single(set_price=39.0, set_items=items, single_menu=SAMPLE_MENU)
    # 25.5 + 11.5 + 9 = 46.0，套餐 39 → 省 7
    check("套餐省 7 元", cmp["diff"], 7.0)

    print()
    if failures:
        print(f"❌ {len(failures)} 项失败：{failures}")
        return 1
    print("✅ 全部自测通过")
    return 0


def _demo() -> int:
    print("=" * 62)
    print("麦麦全能搭子 · 决策引擎演示（离线样例数据）")
    print("=" * 62)

    print("\n【场景 A】省钱军师：双人餐怎么点最便宜")
    cart = [CartLine(SAMPLE_MENU[0], 2), CartLine(SAMPLE_MENU[5], 2), CartLine(SAMPLE_MENU[10], 2)]
    r = optimize_price(cart, SAMPLE_COUPONS)
    print(f"  原价 ¥{r.original:.2f} → 实付 ¥{r.payable:.2f}（省 ¥{r.saved:.2f}，"
          f"省 {r.save_rate * 100:.1f}%）")
    print(f"  用券组合：{r.detail}")

    print("\n【场景 B】营养配餐：600 大卡以内")
    for p in plan_calorie_budget(SAMPLE_MENU, 600, "balanced", top_k=2):
        print(p.describe())
        print()

    print("【场景 C】增肌：700 大卡、蛋白质优先")
    for p in plan_calorie_budget(SAMPLE_MENU, 700, "protein", top_k=2):
        print(p.describe())
        print()

    print("【场景 D】控钠：800 大卡、钠优先")
    for p in plan_calorie_budget(SAMPLE_MENU, 800, "low_sodium", top_k=1):
        print(p.describe())
        print()
    return 0


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="麦麦全能搭子 · 决策引擎")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--selftest", action="store_true", help="运行内置单元测试")
    group.add_argument("--demo", action="store_true", help="用样例数据演示三大引擎")
    args = parser.parse_args(argv)

    if args.selftest:
        return _selftest()
    if args.demo:
        return _demo()

    parser.print_help()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
