// 情境：新手友好版——三個預設劇本 + 白話結果 + 進階參數（可摺疊）
import { useState, useMemo } from "preact/hooks";
import { simulate, histogram, DEFAULT_PARAMS } from "../mc.js";
import { twd, pct, num } from "../fmt.js";
import { useRef, useEffect } from "preact/hooks";

const PRESETS = [
  { id: "base", label: "講者基準", desc: "牛 35%／基準 40%／熊 25%——直播論述的原始假設",
    p: { probBull: 0.35, probBear: 0.25 } },
  { id: "cautious", label: "保守", desc: "牛 20%／基準 40%／熊 40%——假設論述多半不兌現",
    p: { probBull: 0.20, probBear: 0.40 } },
  { id: "bullish", label: "樂觀", desc: "牛 50%／基準 35%／熊 15%——假設檢查點多數驗證成功",
    p: { probBull: 0.50, probBear: 0.15 } },
];

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
    const x0 = pad + ((0 - (-1)) / 3) * (width - 2 * pad);
    ctx.strokeStyle = "rgba(120,120,128,0.4)"; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(x0, 8); ctx.lineTo(x0, height - 16); ctx.stroke();
    ctx.setLineDash([]);
    for (const [lev, res] of Object.entries(runs)) {
      const h = histogram(res.samples, 72, -1, 2);
      ctx.beginPath(); ctx.strokeStyle = colors[lev] || "#999"; ctx.lineWidth = 1.8;
      h.counts.forEach((cnt, i) => {
        const x = pad + (i / 72) * (width - 2 * pad);
        const y = height - 16 - (cnt / h.max) * (height - 32);
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
  const { user } = st;
  const [preset, setPreset] = useState("base");
  const [p, setP] = useState({ ...DEFAULT_PARAMS, leverage: Math.min(user.levCap || 1.3, 1.8) });
  const set = (k) => (v) => setP((old) => ({ ...old, [k]: v }));
  const pickPreset = (pr) => { setPreset(pr.id); setP((old) => ({ ...old, ...pr.p })); };

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
      <p class="cap" style="margin:-8px 0 12px">
        用 10,000 次隨機模擬回答一個問題：<b>照這套策略做兩年，我的錢會怎樣？</b>
        每次模擬先擲骰子決定市場劇本（牛/基準/熊），再抽一個該劇本下的報酬。
      </p>

      <div class="preset-row">
        {PRESETS.map((pr) => (
          <button key={pr.id} class={"preset " + (preset === pr.id ? "active" : "")}
            onClick={() => pickPreset(pr)}>
            <strong>{pr.label}</strong>
            <span class="cap3">{pr.desc}</span>
          </button>
        ))}
      </div>

      <div class="card">
        <div class="row"><strong>兩年後，本金 {twd(cap)} 會變成…</strong></div>
        <div class="result-grid">
          <div class="rcell">
            <div class="cap">一般情況（中位數）</div>
            <div class={"num rbig " + (main.median >= 0 ? "chg-up" : "chg-down")}>{twd(cap * (1 + main.median))}</div>
            <div class="cap3">{pct(main.median * 100)}——一半的模擬比這好、一半比這差</div>
          </div>
          <div class="rcell">
            <div class="cap">平均（期望值）</div>
            <div class={"num rbig " + (main.mean >= 0 ? "chg-up" : "chg-down")}>{twd(cap * (1 + main.mean))}</div>
            <div class="cap3">{pct(main.mean * 100)}——被少數大賺的路徑拉高，別當成「應得」</div>
          </div>
          <div class="rcell">
            <div class="cap">倒楣情況（最差 5%）</div>
            <div class="num rbig chg-down">{twd(cap * (1 + main.var5))}</div>
            <div class="cap3">{pct(main.var5 * 100)}——每 20 次有 1 次比這更糟（5% VaR）</div>
          </div>
          <div class="rcell">
            <div class="cap">災難情況（最差 1%）</div>
            <div class="num rbig chg-down">{twd(cap * (1 + main.worst1))}</div>
            <div class="cap3">{pct(main.worst1 * 100)}——先問自己：發生時睡得著嗎？</div>
          </div>
        </div>
        <hr class="sep" />
        <div class="kv"><span class="k">兩年後虧錢的機率</span>
          <span class="v num" style="font-weight:700">{(main.pLoss * 100).toFixed(0)}%</span></div>
      </div>

      <div class="card">
        <Slider label={"我的槓桿（目前配置 " + (user.levCap || 1.3).toFixed(1) + "×）"} value={p.leverage}
          min={1} max={1.8} step={0.1} onChange={set("leverage")} fmt={(v) => v.toFixed(1) + "×"} />
        <div class="cap" style="margin:10px 0 6px">槓桿 1.0（綠）/ 1.3（藍）/ 1.8（紅）的結果分佈疊圖——右尾變胖的同時，左尾胖得更快：</div>
        <HistChart runs={overlay} />
        <div class="cap3">虛線＝損益兩平。曲線越往左延伸，代表大虧的可能性越高。這就是槓桿的代價。</div>
      </div>

      <details class="thesis">
        <summary>進階參數（機率與報酬假設）</summary>
        <div class="thesis-body">
          <Slider label="牛市機率" value={p.probBull} min={0} max={0.7} step={0.05}
            onChange={(v) => { setPreset(null); set("probBull")(v); }} fmt={(v) => (v * 100).toFixed(0) + "%"} />
          <Slider label="熊市機率" value={p.probBear} min={0} max={0.7} step={0.05}
            onChange={(v) => { setPreset(null); set("probBear")(v); }} fmt={(v) => (v * 100).toFixed(0) + "%"} />
          <div class="cap3">基準情境機率自動 = {(probBase * 100).toFixed(0)}%（三者加總 100%）</div>
          <hr class="sep" />
          <Slider label="牛市兩年平均報酬" value={p.bull.mu} min={0.2} max={1.2} step={0.05}
            onChange={(v) => setP((o) => ({ ...o, bull: { ...o.bull, mu: v } }))} fmt={(v) => pct(v * 100)} />
          <Slider label="基準兩年平均報酬" value={p.base.mu} min={-0.1} max={0.6} step={0.05}
            onChange={(v) => setP((o) => ({ ...o, base: { ...o.base, mu: v } }))} fmt={(v) => pct(v * 100)} />
          <Slider label="熊市兩年平均報酬" value={p.bear.mu} min={-0.6} max={0.1} step={0.02}
            onChange={(v) => setP((o) => ({ ...o, bear: { ...o.bear, mu: v } }))} fmt={(v) => pct(v * 100)} />
          <Slider label="熊市跳空事件機率（額外 −10%）" value={p.gapProb} min={0} max={0.6} step={0.05}
            onChange={set("gapProb")} fmt={(v) => (v * 100).toFixed(0) + "%"} />
          <Slider label="融資成本（年利率 × 借款比）" value={p.costPerYear} min={0} max={0.08} step={0.005}
            onChange={set("costPerYear")} fmt={(v) => (v * 100).toFixed(1) + "%"} />
          <div class="cap3">「平均報酬」是該劇本下兩年總報酬的中心值；實際每次模擬還會加上隨機波動（常態分佈）。</div>
        </div>
      </details>
    </div>
  );
}
