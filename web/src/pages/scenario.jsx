// 情境：蒙地卡羅模擬（10,000 條兩年路徑）+ 槓桿三檔疊圖
import { useState, useEffect, useRef, useMemo } from "preact/hooks";
import { simulate, histogram, DEFAULT_PARAMS } from "../mc.js";
import { twd, pct, num } from "../fmt.js";

function HistChart({ runs, width = 340, height = 180 }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = width * dpr; cv.height = height * dpr;
    const ctx = cv.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    const colors = { "1": "#30d158", "1.3": "#0a84ff", "1.8": "#ff453a" };
    const pad = 18;
    // 0% 基準線
    const x0 = pad + ((0 - (-1)) / 3) * (width - 2 * pad);
    ctx.strokeStyle = "rgba(120,120,128,0.4)"; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(x0, 8); ctx.lineTo(x0, height - 16); ctx.stroke();
    ctx.setLineDash([]);
    for (const [lev, res] of Object.entries(runs)) {
      const h = histogram(res.samples, 72, -1, 2);
      ctx.beginPath();
      ctx.strokeStyle = colors[lev] || "#999";
      ctx.lineWidth = lev === "main" ? 2.5 : 1.5;
      h.counts.forEach((c, i) => {
        const x = pad + (i / 72) * (width - 2 * pad);
        const y = height - 16 - (c / h.max) * (height - 32);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(120,120,128,0.9)"; ctx.font = "10px -apple-system";
    ["-100%", "-50%", "0%", "+50%", "+100%", "+150%", "+200%"].forEach((t, i) => {
      ctx.fillText(t, pad + (i / 6) * (width - 2 * pad) - 10, height - 3);
    });
  }, [runs, width, height]);
  return <canvas ref={ref} style={{ width: width + "px", height: height + "px" }} />;
}

const Slider = ({ label, value, min, max, step, onChange, fmt }) => (
  <div style="margin-bottom:8px">
    <div class="row"><span class="cap">{label}</span><b class="num">{fmt ? fmt(value) : value}</b></div>
    <input type="range" min={min} max={max} step={step} value={value}
      onInput={(e) => onChange(Number(e.currentTarget.value))} />
  </div>
);

export function Scenario({ st }) {
  const { user, config } = st;
  const [p, setP] = useState({ ...DEFAULT_PARAMS });
  const set = (k) => (v) => setP((old) => ({ ...old, [k]: v }));

  // 機率正規化（bull/bear 可調，base 吃剩餘）
  const probBase = Math.max(0, 1 - p.probBull - p.probBear);
  const params = { ...p, probBase };

  const { main, overlay } = useMemo(() => {
    const main = simulate(params, 42);
    const overlay = {};
    for (const L of [1, 1.3, 1.8]) overlay[String(L)] = simulate({ ...params, leverage: L }, 42);
    return { main, overlay };
  }, [JSON.stringify(params)]);

  const cap = user.capital || 1_000_000;

  return (
    <div>
      <h2 class="lt">情境</h2>

      <div class="card">
        <div class="cap" style="margin-bottom:8px">兩年報酬分佈 — 槓桿 1.0（綠）/ 1.3（藍）/ 1.8（紅）疊圖，虛線為損益兩平</div>
        <HistChart runs={overlay} />
        <div class="cap3">槓桿放大右尾的同時，左尾（最差情況）被放大得更快——這是代價。</div>
      </div>

      <div class="card">
        <div class="cap" style="margin-bottom:8px">你的參數（槓桿 {p.leverage.toFixed(1)}×）模擬結果 · 10,000 條路徑</div>
        <div class="grid2">
          <div class="kv"><span class="k">期望值</span><span class="v num">{pct(main.mean * 100)}</span></div>
          <div class="kv"><span class="k">中位數</span><span class="v num">{pct(main.median * 100)}</span></div>
          <div class="kv"><span class="k">5% VaR</span><span class="v chg-down num">{pct(main.var5 * 100)}</span></div>
          <div class="kv"><span class="k">虧損機率</span><span class="v num">{pct(main.pLoss * 100, 1, false)}</span></div>
        </div>
        <hr class="sep" />
        <div class="kv"><span class="k">期望終值（本金 {twd(cap)}）</span>
          <span class="v">{twd(cap * (1 + main.mean))}</span></div>
        <div class="kv"><span class="k">1% 最差剩餘資金</span>
          <span class="v chg-down">{twd(cap * (1 + main.worst1))}</span></div>
      </div>

      <div class="card">
        <div class="cap" style="margin-bottom:8px">參數（皆可調）</div>
        <Slider label="平均槓桿" value={p.leverage} min={1} max={1.8} step={0.1}
          onChange={set("leverage")} fmt={(v) => v.toFixed(1) + "×"} />
        <Slider label="牛市機率" value={p.probBull} min={0} max={0.7} step={0.05}
          onChange={set("probBull")} fmt={(v) => (v * 100).toFixed(0) + "%"} />
        <Slider label="熊市機率" value={p.probBear} min={0} max={0.7} step={0.05}
          onChange={set("probBear")} fmt={(v) => (v * 100).toFixed(0) + "%"} />
        <div class="cap3">基準情境機率 = {(probBase * 100).toFixed(0)}%（自動）</div>
        <hr class="sep" />
        <Slider label="牛市平均報酬 μ" value={p.bull.mu} min={0.2} max={1.2} step={0.05}
          onChange={(v) => setP((o) => ({ ...o, bull: { ...o.bull, mu: v } }))} fmt={(v) => pct(v * 100)} />
        <Slider label="基準平均報酬 μ" value={p.base.mu} min={-0.1} max={0.6} step={0.05}
          onChange={(v) => setP((o) => ({ ...o, base: { ...o.base, mu: v } }))} fmt={(v) => pct(v * 100)} />
        <Slider label="熊市平均報酬 μ" value={p.bear.mu} min={-0.6} max={0.1} step={0.02}
          onChange={(v) => setP((o) => ({ ...o, bear: { ...o.bear, mu: v } }))} fmt={(v) => pct(v * 100)} />
        <Slider label="熊市跳空事件機率（額外 −10%）" value={p.gapProb} min={0} max={0.6} step={0.05}
          onChange={set("gapProb")} fmt={(v) => (v * 100).toFixed(0) + "%"} />
        <Slider label="融資成本（年 × 借款比）" value={p.costPerYear} min={0} max={0.08} step={0.005}
          onChange={set("costPerYear")} fmt={(v) => (v * 100).toFixed(1) + "%"} />
      </div>
    </div>
  );
}
