# -*- coding: utf-8 -*-
"""§7.2 驗收：規則引擎全部分支 × 邊界值 + 曝險換算股數取整。"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from engine import (OFFENSE, REDUCE, DEFENSE, detect_regime, apply_modifiers,
                    limit_price, tw_tick, round_shares, split_layers, theme_alloc,
                    margin_plan_tw, margin_plan_us, leaps_plan, expected_returns,
                    Signals)


# ---------------------------------------------------------------- 制度三分支
def test_offense():
    s = detect_regime(110, 100, 90, 500, 480, 470)
    assert s.regime == OFFENSE and s.base_position == 0.95 and s.base_leverage == 1.8

def test_reduce():
    s = detect_regime(95, 100, 90, 500, 480, 470)
    assert s.regime == REDUCE and s.base_position == 0.80 and s.base_leverage == 1.3

def test_defense():
    s = detect_regime(85, 100, 90, 500, 480, 470)
    assert s.regime == DEFENSE and s.base_position == 0.65 and s.base_leverage == 1.0

def test_defense_between_mas():
    """>30MA 但 <60MA 的罕見情況 → 防守（SOX < 60MA 條件優先）。"""
    s = detect_regime(95, 90, 100, 500, 480, 470)
    assert s.regime == DEFENSE

def test_boundary_equal_is_not_above():
    """等值視為未站上 → 減碼。"""
    s = detect_regime(100, 100, 90, 500, 480, 470)
    assert s.regime == REDUCE


# ---------------------------------------------------------------- 修飾規則
def test_rotation_signal():
    """SOX < 30MA 且 QQQ > 30MA → 輪動。"""
    s = detect_regime(95, 100, 90, 500, 480, 470)
    assert s.rotation is True

def test_no_rotation_when_sox_above():
    s = detect_regime(110, 100, 90, 500, 480, 470)
    assert s.rotation is False

def test_glue():
    """|30MA−60MA|/60MA < 5% → 黏合，單次減碼上限 0.25。"""
    s = detect_regime(110, 100, 98, 500, 480, 470)
    assert s.glue is True and s.reduction_cap == 0.25

def test_glue_boundary_exactly_5pct():
    s = detect_regime(110, 105, 100, 500, 480, 470)  # 差正好 5% → 不算黏合
    assert s.glue is False

def test_double_break():
    s = detect_regime(95, 100, 90, 470, 480, 470)
    assert s.double_break is True and s.rotation is False


# ---------------------------------------------------------------- 使用者端修飾
def _sig(regime=OFFENSE, pos=0.95, lev=1.8):
    return Signals(regime, pos, lev)

def test_user_cap():
    d = apply_modifiers(_sig(), user_leverage_cap=1.3)
    assert d.leverage == 1.3 and d.exposure == pytest.approx(0.95 * 1.3)

def test_falsified_deduction():
    """證偽 → −20pp、槓桿鎖 1.0，優先於價格訊號。"""
    d = apply_modifiers(_sig(), falsified_any=True)
    assert d.position == pytest.approx(0.75) and d.leverage == 1.0
    assert d.exposure == pytest.approx(0.75)

def test_breaker_review():
    d = apply_modifiers(_sig(), drawdown=-0.10)
    assert d.breaker == "review" and d.leverage == 1.8

def test_breaker_force():
    d = apply_modifiers(_sig(), drawdown=-0.15)
    assert d.breaker == "force_delever" and d.leverage == 1.0

def test_falsified_and_breaker_stack():
    d = apply_modifiers(_sig(), falsified_any=True, drawdown=-0.16)
    assert d.position == pytest.approx(0.75) and d.leverage == 1.0

def test_position_floor_zero():
    d = apply_modifiers(_sig(DEFENSE, 0.1, 1.0), falsified_any=True)
    assert d.position == 0.0


# ---------------------------------------------------------------- 限價
def test_limit_price_normal():
    mode, v = limit_price(100, 98, 90, OFFENSE)
    assert mode == "buy" and v == pytest.approx(98 * 0.995)

def test_limit_price_below_ma20():
    mode, v = limit_price(95, 98, 90, OFFENSE)
    assert v == round(95 * 0.995, 2)

def test_limit_price_defense_watch():
    mode, v = limit_price(95, 98, 90, DEFENSE)
    assert mode == "watch" and v == 90

def test_limit_price_tw_tick():
    _, v = limit_price(600, 620, 500, OFFENSE, tick_fn=tw_tick)
    assert v == 597.0  # 600×0.995=597 → 500–1000 檔位 1 元

def test_tw_tick_bands():
    assert tw_tick(9.994) == 9.99
    assert tw_tick(49.99) == 49.95
    assert tw_tick(99.99) == 99.9
    assert tw_tick(499.9) == 499.5
    assert tw_tick(1234) == 1230


# ---------------------------------------------------------------- 股數取整
def test_round_shares_tw():
    assert round_shares(1999, "tw") == 1000
    assert round_shares(999, "tw") == 0
    assert round_shares(3500, "two") == 3000

def test_round_shares_jp_us():
    assert round_shares(250, "jp") == 200
    assert round_shares(7.9, "us") == 7


# ---------------------------------------------------------------- 層拆分
def test_split_layers_no_leverage():
    eq, gap = split_layers(1_000_000, 0.65)
    assert eq == 650_000 and gap == 0

def test_split_layers_full():
    eq, gap = split_layers(1_000_000, 1.0)
    assert eq == 1_000_000 and gap == 0

def test_split_layers_leveraged():
    eq, gap = split_layers(1_000_000, 1.71)   # 0.95 × 1.8
    assert eq == 1_000_000 and gap == pytest.approx(710_000)


# ---------------------------------------------------------------- 主題配置
THEMES = [
    {"name": "A", "weight": 0.3, "tickers": ["MU", "STX"]},
    {"name": "CSP", "weight": 0.13, "tickers": ["GOOGL"], "rotation_only": True},
    {"name": "現金", "weight": 0.05, "tickers": []},
]

def test_theme_alloc_equal_split():
    out = theme_alloc(THEMES, 1_000_000)
    assert out["MU"][0] == pytest.approx(150_000)
    assert "GOOGL" not in out  # 未輪動 → 觸發倉不啟用

def test_theme_alloc_rotation_on():
    out = theme_alloc(THEMES, 1_000_000, rotation=True)
    assert out["GOOGL"][0] == pytest.approx(130_000)


# ---------------------------------------------------------------- 融資/LEAPS
def test_margin_tw_alert():
    """自備40%、警戒130% → 警戒價 = P×1.3×0.6 = 0.78P（跌 22% 觸警）。"""
    p = margin_plan_tw(100_000, 100)
    assert p["alert_price"] == pytest.approx(78.0)
    assert p["loan"] == 60_000 and p["self_funded"] == 40_000

def test_margin_us():
    p = margin_plan_us(10_000, 200)
    assert p["loan"] == 10_000 and p["alert_price"] < 200

def test_leaps():
    p = leaps_plan(100_000, 200, delta=0.8, strike_ratio=0.8)
    assert p["strike"] == 160
    assert p["per_contract_exposure"] == pytest.approx(0.8 * 100 * 200)
    assert p["contracts"] == 6      # 100000 // 16000
    assert p["max_loss"] == p["premium_total"]

def test_leaps_zero_gap():
    p = leaps_plan(0, 200)
    assert p["contracts"] == 0 and p["max_loss"] == 0


# ---------------------------------------------------------------- 預期報酬
def test_expected_returns():
    r = expected_returns(100, {"bear": 75, "base": 140, "bull": 189})
    assert r == {"bear": -25.0, "base": 40.0, "bull": 89.0}

def test_expected_returns_missing():
    assert expected_returns(0, {"base": 1}) is None
