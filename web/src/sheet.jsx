// 個股詳情面板 — 全站連動樞紐：圖表 + 論述 + 目標價 + 我的持倉
import { createContext } from "preact";
import { useContext, useState, useEffect } from "preact/hooks";
import { RangeChart, sanitize } from "./chart.jsx";
import { expectedReturns } from "./engine.js";
import { twd, num, pct, localPrice, CUR, fxRate } from "./fmt.js";
import { holdingPut, holdingDel } from "./db.js";

export const SheetCtx = createContext({ open: () => {} });
export const useSheet = () => useContext(SheetCtx);

export const NAMES = {
  "^SOX": "費城半導體", QQQ: "NASDAQ 100", MU: "美光", SNDK: "SanDisk", STX: "希捷",
  WDC: "威騰", TER: "Teradyne", LITE: "Lumentum", COHR: "Coherent", MRVL: "Marvell",
  ALAB: "Astera Labs", AMKR: "艾克爾", GOOGL: "Alphabet", AMZN: "Amazon", NVDA: "輝達",
  AVGO: "博通", GLW: "康寧", INTC: "英特爾", AMAT: "應用材料", ONTO: "Onto",
  ASML: "艾司摩爾", UCTT: "Ultra Clean", KLIC: "K&S", BB: "BlackBerry", WOLF: "Wolfspeed",
  "2330.TW": "台積電", "2454.TW": "聯發科", "2327.TW": "國巨", "2308.TW": "台達電",
  "6187.TWO": "萬潤", "6223.TWO": "旺矽", MRAAY: "村田 ADR", KXIAY: "Kioxia ADR",
  CRDO: "Credo", NOK: "諾基亞", "6515.TW": "穎崴", IFNNY: "英飛凌 ADR",
  PANW: "Palo Alto", CRWD: "CrowdStrike", NET: "Cloudflare",
};

const BASE = import.meta.env.BASE_URL || "./";
const histCache = new Map();

async function loadHist(sym) {
  if (histCache.has(sym)) return histCache.get(sym);
  try {
    const r = await fetch(BASE + "data/quotes/" + sanitize(sym) + ".json");
    const j = r.ok ? await r.json() : null;
    histCache.set(sym, j);
    return j;
  } catch { histCache.set(sym, null); return null; }
}

export function StockSheet({ sym, st, onClose }) {
  const { data, config, user, refreshUser } = st;
  const [hist, setHist] = useState(undefined);
  const [shares, setShares] = useState("");
  const [cost, setCost] = useState("");

  useEffect(() => { setHist(undefined); loadHist(sym).then(setHist); }, [sym]);
  useEffect(() => {
    const h = user.holdings.find((x) => x.symbol === sym);
    setShares(h ? String(h.shares) : "");
    setCost(h?.cost != null ? String(h.cost) : "");
  }, [sym, user.holdings]);
  useEffect(() => {
    const fn = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);

  const q = data?.quotes?.[sym];
  const t = config?.targets?.[sym];
  const th = config?.theses?.[sym];
  const exp = q?.price && t ? expectedReturns(q.price, t) : null;
  const holding = user.holdings.find((x) => x.symbol === sym);
  const rate = q ? fxRate(q.category, data?.fx) : 1;
  const pl = holding?.cost && q?.price
    ? { pct: (q.price / holding.cost - 1) * 100, twd: (q.price - holding.cost) * holding.shares * (rate || 1) }
    : null;

  const save = async () => {
    const s = Number(shares);
    if (!s) { await holdingDel(sym); }
    else await holdingPut({ symbol: sym, shares: s, cost: Number(cost) || null });
    refreshUser();
  };

  return (
    <div class="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="sheet" role="dialog" aria-modal="true">
        <div class="sheet-head">
          <div>
            <div class="order-sym">{sym} <span class="muted" style="font-weight:400;font-size:14px">{NAMES[sym] || ""}</span></div>
            {q?.price != null && (
              <div class="num" style="font-size:22px;font-weight:700">
                {localPrice(q)}
                <span class={q.change_pct >= 0 ? "chg-up" : "chg-down"} style="font-size:15px">　{pct(q.change_pct)}</span>
              </div>
            )}
          </div>
          <button class="btn gray small" onClick={onClose} aria-label="關閉">✕ 關閉</button>
        </div>

        {hist === undefined
          ? <div class="cap" style="padding:32px;text-align:center">載入圖表…</div>
          : <RangeChart hist={hist} fallbackSpark={q?.spark} currency={CUR[q?.category] || ""} />}

        <div class="grid2" style="margin-top:8px">
          <div class="kv"><span class="k">30MA / 60MA</span><span class="v">{num(q?.ma30)} / {num(q?.ma60)}</span></div>
          <div class="kv"><span class="k">vs 30MA</span>
            <span class={"v num " + (q?.price > q?.ma30 ? "chg-up" : "chg-down")}>
              {q?.ma30 ? pct((q.price / q.ma30 - 1) * 100) : "—"}</span></div>
        </div>

        {t && (
          <div class="card" style="margin-top:8px">
            <div class="cap" style="margin-bottom:6px">目標價（熊 / 基準 / 牛）— config/targets.yaml 可改</div>
            <div class="row num" style="font-weight:600">
              <span class="chg-down">{num(t.bear)}（{exp ? pct(exp.bear) : "—"}）</span>
              <span>{num(t.base)}（{exp ? pct(exp.base) : "—"}）</span>
              <span class="chg-up">{num(t.bull)}（{exp ? pct(exp.bull) : "—"}）</span>
            </div>
          </div>
        )}

        {th && (
          <div class="card" style="margin-top:8px">
            <div class="thesis-body" style="padding:0">
              <div class="trow"><span class="tk">買進時點</span><span>{th.buy}</span></div>
              <div class="trow"><span class="tk">理由</span><span>{th.why}</span></div>
              <div class="trow"><span class="tk">上檔空間</span><span>{th.upside}</span></div>
              <div class="trow"><span class="tk">風險/退出</span><span>{th.risk}</span></div>
            </div>
          </div>
        )}

        <div class="card" style="margin-top:8px">
          <div class="cap" style="margin-bottom:6px">我的持倉</div>
          <div style="display:flex;gap:8px">
            <input type="number" placeholder="股數" value={shares}
              onChange={(e) => setShares(e.currentTarget.value)} style="flex:1" />
            <input type="number" placeholder={"成本/" + (CUR[q?.category] || "股")} value={cost}
              onChange={(e) => setCost(e.currentTarget.value)} style="flex:1" />
            <button class="btn" onClick={save}>{holding ? "更新" : "登記"}</button>
          </div>
          {pl && (
            <div class="kv" style="margin-top:6px"><span class="k">未實現損益</span>
              <span class={"v num " + (pl.pct >= 0 ? "chg-up" : "chg-down")}>
                {pct(pl.pct)}　{twd(pl.twd)}</span></div>
          )}
        </div>
      </div>
    </div>
  );
}

// 可點擊代碼（全站通用）
export function Sym({ s, children }) {
  const { open } = useSheet();
  return (
    <button class="symlink" onClick={(e) => { e.stopPropagation(); open(s); }}>
      {children || s}
    </button>
  );
}
