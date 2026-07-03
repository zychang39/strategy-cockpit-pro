// 共用元件：水位計、迷你走勢、環圈圖、Segmented、徽章
import { useRef, useEffect } from "preact/hooks";

// ---- 曝險水位計 0–180% ----
export function Gauge({ exposure, regime, label }) {
  const pctv = Math.max(0, Math.min(1.8, exposure));
  const angle = -90 + (pctv / 1.8) * 180;
  const color = regime === "offense" ? "var(--up)" : regime === "reduce" ? "var(--warn)" : "var(--down)";
  const ticks = [];
  for (let i = 0; i <= 6; i++) {
    const a = (-180 + i * 30) * (Math.PI / 180);
    const x1 = 130 + 100 * Math.cos(a), y1 = 120 + 100 * Math.sin(a);
    const x2 = 130 + 90 * Math.cos(a), y2 = 120 + 90 * Math.sin(a);
    const lx = 130 + 76 * Math.cos(a), ly = 120 + 76 * Math.sin(a);
    ticks.push(
      <g key={i}>
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--text-3)" stroke-width="2" />
        <text x={lx} y={ly + 4} text-anchor="middle" font-size="10" fill="var(--text-2)">{i * 30}</text>
      </g>
    );
  }
  return (
    <div class="gauge-wrap">
      <svg width="260" height="140" viewBox="0 0 260 140" role="img"
        aria-label={`目標總曝險 ${(pctv * 100).toFixed(0)}%`}>
        <path d="M 30 120 A 100 100 0 0 1 230 120" fill="none" stroke="var(--fill-2)" stroke-width="14" stroke-linecap="round" />
        <path d="M 30 120 A 100 100 0 0 1 230 120" fill="none" stroke={color} stroke-width="14" stroke-linecap="round"
          stroke-dasharray={`${(pctv / 1.8) * 314} 314`} style="transition: stroke-dasharray 0.9s cubic-bezier(0.34,1.4,0.44,1)" />
        {ticks}
        <g class="gauge-needle" style={`transform: rotate(${angle}deg)`}>
          <line x1="130" y1="120" x2="130" y2="38" stroke="var(--text)" stroke-width="3" stroke-linecap="round" />
          <circle cx="130" cy="120" r="7" fill="var(--text)" />
        </g>
      </svg>
      <div class="num" style="font-size:30px;font-weight:700;margin-top:-4px">{(pctv * 100).toFixed(0)}%</div>
      <div class="cap">{label || "目標總曝險"}</div>
    </div>
  );
}

export const RegimeBadge = ({ regime, label }) => (
  <span class={"badge " + (regime === "offense" ? "up" : regime === "reduce" ? "warn" : "down")}>
    {regime === "offense" ? "▲" : regime === "reduce" ? "◆" : "▼"} {label}
  </span>
);

// ---- 迷你走勢圖（含 30/60MA）----
export function Spark({ data, width = 320, height = 72, ma30, ma60 }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv || !data?.length) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = width * dpr; cv.height = height * dpr;
    const ctx = cv.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    const series = [data];
    const roll = (n) => data.map((_, i) => i >= n - 1 ? data.slice(i - n + 1, i + 1).reduce((s, v) => s + v, 0) / n : null);
    const m30 = ma30 !== false ? roll(30) : null;
    const m60 = ma60 !== false ? roll(60) : null;
    const all = data.concat((m30 || []).filter(Boolean), (m60 || []).filter(Boolean));
    const min = Math.min(...all), max = Math.max(...all);
    const x = (i) => (i / (data.length - 1)) * (width - 4) + 2;
    const y = (v) => height - 6 - ((v - min) / (max - min || 1)) * (height - 12);
    const line = (arr, color, w) => {
      ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = w;
      let started = false;
      arr.forEach((v, i) => {
        if (v == null) return;
        if (!started) { ctx.moveTo(x(i), y(v)); started = true; } else ctx.lineTo(x(i), y(v));
      });
      ctx.stroke();
    };
    if (m60) line(m60, "rgba(120,120,128,0.55)", 1);
    if (m30) line(m30, "rgba(10,132,255,0.8)", 1);
    const up = data[data.length - 1] >= data[0];
    line(data, up ? "#ff453a" : "#30d158", 1.8);
  }, [data, width, height]);
  return <canvas ref={ref} class="spark" style={{ width: width + "px", height: height + "px" }} />;
}

// ---- 主題權重環圈圖 ----
const DONUT_COLORS = ["#0a84ff", "#ff9f0a", "#bf5af2", "#ff453a", "#30d158", "#64d2ff", "#ffd60a", "#ff375f"];
export function Donut({ items, size = 200 }) {
  const total = items.reduce((s, i) => s + i.weight, 0) || 1;
  const r = 70, cx = size / 2, cy = size / 2;
  let acc = 0;
  const arcs = items.map((it, idx) => {
    const a0 = (acc / total) * Math.PI * 2 - Math.PI / 2;
    acc += it.weight;
    const a1 = (acc / total) * Math.PI * 2 - Math.PI / 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (a) => `${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`;
    return (
      <path key={idx} d={`M ${p(a0)} A ${r} ${r} 0 ${large} 1 ${p(a1)}`}
        fill="none" stroke={DONUT_COLORS[idx % DONUT_COLORS.length]} stroke-width="26" />
    );
  });
  return (
    <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>{arcs}</svg>
      <div class="col" style="gap:6px">
        {items.map((it, idx) => (
          <div key={idx} style="display:flex;align-items:center;gap:8px;font-size:13px">
            <span style={`width:10px;height:10px;border-radius:3px;background:${DONUT_COLORS[idx % DONUT_COLORS.length]};display:inline-block`} />
            <span>{it.name}</span>
            <span class="num muted">{(it.weight * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Segmented({ options, value, onChange }) {
  return (
    <div class="seg" role="tablist">
      {options.map((o) => (
        <button key={o.value} class={value === o.value ? "active" : ""}
          onClick={() => onChange(o.value)} role="tab" aria-selected={value === o.value}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const SourceBadge = ({ q }) =>
  q?.error ? <span class="badge up">資料缺漏</span>
    : q?.partial ? <span class="badge warn">僅當日價（均線缺）</span>
      : <span class="badge">{q?.source || "—"}</span>;
