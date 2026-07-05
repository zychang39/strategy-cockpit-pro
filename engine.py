# -*- coding: utf-8 -*-
"""規則引擎（純函式，無 I/O）— 由 fetch.py 呼叫，並由 pytest 覆蓋全部分支。

前端 web/src/engine.js 為本檔的 JS 鏡像；改規則時兩邊要同步改。
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field, asdict

OFFENSE, REDUCE, DEFENSE = "offense", "reduce", "defense"

REGIME_LABEL = {OFFENSE: "進攻", REDUCE: "減碼", DEFENSE: "防守"}


# ---------------------------------------------------------------- §2.1 制度判定
@dataclass
class Signals:
    regime: str
    base_position: float          # 目標持股水位（未套修飾）
    base_leverage: float          # 制度允許槓桿（未套使用者上限）
    rotation: bool = False        # 輪動訊號
    glue: bool = False            # 均線黏合
    reduction_cap: float | None = None  # 黏合時單次減碼上限（0.20–0.30 取 0.25）
    double_break: bool = False    # SOX、QQQ 同 < 30MA
    qqq_below30: bool = False     # QQQ < 30MA（不論 SOX）→ 現金 +20%、汰弱留強
    notes: list = field(default_factory=list)

    def to_dict(self):
        return asdict(self)


def detect_regime(sox_close, sox_ma30, sox_ma60, qqq_close, qqq_ma30, qqq_ma60) -> Signals:
    """依 §2.1 表 + 修飾規則產出訊號。比較一律用嚴格大於/小於；等值視為未站上。"""
    above30 = sox_close > sox_ma30
    above60 = sox_close > sox_ma60

    if above30 and above60:
        s = Signals(OFFENSE, 0.95, 1.3)  # 槓桿僅在站上 30MA 時動用，上限 1.3×（1.8× 在本框架無支持理由）
    elif (not above30) and above60:
        s = Signals(REDUCE, 0.80, 1.0)   # 跌破 30MA：先把槓桿歸 1.0，再降現股倉位
    else:  # sox <= 60MA（含 >30MA 但 <60MA 的罕見情況，一律防守）
        s = Signals(DEFENSE, 0.65, 1.0)
        s.notes.append("防守制度：禁用融資與槓桿型選擇權")

    # 輪動訊號：SOX < 30MA 且 QQQ > 30MA
    if (not above30) and qqq_close > qqq_ma30:
        s.rotation = True
        s.notes.append("資金輪動：加碼 GOOGL / AMZN / NVDA，等比減碼半導體供應鏈主題")

    # 均線黏合：|30MA − 60MA| / 60MA < 5%
    if sox_ma60 and abs(sox_ma30 - sox_ma60) / sox_ma60 < 0.05:
        s.glue = True
        s.reduction_cap = 0.25
        s.notes.append("均線黏合：單次減碼上限 20–30%")

    # QQQ 大盤觸發：破 30MA → 拉高現金 20%、先砍線型最弱；
    # 站回 30MA 且第二個交易日尾盤守住 → 加回
    if qqq_close < qqq_ma30:
        s.qqq_below30 = True
        s.notes.append("QQQ 破 30MA：現金 +20%、汰弱留強")

    # 雙破：大家一起跌 → 不需特別看 CSP，照一般紀律減倉
    if (not above30) and qqq_close < qqq_ma30:
        s.double_break = True
        s.notes.append("系統性回檔警示：channel check 改為每兩週")

    return s


# ------------------------------------------------- §2.1 修飾（使用者狀態端，前端同步實作）
@dataclass
class Directive:
    position: float               # 最終持股水位 0–1
    leverage: float               # 最終允許槓桿
    exposure: float               # 目標總曝險 = position × leverage（0–1.8）
    falsified: bool = False
    breaker: str | None = None    # None | "review"(−10%) | "force_delever"(−15%)
    notes: list = field(default_factory=list)

    def to_dict(self):
        return asdict(self)


def apply_modifiers(signals: Signals, user_leverage_cap: float = 1.8,
                    falsified_any: bool = False, drawdown: float = 0.0) -> Directive:
    """套用使用者上限、論述證偽扣減、回撤斷路器。drawdown 為負值（如 -0.12）。"""
    position = signals.base_position
    leverage = min(signals.base_leverage, user_leverage_cap)
    d = Directive(position, leverage, 0.0)

    # 論述證偽扣減：優先於一切價格訊號
    if falsified_any:
        d.falsified = True
        position = max(position - 0.20, 0.0)
        leverage = 1.0
        d.notes.append("論述證偽：持股水位 −20pp、槓桿鎖 1.0×")

    # 回撤斷路器
    if drawdown <= -0.15:
        d.breaker = "force_delever"
        leverage = 1.0
        d.notes.append("回撤 −15%：槓桿歸 1.0×，僅保留現股")
    elif drawdown <= -0.10:
        d.breaker = "review"
        d.notes.append("回撤 −10%：請重新檢視槓桿")

    d.position = round(position, 4)
    d.leverage = round(leverage, 4)
    d.exposure = round(position * leverage, 4)
    return d


# ---------------------------------------------------------- §2.3 建議限價
def limit_price(price: float, ma20: float | None, ma60: float | None, regime: str,
                tick_fn=None):
    """回傳 (mode, value)：mode = 'buy' 建議限價 | 'watch' 防守觀察價。"""
    if regime == DEFENSE:
        return ("watch", round(ma60, 2) if ma60 else None)
    base = min(price, ma20) if ma20 else price
    v = base * 0.995
    if tick_fn:
        v = tick_fn(v)
    return ("buy", round(v, 2))


def tw_tick(p: float) -> float:
    """台股升降單位取整（向下靠檔）。"""
    if p < 10: t = 0.01
    elif p < 50: t = 0.05
    elif p < 100: t = 0.1
    elif p < 500: t = 0.5
    elif p < 1000: t = 1.0
    else: t = 5.0
    return math.floor(p / t) * t


# ---------------------------------------------------------- §2.2 曝險 → 部位換算
LOT = {"tw": 1000, "two": 1000, "jp": 100, "us": 1, "indices": 1}


def round_shares(qty: float, category: str) -> int:
    """台股千股、日股百股、美股 1 股，一律向下取整。"""
    lot = LOT.get(category, 1)
    return int(qty // lot) * lot


def split_layers(capital: float, exposure: float):
    """現股層 = C×min(E,100%)；槓桿缺口 = C×max(E−100%,0)。"""
    equity = capital * min(exposure, 1.0)
    gap = capital * max(exposure - 1.0, 0.0)
    return equity, gap


def theme_alloc(themes: list, amount: float, rotation: bool = False):
    """主題權重 → 每檔金額（主題內等權；現金主題跳過；rotation_only 主題僅輪動時啟用，
    未啟用時其權重轉現金）。回傳 {ticker: (amount, theme)}。"""
    out = {}
    for th in themes:
        tickers = th.get("tickers") or []
        if not tickers:
            continue
        if th.get("rotation_only") and not rotation:
            continue
        per = amount * th["weight"] / len(tickers)
        for t in tickers:
            a, _ = out.get(t, (0.0, th))
            out[t] = (a + per, th)
    return out


def margin_plan_tw(finance_amount: float, price: float, initial: float = 0.4,
                   maintenance_alert: float = 1.3):
    """台股融資：自備 initial、融資 (1−initial)。
    維持率 = 市值/融資額 → 警戒價 = 買進價 × maintenance_alert × (1−initial)。"""
    loan_ratio = 1 - initial
    alert_price = price * maintenance_alert * loan_ratio
    return {
        "loan": round(finance_amount * loan_ratio, 0),
        "self_funded": round(finance_amount * initial, 0),
        "alert_price": round(alert_price, 2),
        "alert_drop_pct": round((alert_price / price - 1) * 100, 1),
    }


def margin_plan_us(finance_amount: float, price: float, maintenance: float = 0.3):
    """美股 margin：全額借（缺口即借款）。警戒價 = 借款/(股數×(1−maintenance))。
    此處以單位化計算：假設缺口全用 margin 買入，市值 V、借款 V →
    警戒價比例 = 1/(1−maintenance) × 借款/初始市值 … 簡化：借款 = finance_amount，
    加上自有部位後整體維持。前端顯示跌幅警戒 = maintenance 換算。"""
    # 簡化模型：部位市值 V0 = finance_amount（借款買入），權益 = 0 不合理；
    # 實務上 margin 借款上限 50%。等效：以 2 倍部位、借一半計。
    alert_price = price * (1 / (2 * (1 - maintenance)))  # 50% 初始保證金
    return {
        "loan": round(finance_amount, 0),
        "alert_price": round(alert_price, 2),
        "alert_drop_pct": round((alert_price / price - 1) * 100, 1),
    }


def leaps_plan(gap_amount_usd: float, price: float, delta: float = 0.8,
               strike_ratio: float = 0.8, premium: float | None = None):
    """方案 B：deep ITM LEAPS Call。每口等效曝險 = delta × 100 × 現價。
    premium 缺值時以內在價值 + 8% 時間價值估算。"""
    strike = round(price * strike_ratio / 5) * 5 or round(price * strike_ratio, 1)
    per_contract_exposure = delta * 100 * price
    contracts = int(gap_amount_usd // per_contract_exposure) if per_contract_exposure else 0
    est_premium = premium if premium else (price - strike) + price * 0.08
    total_premium = round(est_premium * 100 * contracts, 0)
    return {
        "strike": strike,
        "delta": delta,
        "contracts": contracts,
        "per_contract_exposure": round(per_contract_exposure, 0),
        "premium_each": round(est_premium, 2),
        "premium_total": total_premium,
        "max_loss": total_premium,  # 最大損失 = 權利金（優於融資斷頭風險）
    }


def expected_returns(price: float, targets: dict):
    """targets = {bear, base, bull} 目標價 → 報酬區間（%）。"""
    if not price or not targets:
        return None
    def r(k):
        v = targets.get(k)
        return round((v / price - 1) * 100, 1) if v else None
    return {"bear": r("bear"), "base": r("base"), "bull": r("bull")}
