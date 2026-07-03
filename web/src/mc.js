// 蒙地卡羅情境模擬 — 10,000 條兩年路徑（§5）
function randn(rng) {
  // Box–Muller
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// 可重現的 PRNG（mulberry32）
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DEFAULT_PARAMS = {
  paths: 10000,
  probBull: 0.35, probBase: 0.40, probBear: 0.25,
  bull: { mu: 0.70, sigma: 0.20 },
  base: { mu: 0.25, sigma: 0.12 },
  bear: { mu: -0.22, sigma: 0.10 },
  gapProb: 0.25, gapSize: -0.10,
  leverage: 1.3, costPerYear: 0.02, years: 2,
};

export function simulate(p = DEFAULT_PARAMS, seed = 42) {
  const rng = mulberry32(seed);
  const n = p.paths;
  const out = new Float64Array(n);
  const pb = p.probBull, pm = pb + p.probBase;
  const L = p.leverage;
  const cost = p.costPerYear * p.years * Math.max(L - 1, 0);
  for (let i = 0; i < n; i++) {
    const u = rng();
    const sc = u < pb ? p.bull : u < pm ? p.base : p.bear;
    let r = sc.mu + sc.sigma * randn(rng);
    if (sc === p.bear && rng() < p.gapProb) r += p.gapSize;
    let lev = r * L - cost;
    if (lev < -1) lev = -1; // 全損下限
    out[i] = lev;
  }
  const sorted = Float64Array.from(out).sort();
  const mean = out.reduce((s, v) => s + v, 0) / n;
  const q = (x) => sorted[Math.min(n - 1, Math.floor(x * n))];
  return {
    samples: sorted, mean,
    median: q(0.5), var5: q(0.05), worst1: q(0.01),
    pLoss: sorted.filter((v) => v < 0).length / n,
  };
}

// 直方圖分箱（供 canvas 畫圖）
export function histogram(sorted, bins = 60, lo = -1, hi = 2) {
  const h = new Array(bins).fill(0);
  const w = (hi - lo) / bins;
  for (const v of sorted) {
    const idx = Math.max(0, Math.min(bins - 1, Math.floor((v - lo) / w)));
    h[idx]++;
  }
  return { counts: h, lo, hi, w, max: Math.max(...h) };
}
