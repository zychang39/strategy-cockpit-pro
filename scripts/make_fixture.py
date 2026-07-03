#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""假資料產生器 — 本機驗收與開發用（§7.3 手動驗收腳本）。

用法：
  python scripts/make_fixture.py                    # offense 情境
  python scripts/make_fixture.py --scenario rotation  # SOX 破 30MA、QQQ 未破 → 輪動卡片
  python scripts/make_fixture.py --scenario defense   # SOX < 60MA
  python scenario glue / double 亦可。
  加 --targets 以假現價生成 config/targets.yaml（佔位，正式請 fetch.py --force-targets）

產出 data/latest.json（sample=true，前端顯示「樣本資料」徽章）。
論述證偽（曝險 −20pp）為使用者狀態：請在前端「追蹤」頁把任一檢查點切成「證偽」驗收。
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import engine  # noqa: E402
from fetch import gen_targets, now_iso  # noqa: E402

import yaml  # noqa: E402

# 概略但量級合理的假現價（僅供驗收 UI，非真實報價）
PRICES = {
    "^SOX": 5200, "QQQ": 530,
    "MU": 120, "SNDK": 60, "STX": 110, "WDC": 75, "TER": 130, "LITE": 85,
    "COHR": 90, "MRVL": 75, "ALAB": 90, "AMKR": 30, "GOOGL": 175, "AMZN": 210,
    "NVDA": 140, "AVGO": 240, "GLW": 48, "INTC": 22, "AMAT": 180, "ONTO": 170,
    "ASML": 750, "UCTT": 40, "KLIC": 45, "BB": 4.2, "WOLF": 5.5,
    "2330.TW": 1050, "2454.TW": 1300, "2327.TW": 105, "2308.TW": 380,
    "6187.TWO": 130, "6223.TWO": 92,
    "6981.T": 3000, "285A.T": 3500,
    "TWD=X": 32.5, "JPY=X": 155.0,
}

SCEN = {  # ^SOX / QQQ 的 (price, ma30, ma60)
    "offense":  {"sox": (5200, 5050, 4700), "qqq": (530, 520, 505)},
    "rotation": {"sox": (4950, 5050, 4700), "qqq": (530, 520, 505)},
    "defense":  {"sox": (4600, 5050, 4700), "qqq": (530, 520, 505)},
    "glue":     {"sox": (5200, 4950, 4900), "qqq": (530, 520, 505)},
    "double":   {"sox": (4950, 5050, 4700), "qqq": (505, 520, 505)},
}


def spark(price, n=90, seed=7):
    rnd = random.Random(seed + int(price * 100))
    vals, v = [], price * 0.85
    for _ in range(n - 1):
        v *= 1 + rnd.uniform(-0.018, 0.021)
        vals.append(round(v, 2))
    vals.append(price)
    return vals


def quote(sym, cat, price, ma30=None, ma60=None):
    return {
        "symbol": sym, "category": cat, "price": price,
        "prev_close": round(price * 0.992, 4), "change_pct": 0.81,
        "ma20": round(ma30 * 1.01 if ma30 else price * 0.97, 4),
        "ma30": ma30 or round(price * 0.95, 4),
        "ma60": ma60 or round(price * 0.90, 4),
        "spark": spark(price), "partial": False,
        "source": "fixture", "fetched_at": now_iso(), "error": None,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scenario", default="offense", choices=list(SCEN))
    ap.add_argument("--targets", action="store_true")
    args = ap.parse_args()

    watch = yaml.safe_load((ROOT / "config" / "watchlist.yaml").read_text(encoding="utf-8"))
    sc = SCEN[args.scenario]

    quotes = {}
    for category in ("indices", "us", "tw", "two", "jp", "fx"):
        for sym in watch.get(category) or []:
            cat = "fx" if category == "fx" else category
            p = PRICES.get(sym, 100)
            if sym == "^SOX":
                quotes[sym] = quote(sym, cat, *sc["sox"][:1], sc["sox"][1], sc["sox"][2])
            elif sym == "QQQ":
                quotes[sym] = quote(sym, cat, *sc["qqq"][:1], sc["qqq"][1], sc["qqq"][2])
            else:
                quotes[sym] = quote(sym, cat, p)

    sox, qqq = quotes["^SOX"], quotes["QQQ"]
    s = engine.detect_regime(sox["price"], sox["ma30"], sox["ma60"],
                             qqq["price"], qqq["ma30"], qqq["ma60"])
    signals = s.to_dict()
    signals["regime_label"] = engine.REGIME_LABEL[s.regime]

    options = {}
    for sym in ("GOOGL", "AMZN", "NVDA", "MU", "TER", "AVGO"):
        p = PRICES[sym]
        exp = (dt.date.today() + dt.timedelta(days=365)).isoformat()
        k = round(p * 0.8 / 5) * 5
        options[sym] = {"expiry": exp, "strike": k,
                        "mid": round(p - k + p * 0.07, 2), "delta_est": 0.81,
                        "iv": 0.38, "fetched_at": now_iso()}

    out = {
        "generated_at": now_iso(),
        "sample": True,
        "scenario": args.scenario,
        "signals": signals,
        "fx": {"USDTWD": 32.5, "JPYTWD": round(32.5 / 155.0, 4), "fetched_at": now_iso()},
        "quotes": quotes,
        "options": options,
    }
    (ROOT / "data").mkdir(exist_ok=True)
    (ROOT / "data" / "history").mkdir(exist_ok=True)
    (ROOT / "data" / "latest.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"[fixture] scenario={args.scenario} regime={s.regime} "
          f"rotation={s.rotation} glue={s.glue} double={s.double_break}")

    if args.targets:
        settings = yaml.safe_load((ROOT / "config" / "settings.yaml").read_text(encoding="utf-8"))
        phases = yaml.safe_load((ROOT / "config" / "phases.yaml").read_text(encoding="utf-8"))
        gen_targets(quotes, phases, settings, ROOT / "config" / "targets.yaml")


if __name__ == "__main__":
    main()
