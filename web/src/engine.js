// engine.py 的 JS 鏡像 + 下單換算 buildOrders。改規則時兩邊同步改。
export const OFFENSE = "offense", REDUCE = "reduce", DEFENSE = "defense";
export const REGIME_LABEL = { offense: "進攻", reduce: "減碼", defense: "防守" };

// ---- §2.1 修飾（使用者狀態端）----
export function applyModifiers(signals, levCap = 1.8, falsifiedAny = false, drawdown = 0) {
  let position = signals.base_position;
  let leverage = Math.min(signals.base_leverage, levCap);
  const notes = [];
  let falsified = false, breaker = null;

  if (falsifiedAny) {
    falsified = true;
    position = Math.max(position - 0.20, 0);
    leverage = 1.0;
    notes.push("論述證偽：持股水位 −20pp、槓桿鎖 1.0×");
  }
  if (drawdown <= -0.15) {
    breaker = "force_delever";
    leverage = 1.0;
    notes.push("回撤 −15%：槓桿歸 1.0×，僅保留現股");
  } else if (drawdown <= -0.10) {
    breaker = "review";
    notes.push("回撤 −10%：請重新檢視槓桿");
  }
  return { position, leverage, exposure: position * leverage, falsified, breaker, notes };
}

// ---- §2.3 限價 ----
export function twTick(p) {
  let t;
  if (p < 10) t = 0.01; else if (p < 50) t = 0.05; else if (p < 100) t = 0.1;
  else if (p < 500) t = 0.5; else if (p < 1000) t = 1; else t = 5;
  return Math.floor(p / t + 1e-9) * t;
}

export function limitPrice(price, ma20, ma60, regime, isTw = false) {
  if (regime === DEFENSE) return { mode: "watch", value: ma60 ?? null };
  const base = ma20 ? Math.min(price, ma20) : price;
  let v = base * 0.995;
  if (isTw) v = twTick(v);
  return { mode: "buy", value: Math.round(v * 100) / 100 };
}

// ---- §2.2 換算 ----
const LOT = { tw: 1000, two: 1000, jp: 100, us: 1 };
export const roundShares = (qty, category) => {
  const lot = LOT[category] || 1;
  return Math.floor(qty / lot) * lot;
};

export const splitLayers = (capital, exposure) => ({
  equity: capital * Math.min(exposure, 1),
  gap: capital * Math.max(exposure - 1, 0),
});

export function themeAlloc(themes, amount, rotation = false) {
  const out = {};
  for (const th of themes) {
    const ts = th.tickers || [];
    if (!ts.length) continue;
    if (th.rotation_only && !rotation) continue;
    const per = (amount * th.weight) / ts.length;
    for (const t of ts) {
      if (!out[t]) out[t] = { amount: 0, theme: th };
      out[t].amount += per;
    }
  }
  return out;
}

export function marginPlanTw(amount, price, initial = 0.4, alert = 1.3) {
  const loanRatio = 1 - initial;
  const alertPrice = price * alert * loanRatio;
  return {
    loan: amount * loanRatio, selfFunded: amount * initial,
    alertPrice, alertDropPct: (alertPrice / price - 1) * 100,
  };
}

export function marginPlanUs(amount, price, maintenance = 0.3) {
  const alertPrice = price * (1 / (2 * (1 - maintenance)));
  return { loan: amount, alertPrice, alertDropPct: (alertPrice / price - 1) * 100 };
}

export function leapsPlan(gapUsd, price, delta = 0.8, strikeRatio = 0.8, opt = null) {
  const strike = opt?.strike ?? (Math.round((price * strikeRatio) / 5) * 5 || Math.round(price * strikeRatio * 10) / 10);
  const d = opt?.delta_est ?? delta;
  const perContract = d * 100 * price;
  const contracts = perContract > 0 ? Math.floor(gapUsd / perContract) : 0;
  const premiumEach = opt?.mid ?? (price - strike + price * 0.08);
  const premiumTotal = premiumEach * 100 * contracts;
  return {
    strike, delta: d, contracts, perContract,
    premiumEach, premiumTotal, maxLoss: premiumTotal,
    expiry: opt?.expiry ?? null, live: !!opt,
  };
}

export const expectedReturns = (price, t) => {
  if (!price || !t) return null;
  const r = (v) => (v == null ? null : (v / price - 1) * 100);
  return { bear: r(t.bear), base: r(t.base), bull: r(t.bull) };
};

// ---- 階段選定 ----
export function currentPhase(phases, dateStr, overrideId = null) {
  const list = phases?.phases || [];
  if (overrideId != null) return list.find((p) => p.id === overrideId) || list[0];
  const d = dateStr || new Date().toISOString().slice(0, 10);
  return list.find((p) => String(p.start) <= d && d <= String(p.end))
    || (d < String(list[0]?.start) ? list[0] : list[list.length - 1]);
}

// ---- 下單頁主計算：每檔 → 目標市值/股數/限價/預期報酬/方案 A/B ----
export function buildOrders({ capital, directive, regime, rotation, phase, quotes, fx, targets, settings, options }) {
  const { equity, gap } = splitLayers(capital, directive.exposure);
  const eqAlloc = themeAlloc(phase.themes, equity, rotation);
  const gapAlloc = regime === DEFENSE || directive.leverage <= 1
    ? {} : themeAlloc(phase.themes, gap, rotation);

  const m = settings?.margin || {};
  const leapsCfg = settings?.leaps || {};
  const leapsSet = new Set(leapsCfg.symbols || []);
  const orders = [];

  for (const [sym, { amount, theme }] of Object.entries(eqAlloc)) {
    const q = quotes?.[sym];
    const rate = q ? { us: fx?.USDTWD, jp: fx?.JPYTWD, tw: 1, two: 1 }[q.category] : null;
    const o = {
      symbol: sym, theme: theme.name, hold: theme.hold || "—", exit: theme.exit || "—",
      targetValueTwd: amount, quote: q || null, missing: !q || !!q.error || q.price == null,
      gapValueTwd: gapAlloc[sym]?.amount || 0,
    };
    if (!o.missing && rate) {
      const isTw = q.category === "tw" || q.category === "two";
      const localAmount = amount / rate;
      o.shares = roundShares(localAmount / q.price, q.category);
      o.actualValueTwd = o.shares * q.price * rate;
      o.limit = limitPrice(q.price, q.ma20, q.ma60, regime, isTw);
      o.expected = expectedReturns(q.price, targets?.[sym]);
      o.thesisExpired = targets?.[sym]?.thesis_expiry
        ? String(targets[sym].thesis_expiry) < new Date().toISOString().slice(0, 10) : false;
      if (o.gapValueTwd > 0) {
        o.planA = isTw
          ? { type: "tw", ...marginPlanTw(o.gapValueTwd, q.price, m.tw_initial ?? 0.4, m.tw_maintenance_alert ?? 1.3), rate: m.tw_rate ?? 0.065 }
          : { type: "us", ...marginPlanUs(o.gapValueTwd, q.price, m.us_maintenance ?? 0.3), rate: m.us_rate ?? 0.07 };
        if (q.category === "us" && leapsSet.has(sym)) {
          o.planB = leapsPlan(o.gapValueTwd / (fx?.USDTWD || 1), q.price,
            (leapsCfg.delta_low + leapsCfg.delta_high) / 2 || 0.8,
            leapsCfg.strike_ratio ?? 0.8, options?.[sym] || null);
        }
      }
    }
    orders.push(o);
  }
  orders.sort((a, b) => b.targetValueTwd - a.targetValueTwd);

  const cashTheme = (phase.themes || []).find((t) => !(t.tickers || []).length);
  const investedEq = Object.values(eqAlloc).reduce((s, v) => s + v.amount, 0);
  return {
    orders, equity, gap,
    cash: capital - investedEq,
    cashWeight: cashTheme?.weight ?? 0,
  };
}

// ---- 與現況差異（對照追蹤頁登記的實際持倉）----
export function diffHoldings(orders, holdings) {
  const held = Object.fromEntries((holdings || []).map((h) => [h.symbol, h.shares]));
  const diffs = [];
  for (const o of orders) {
    if (o.missing || o.shares == null) continue;
    const cur = held[o.symbol] || 0;
    const d = o.shares - cur;
    if (d !== 0) diffs.push({ symbol: o.symbol, action: d > 0 ? "加碼" : "減碼", shares: Math.abs(d) });
    delete held[o.symbol];
  }
  for (const [sym, sh] of Object.entries(held)) {
    if (sh > 0) diffs.push({ symbol: sym, action: "出清（不在本階段配置）", shares: sh });
  }
  return diffs;
}

// ---- 追蹤頁：回撤 ----
export function drawdownStats(navRecords) {
  if (!navRecords?.length) return { drawdown: 0, peak: null, last: null, ret: null, maxDD: 0 };
  let peak = -Infinity, maxDD = 0;
  for (const r of navRecords) {
    peak = Math.max(peak, r.amount);
    maxDD = Math.min(maxDD, r.amount / peak - 1);
  }
  const last = navRecords[navRecords.length - 1].amount;
  const first = navRecords[0].amount;
  const curPeak = Math.max(...navRecords.map((r) => r.amount));
  return {
    drawdown: last / curPeak - 1, maxDD,
    peak: curPeak, last, ret: last / first - 1,
  };
}
