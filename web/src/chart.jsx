// Apple Stock 式互動圖表：範圍切換、成交量、MA、單指按住看價、雙指/拖曳看區間漲跌
import { useRef, useEffect, useState, useMemo } from "preact/hooks";
import { num, pct } from "./fmt.js";

export const sanitize = (sym) => sym.replace("^", "IDX_").replace("=", "_");

const RANGES = [
  { id: "1D", label: "1天" }, { id: "1W", label: "1週" }, { id: "1M", label: "1月" },
  { id: "3M", label: "3月" }, { id: "6M", label: "6月" }, { id: "YTD", label: "今年" },
  { id: "1Y", label: "1年" }, { id: "5Y", label: "5年" },
];
const DAYS = { "1W": 5, "1M": 22, "3M": 66, "6M": 130, "1Y": 252 };

function slice(hist, range) {
  // 回傳 {t[], c[], v[], ma20[], ma60[], isIntraday}
  if (range === "1D") {
    const it = hist?.intraday;
    if (!it?.c?.length) return null;
    return { t: it.t.map((x) => x * 1000), c: it.c, v: it.v, isIntraday: true };
  }
  const d = hist?.daily;
  if (!d?.c?.length) return null;
  const n = d.c.length;
  let i0;
  if (range === "YTD") {
    const y = new Date().getFullYear() + "";
    i0 = d.t.findIndex((x) => x.startsWith(y));
    if (i0 < 0) i0 = Math.max(0, n - 22);
  } else if (range === "5Y") i0 = 0;
  else i0 = Math.max(0, n - (DAYS[range] || 66));
  // MA 用全序列計算再切片（前緣不缺值）
  const roll = (k) => d.c.map((_, i) => i >= k - 1
    ? d.c.slice(i - k + 1, i + 1).reduce((s, x) => s + x, 0) / k : null);
  const showMA = ["3M", "6M", "YTD", "1Y", "5Y"].includes(range);
  const m20 = showMA ? roll(20).slice(i0) : null;
  const m60 = showMA ? roll(60).slice(i0) : null;
  return { t: d.t.slice(i0), c: d.c.slice(i0), v: (d.v || []).slice(i0), ma20: m20, ma60: m60 };
}

const fmtDate = (t, intraday) => {
  if (intraday) {
    const d = new Date(t);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  return String(t);
};

export function RangeChart({ hist, fallbackSpark, currency = "", height = 260 }) {
  const [range, setRange] = useState("3M");
  const [cursor, setCursor] = useState(null);   // {a, b|null}（索引）
  const wrapRef = useRef(null);
  const cvRef = useRef(null);
  const [width, setWidth] = useState(360);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const usingFallback = !hist?.daily && !!fallbackSpark?.length;
  const series = useMemo(() => {
    if (usingFallback) {
      const n = fallbackSpark.length;
      const k = { "1W": 5, "1M": 22, "3M": 66 }[range] ?? Math.min(66, n);
      return { t: Array.from({ length: Math.min(k, n) }, (_, i) => `T-${Math.min(k, n) - i}`),
               c: fallbackSpark.slice(-k), v: [], fallback: true };
    }
    return slice(hist, range);
  }, [hist, range, usingFallback, fallbackSpark]);

  // 可用的範圍按鈕
  const avail = (id) => {
    if (usingFallback) return ["1W", "1M", "3M"].includes(id);
    if (id === "1D") return !!hist?.intraday?.c?.length;
    return !!hist?.daily?.c?.length;
  };

  // ---- 指標數字（頂部資訊列）----
  const info = useMemo(() => {
    if (!series?.c?.length) return null;
    const c = series.c;
    const first = c[0], last = c[c.length - 1];
    if (cursor) {
      const a = Math.min(cursor.a, cursor.b ?? cursor.a);
      const b = Math.max(cursor.a, cursor.b ?? cursor.a);
      if (cursor.b != null && b > a) {
        return { mode: "interval", from: series.t[a], to: series.t[b],
                 pa: c[a], pb: c[b], chg: (c[b] / c[a] - 1) * 100 };
      }
      return { mode: "point", at: series.t[a], p: c[a], chg: (c[a] / first - 1) * 100 };
    }
    return { mode: "range", p: last, chg: (last / first - 1) * 100,
             hi: Math.max(...c), lo: Math.min(...c) };
  }, [series, cursor]);

  // ---- 繪圖 ----
  useEffect(() => {
    const cv = cvRef.current;
    if (!cv || !series?.c?.length) return;
    const dpr = window.devicePixelRatio || 1;
    const W = width, H = height;
    cv.width = W * dpr; cv.height = H * dpr;
    const ctx = cv.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const c = series.c, n = c.length;
    const volH = series.v?.length ? 42 : 0;
    const padT = 8, padB = 18 + volH, padX = 2;
    const priceH = H - padT - padB;
    const all = c.concat((series.ma20 || []).filter(Boolean), (series.ma60 || []).filter(Boolean));
    const lo = Math.min(...all), hi = Math.max(...all);
    const X = (i) => padX + (i / (n - 1)) * (W - 2 * padX);
    const Y = (v) => padT + (1 - (v - lo) / (hi - lo || 1)) * priceH;

    const up = c[n - 1] >= c[0];
    const cs = getComputedStyle(document.documentElement);
    const upC = cs.getPropertyValue("--up").trim() || "#ff453a";
    const dnC = cs.getPropertyValue("--down").trim() || "#30d158";
    const main = up ? upC : dnC;

    // 漸層填色
    const grad = ctx.createLinearGradient(0, padT, 0, padT + priceH);
    grad.addColorStop(0, main + "33"); grad.addColorStop(1, main + "00");
    ctx.beginPath();
    c.forEach((v, i) => i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v)));
    ctx.lineTo(X(n - 1), padT + priceH); ctx.lineTo(X(0), padT + priceH); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();

    // 成交量
    if (volH) {
      const vmax = Math.max(...series.v, 1);
      const bw = Math.max(1, (W - 2 * padX) / n - 1);
      series.v.forEach((v, i) => {
        const h = (v / vmax) * (volH - 6);
        ctx.fillStyle = (i && series.c[i] >= series.c[i - 1] ? upC : dnC) + "55";
        ctx.fillRect(X(i) - bw / 2, H - 18 - h, bw, h);
      });
    }

    // MA 線
    const drawLine = (arr, color, w) => {
      ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = w;
      let started = false;
      arr.forEach((v, i) => {
        if (v == null) return;
        started ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v));
        started = true;
      });
      ctx.stroke();
    };
    if (series.ma60) drawLine(series.ma60, "rgba(120,120,128,0.6)", 1);
    if (series.ma20) drawLine(series.ma20, "rgba(10,132,255,0.85)", 1);
    drawLine(c, main, 2);

    // 游標 / 區間
    if (cursor) {
      const a = Math.min(cursor.a, cursor.b ?? cursor.a);
      const b = Math.max(cursor.a, cursor.b ?? cursor.a);
      if (cursor.b != null && b > a) {
        ctx.fillStyle = "rgba(120,120,128,0.18)";
        ctx.fillRect(X(a), padT, X(b) - X(a), priceH);
      }
      for (const i of cursor.b != null ? [a, b] : [a]) {
        ctx.strokeStyle = "rgba(120,120,128,0.8)"; ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(X(i), padT); ctx.lineTo(X(i), padT + priceH); ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(X(i), Y(c[i]), 4, 0, Math.PI * 2);
        ctx.fillStyle = main; ctx.fill();
        ctx.strokeStyle = "#fff"; ctx.stroke();
      }
    }
    // 時間軸首尾標籤
    ctx.fillStyle = "rgba(120,120,128,0.9)"; ctx.font = "10px -apple-system";
    ctx.fillText(fmtDate(series.t[0], series.isIntraday), padX + 2, H - 5);
    const endLabel = fmtDate(series.t[n - 1], series.isIntraday);
    ctx.fillText(endLabel, W - ctx.measureText(endLabel).width - 4, H - 5);
  }, [series, width, height, cursor]);

  // ---- 手勢：單指按住看價、雙指看區間；滑鼠 hover 看價、拖曳看區間 ----
  const pointers = useRef(new Map());
  const idxFromX = (clientX) => {
    const rect = cvRef.current.getBoundingClientRect();
    const n = series.c.length;
    return Math.max(0, Math.min(n - 1, Math.round(((clientX - rect.left) / rect.width) * (n - 1))));
  };
  const update = () => {
    const pts = [...pointers.current.values()];
    if (!series?.c?.length) return;
    if (pts.length >= 2) setCursor({ a: idxFromX(pts[0]), b: idxFromX(pts[1]) });
    else if (pts.length === 1) {
      setCursor((prev) => prev?.drag
        ? { a: prev.a0, b: idxFromX(pts[0]), drag: true, a0: prev.a0 }
        : { a: idxFromX(pts[0]) });
    }
  };
  const onDown = (e) => {
    cvRef.current.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, e.clientX);
    if (e.pointerType === "mouse" && pointers.current.size === 1) {
      setCursor({ a: idxFromX(e.clientX), a0: idxFromX(e.clientX), drag: true });
    } else update();
  };
  const onMove = (e) => {
    if (pointers.current.has(e.pointerId)) { pointers.current.set(e.pointerId, e.clientX); update(); }
    else if (e.pointerType === "mouse") setCursor({ a: idxFromX(e.clientX) });  // hover
  };
  const onUp = (e) => { pointers.current.delete(e.pointerId); if (!pointers.current.size) setCursor(null); };
  const onLeave = () => { if (!pointers.current.size) setCursor(null); };

  if (!series?.c?.length) {
    return <div class="cap" style="padding:24px 0;text-align:center">歷史資料尚未抓取——下次行情更新後即有完整圖表。</div>;
  }

  return (
    <div ref={wrapRef}>
      <div class="chart-info num">
        {info?.mode === "interval" && (
          <span>
            <b class={info.chg >= 0 ? "chg-up" : "chg-down"}>{pct(info.chg)}</b>
            <span class="muted">　{fmtDate(info.from, series.isIntraday)} → {fmtDate(info.to, series.isIntraday)}</span>
            <span class="muted">　{num(info.pa)} → {num(info.pb)} {currency}</span>
          </span>
        )}
        {info?.mode === "point" && (
          <span><b>{num(info.p)} {currency}</b>
            <b class={info.chg >= 0 ? "chg-up" : "chg-down"}>　{pct(info.chg)}</b>
            <span class="muted">　{fmtDate(info.at, series.isIntraday)}（相對區間起點）</span></span>
        )}
        {info?.mode === "range" && (
          <span><b class={info.chg >= 0 ? "chg-up" : "chg-down"}>{pct(info.chg)}</b>
            <span class="muted">　此區間　高 {num(info.hi)}　低 {num(info.lo)}</span></span>
        )}
      </div>
      <canvas ref={cvRef} style={{ width: "100%", height: height + "px", touchAction: "none", cursor: "crosshair" }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
        onPointerCancel={onUp} onPointerLeave={onLeave} />
      <div class="cap3" style="margin:2px 0 6px">
        {series.ma20 ? "— 藍 20MA　— 灰 60MA　· " : ""}按住拖曳看單點價格；雙指（或滑鼠拖曳）看兩點間漲跌%
        {series.fallback ? "　·（暫用 90 日收盤快照）" : ""}
      </div>
      <div class="range-seg">
        {RANGES.map((r) => (
          <button key={r.id} disabled={!avail(r.id)} class={range === r.id ? "active" : ""}
            onClick={() => { setRange(r.id); setCursor(null); }}>{r.label}</button>
        ))}
      </div>
    </div>
  );
}
