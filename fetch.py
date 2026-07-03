#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""行情抓取 + 指標計算 → data/latest.json / data/history/YYYY-MM-DD.json

用法：
  python fetch.py                 # 全部抓取
  python fetch.py --init-targets  # 另以現價生成 config/targets.yaml 初始值（已存在則跳過）
  python fetch.py --force-targets # 強制重生 targets.yaml（會覆蓋！）

資料源：yfinance 為主；備援 Stooq / TWSE OpenAPI / TPEx OpenAPI / frankfurter。
所有抓取 3 次重試（指數退避）、主源失敗自動切備援、落地記錄 source 與 fetched_at。
任何標的抓不到 → error 欄位標明，絕不沿用舊價。
"""
from __future__ import annotations

import argparse
import datetime as dt
import io
import json
import math
import sys
import time
from pathlib import Path

import requests
import yaml

import engine

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
CONFIG = ROOT / "config"

UA = {"User-Agent": "Mozilla/5.0 (strategy-cockpit-pro personal use)"}


# ---------------------------------------------------------------- 工具
def now_iso():
    return dt.datetime.now(dt.timezone.utc).astimezone().isoformat(timespec="seconds")


def retry(fn, attempts=3, base_delay=1.0, label=""):
    """3 次重試、指數退避（1s → 2s → 4s）。"""
    last = None
    for i in range(attempts):
        try:
            return fn()
        except Exception as e:  # noqa: BLE001
            last = e
            if i < attempts - 1:
                time.sleep(base_delay * (2 ** i))
    raise RuntimeError(f"{label}: {last}")


def sma(vals, n):
    if len(vals) < n:
        return None
    return round(sum(vals[-n:]) / n, 4)


# ---------------------------------------------------------------- 主源 yfinance
def yf_history(symbol, period="1y"):
    import yfinance as yf
    h = yf.Ticker(symbol).history(period=period, auto_adjust=False)
    closes = [float(c) for c in h["Close"].dropna().tolist()]
    if not closes:
        raise RuntimeError("empty history")
    return closes


# ---------------------------------------------------------------- 備援們
STOOQ_MAP = {"^SOX": "^sox", "QQQ": "qqq.us"}


def stooq_symbol(symbol, category):
    if symbol in STOOQ_MAP:
        return STOOQ_MAP[symbol]
    if category == "us":
        return symbol.lower() + ".us"
    if category == "jp":
        return symbol.split(".")[0].lower() + ".jp"
    return None  # 台股 Stooq 不支援 → 走 TWSE/TPEx


def stooq_history(symbol, category):
    s = stooq_symbol(symbol, category)
    if not s:
        raise RuntimeError("stooq unsupported")
    url = f"https://stooq.com/q/d/l/?s={s}&i=d"
    r = requests.get(url, headers=UA, timeout=15)
    r.raise_for_status()
    rows = [ln.split(",") for ln in io.StringIO(r.text).read().strip().splitlines()[1:]]
    closes = [float(row[4]) for row in rows if len(row) >= 5 and row[4] not in ("", "N/A")]
    if not closes:
        raise RuntimeError("stooq empty")
    return closes[-260:]


_TWSE_CACHE = {}


def twse_quote(symbol):
    """TWSE OpenAPI 只有當日收盤（無歷史）→ 回傳單一收盤價清單。"""
    if "all" not in _TWSE_CACHE:
        url = "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL"
        r = requests.get(url, headers=UA, timeout=20)
        r.raise_for_status()
        _TWSE_CACHE["all"] = {row["Code"]: row for row in r.json()}
    code = symbol.split(".")[0]
    row = _TWSE_CACHE["all"].get(code)
    if not row or not row.get("ClosingPrice"):
        raise RuntimeError("twse missing")
    return [float(row["ClosingPrice"])]


_TPEX_CACHE = {}


def tpex_quote(symbol):
    if "all" not in _TPEX_CACHE:
        url = "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes"
        r = requests.get(url, headers=UA, timeout=20)
        r.raise_for_status()
        _TPEX_CACHE["all"] = {row["SecuritiesCompanyCode"]: row for row in r.json()}
    code = symbol.split(".")[0]
    row = _TPEX_CACHE["all"].get(code)
    if not row or row.get("Close") in (None, "", "----"):
        raise RuntimeError("tpex missing")
    return [float(row["Close"].replace(",", ""))]


def frankfurter_fx(pair):
    """pair: 'TWD=X'(USD/TWD) 或 'JPY=X'(USD/JPY)。"""
    to = "TWD" if pair == "TWD=X" else "JPY"
    r = requests.get(f"https://api.frankfurter.app/latest?from=USD&to={to}",
                     headers=UA, timeout=15)
    r.raise_for_status()
    return [float(r.json()["rates"][to])]


def fallback_history(symbol, category):
    if category in ("tw",):
        return twse_quote(symbol), "twse-openapi"
    if category in ("two",):
        return tpex_quote(symbol), "tpex-openapi"
    if category == "fx":
        return frankfurter_fx(symbol), "frankfurter"
    return stooq_history(symbol, category), "stooq"


# ---------------------------------------------------------------- 單一標的
def fetch_one(symbol, category):
    """回傳 quote dict。主源 yfinance（retry 3×）→ 備援（retry 3×）→ error。"""
    closes, source, err = None, None, None
    try:
        closes = retry(lambda: yf_history(symbol), label=f"yf {symbol}")
        source = "yfinance"
    except Exception as e1:  # noqa: BLE001
        try:
            closes, source = retry(lambda: fallback_history(symbol, category),
                                   label=f"fallback {symbol}")
        except Exception as e2:  # noqa: BLE001
            err = f"primary: {e1} | fallback: {e2}"

    if err:
        return {"symbol": symbol, "category": category, "error": str(err)[:300],
                "price": None, "fetched_at": now_iso(), "source": None}

    price = closes[-1]
    prev = closes[-2] if len(closes) >= 2 else None
    return {
        "symbol": symbol,
        "category": category,
        "price": round(price, 4),
        "prev_close": round(prev, 4) if prev else None,
        "change_pct": round((price / prev - 1) * 100, 2) if prev else None,
        "ma20": sma(closes, 20),
        "ma30": sma(closes, 30),
        "ma60": sma(closes, 60),
        "spark": [round(c, 4) for c in closes[-90:]],
        "partial": len(closes) < 60,  # 備援僅當日價 → 均線缺
        "source": source,
        "fetched_at": now_iso(),
        "error": None,
    }


# ---------------------------------------------------------------- OHLCV 歷史（圖表用）
def sanitize(sym):
    return sym.replace("^", "IDX_").replace("=", "_")


def fetch_ohlcv(symbol):
    """5 年日 K + 當日 5 分 K → dict；任一段失敗回 None 欄位，不整批失敗。"""
    import yfinance as yf
    tk = yf.Ticker(symbol)
    out = {"symbol": symbol, "daily": None, "intraday": None, "fetched_at": now_iso()}
    try:
        d = tk.history(period="5y", auto_adjust=False)
        d = d.dropna(subset=["Close"])
        if len(d):
            out["daily"] = {
                "t": [i.date().isoformat() for i in d.index],
                "o": [round(float(x), 4) for x in d["Open"]],
                "h": [round(float(x), 4) for x in d["High"]],
                "l": [round(float(x), 4) for x in d["Low"]],
                "c": [round(float(x), 4) for x in d["Close"]],
                "v": [int(x) if x == x else 0 for x in d["Volume"]],
            }
    except Exception:  # noqa: BLE001
        pass
    try:
        it = tk.history(period="1d", interval="5m")
        it = it.dropna(subset=["Close"])
        if len(it):
            out["intraday"] = {
                "t": [int(i.timestamp()) for i in it.index],
                "c": [round(float(x), 4) for x in it["Close"]],
                "v": [int(x) if x == x else 0 for x in it["Volume"]],
            }
    except Exception:  # noqa: BLE001
        pass
    return out if (out["daily"] or out["intraday"]) else None


# ---------------------------------------------------------------- 選擇權（僅參考）
def norm_cdf(x):
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def bs_delta(spot, strike, t_years, iv, r=0.045):
    if not iv or iv <= 0 or t_years <= 0:
        return None
    d1 = (math.log(spot / strike) + (r + iv * iv / 2) * t_years) / (iv * math.sqrt(t_years))
    return round(norm_cdf(d1), 3)


def fetch_leaps(symbol, spot, cfg):
    """挑 9–15 個月後到期、delta 0.75–0.85 的 deep ITM Call；失敗回 None。"""
    import yfinance as yf
    try:
        tk = yf.Ticker(symbol)
        today = dt.date.today()
        lo = today + dt.timedelta(days=30 * cfg["min_months"])
        hi = today + dt.timedelta(days=30 * cfg["max_months"])
        exps = [e for e in tk.options
                if lo <= dt.date.fromisoformat(e) <= hi]
        if not exps:
            return None
        exp = exps[len(exps) // 2]
        calls = tk.option_chain(exp).calls
        t_years = (dt.date.fromisoformat(exp) - today).days / 365
        best = None
        for _, row in calls.iterrows():
            k = float(row["strike"])
            if k > spot * 0.95:
                continue
            iv = float(row.get("impliedVolatility") or 0)
            delta = bs_delta(spot, k, t_years, iv)
            if delta is None or not (cfg["delta_low"] <= delta <= cfg["delta_high"]):
                continue
            bid, ask = float(row.get("bid") or 0), float(row.get("ask") or 0)
            mid = (bid + ask) / 2 if bid and ask else float(row.get("lastPrice") or 0)
            if mid <= 0:
                continue
            cand = {"expiry": exp, "strike": k, "mid": round(mid, 2),
                    "delta_est": delta, "iv": round(iv, 3), "fetched_at": now_iso()}
            # 越接近 strike_ratio 越好
            if best is None or abs(k - spot * cfg["strike_ratio"]) < abs(best["strike"] - spot * cfg["strike_ratio"]):
                best = cand
        return best
    except Exception:  # noqa: BLE001
        return None


# ---------------------------------------------------------------- targets.yaml
def ticker_theme_keys(phases):
    """ticker → theme_key（取最早出現的階段）。"""
    out = {}
    for ph in phases["phases"]:
        for th in ph["themes"]:
            for t in th.get("tickers") or []:
                out.setdefault(t, th.get("theme_key", "default"))
    return out


def gen_targets(quotes, phases, settings, path, force=False):
    if path.exists() and not force:
        print(f"[targets] {path} 已存在，跳過（--force-targets 可覆蓋）")
        return
    mult = settings["targets_multipliers"]
    keys = ticker_theme_keys(phases)
    lines = [
        "# 論述目標價（三情境）— 初始值由 fetch.py 以建置時現價自動生成，僅為佔位。",
        "# base = 現價 × 主題倍數；bull = base × 1.35；bear = 現價 × 0.75。",
        "# 請依自己的研究隨時修改。thesis_expiry 到期未兌現 → 前端標灰提醒重估。",
        "targets:",
    ]
    for sym, key in keys.items():
        q = quotes.get(sym) or {}
        p = q.get("price")
        if not p:
            lines.append(f"  {sym}: {{bear: null, base: null, bull: null, "
                         f"thesis_expiry: 2028-07-03}}  # 建置時無報價，請手動補")
            continue
        m = mult.get(key, mult["default"])
        base = round(p * m, 2)
        lines.append(f"  {sym}: {{bear: {round(p*0.75,2)}, base: {base}, "
                     f"bull: {round(base*1.35,2)}, thesis_expiry: 2028-07-03}}"
                     f"  # 佔位初始值：現價 {p} × {m}（{key}）")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"[targets] 已生成 {path}")


# ---------------------------------------------------------------- 主流程
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--init-targets", action="store_true")
    ap.add_argument("--force-targets", action="store_true")
    ap.add_argument("--skip-options", action="store_true")
    ap.add_argument("--skip-history", action="store_true")
    args = ap.parse_args()

    watch = yaml.safe_load((CONFIG / "watchlist.yaml").read_text(encoding="utf-8"))
    settings = yaml.safe_load((CONFIG / "settings.yaml").read_text(encoding="utf-8"))
    phases = yaml.safe_load((CONFIG / "phases.yaml").read_text(encoding="utf-8"))

    quotes = {}
    for category in ("indices", "us", "tw", "two", "jp", "fx"):
        for sym in watch.get(category) or []:
            cat = "fx" if category == "fx" else category
            print(f"fetching {sym} ({cat}) ...", flush=True)
            quotes[sym] = fetch_one(sym, cat)

    # 訊號（^SOX / QQQ 缺料 → signals 為 null，前端顯示資料缺漏）
    sox, qqq = quotes.get("^SOX") or {}, quotes.get("QQQ") or {}
    signals = None
    if sox.get("price") and sox.get("ma30") and sox.get("ma60") \
            and qqq.get("price") and qqq.get("ma30") and qqq.get("ma60"):
        s = engine.detect_regime(sox["price"], sox["ma30"], sox["ma60"],
                                 qqq["price"], qqq["ma30"], qqq["ma60"])
        signals = s.to_dict()
        signals["regime_label"] = engine.REGIME_LABEL[s.regime]

    # 匯率整理
    usdtwd = (quotes.get("TWD=X") or {}).get("price")
    usdjpy = (quotes.get("JPY=X") or {}).get("price")
    fx = {
        "USDTWD": usdtwd,
        "JPYTWD": round(usdtwd / usdjpy, 4) if usdtwd and usdjpy else None,
        "fetched_at": now_iso(),
    }

    # LEAPS（僅美股大市值；失敗 → null，前端顯示「選擇權報價暫缺」）
    options = {}
    if not args.skip_options:
        for sym in settings["leaps"]["symbols"]:
            spot = (quotes.get(sym) or {}).get("price")
            options[sym] = fetch_leaps(sym, spot, settings["leaps"]) if spot else None

    # 每檔 OHLCV 歷史 → data/quotes/*.json（圖表用；fx 不需要）
    hist_index = {}
    if not args.skip_history:
        (DATA / "quotes").mkdir(parents=True, exist_ok=True)
        for sym, q in quotes.items():
            if q.get("category") == "fx" or q.get("error"):
                continue
            h = fetch_ohlcv(sym)
            if h:
                fn = sanitize(sym) + ".json"
                (DATA / "quotes" / fn).write_text(
                    json.dumps(h, ensure_ascii=False), encoding="utf-8")
                hist_index[sym] = fn
        (DATA / "quotes" / "index.json").write_text(
            json.dumps(hist_index, ensure_ascii=False), encoding="utf-8")
        print(f"history: {len(hist_index)} symbols → data/quotes/")

    out = {
        "generated_at": now_iso(),
        "sample": False,
        "signals": signals,
        "fx": fx,
        "quotes": quotes,
        "options": options,
    }

    DATA.mkdir(exist_ok=True)
    (DATA / "history").mkdir(exist_ok=True)
    (DATA / "latest.json").write_text(json.dumps(out, ensure_ascii=False, indent=1),
                                      encoding="utf-8")
    day = dt.date.today().isoformat()
    (DATA / "history" / f"{day}.json").write_text(
        json.dumps(out, ensure_ascii=False), encoding="utf-8")
    idx = sorted(p.stem for p in (DATA / "history").glob("*.json"))
    (DATA / "history" / "index.json").write_text(json.dumps(idx), encoding="utf-8")

    ok = sum(1 for q in quotes.values() if not q.get("error"))
    print(f"done: {ok}/{len(quotes)} symbols ok → data/latest.json")

    if args.init_targets or args.force_targets:
        gen_targets(quotes, phases, settings, CONFIG / "targets.yaml",
                    force=args.force_targets)

    # 有缺料時以非零退出讓 CI 可見（但仍已落地）
    if ok < len(quotes):
        bad = [s for s, q in quotes.items() if q.get("error")]
        print(f"WARN missing: {bad}", file=sys.stderr)


if __name__ == "__main__":
    main()
