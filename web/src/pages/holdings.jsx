// 持倉：實際部位管理（含成本與損益）、淨值/斷路器、檢查點、雲端同步
import { useState } from "preact/hooks";
import { navPut, navDel, holdingPut, holdingDel, exportState, importState, kvSet } from "../db.js";
import { Sym, NAMES } from "../sheet.jsx";
import { getToken, driveUpload, driveDownload } from "../gdrive.js";
import { twd, pct, num, fxRate, CUR } from "../fmt.js";

const CP_STATES = [
  { v: "unverified", label: "未驗證" }, { v: "confirmed", label: "符合" }, { v: "falsified", label: "證偽" },
];

export function Holdings({ st }) {
  const { data, config, user, setKv, refreshUser, dd } = st;
  const [navDate, setNavDate] = useState(new Date().toISOString().slice(0, 10));
  const [navAmt, setNavAmt] = useState("");
  const [hSym, setHSym] = useState("");
  const [hShares, setHShares] = useState("");
  const [hCost, setHCost] = useState("");
  const [busy, setBusy] = useState("");
  const checkpoints = config?.checkpoints?.checkpoints || [];

  const watch = config?.watchlist;
  const allSyms = watch ? ["us", "tw", "two", "jp"].flatMap((k) => watch[k] || []) : [];

  // ---- 持倉估值 ----
  const rows = user.holdings.map((h) => {
    const q = data?.quotes?.[h.symbol];
    const r = q ? fxRate(q.category, data?.fx) : null;
    const value = q?.price && r ? h.shares * q.price * r : null;
    const plPct = h.cost && q?.price ? (q.price / h.cost - 1) * 100 : null;
    const plTwd = plPct != null && r ? (q.price - h.cost) * h.shares * r : null;
    return { ...h, q, value, plPct, plTwd };
  });
  const totV = rows.reduce((s, r) => s + (r.value || 0), 0);

  const addHolding = async () => {
    if (!hSym || !hShares) return;
    await holdingPut({ symbol: hSym, shares: Number(hShares), cost: Number(hCost) || null });
    setHSym(""); setHShares(""); setHCost(""); refreshUser();
  };
  const addNav = async () => {
    if (!navAmt) return;
    await navPut({ date: navDate, amount: Number(navAmt) });
    setNavAmt(""); refreshUser();
  };
  const setCp = (id, v) => setKv("checkpoints", { ...user.checkpoints, [id]: v });

  // ---- 同步 ----
  const doExport = async () => {
    const blob = new Blob([JSON.stringify(await exportState(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `cockpit-state-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(a.href);
  };
  const doImport = (e) => {
    const f = e.currentTarget.files?.[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = async () => {
      try { await importState(JSON.parse(rd.result)); refreshUser(); alert("匯入完成"); }
      catch (err) { alert("匯入失敗：" + err.message); }
    };
    rd.readAsText(f);
  };
  const cloud = async (dir) => {
    const cid = user.gClientId;
    if (!cid) { alert("請先貼上 Google OAuth Client ID（申請步驟見卡片說明）"); return; }
    setBusy(dir);
    try {
      const token = await getToken(cid);
      if (dir === "up") { await driveUpload(token, await exportState()); await kvSet("gLastSync", new Date().toISOString()); }
      else { await importState(await driveDownload(token)); await kvSet("gLastSync", new Date().toISOString()); }
      refreshUser();
      alert(dir === "up" ? "已上傳到你的 Google 雲端（隱藏 App 空間）" : "已從雲端還原");
    } catch (e) { alert("同步失敗：" + e.message); }
    setBusy("");
  };

  return (
    <div>
      <h2 class="lt">持倉</h2>

      {/* ---- 實際持倉 ---- */}
      <div class="card">
        <div class="row">
          <strong>實際部位</strong>
          <span class="num" style="font-weight:700">{totV ? twd(totV) : "—"}</span>
        </div>
        <div class="cap3" style="margin-bottom:8px">下單頁的「與現況差異」以此為準；點代碼可看圖表並就地修改。</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <select value={hSym} onChange={(e) => setHSym(e.currentTarget.value)} style="flex:2;min-width:150px">
            <option value="">選擇標的…</option>
            {allSyms.map((s) => <option key={s} value={s}>{s}　{NAMES[s] || ""}</option>)}
          </select>
          <input type="number" placeholder="股數" value={hShares}
            onChange={(e) => setHShares(e.currentTarget.value)} style="flex:1;min-width:80px" />
          <input type="number" placeholder="成本(每股,當地幣)" value={hCost}
            onChange={(e) => setHCost(e.currentTarget.value)} style="flex:1;min-width:110px" />
          <button class="btn" onClick={addHolding}>登記</button>
        </div>
        {rows.length > 0 && (
          <div class="list" style="margin-top:8px">
            {rows.map((r) => (
              <div class="lrow" key={r.symbol}>
                <div class="col" style="gap:0">
                  <Sym s={r.symbol}><strong>{r.symbol}</strong><span class="muted" style="font-size:12px">　{NAMES[r.symbol] || ""}</span></Sym>
                  <span class="cap3 num">{num(r.shares, 0)} 股{r.cost ? `　@ ${num(r.cost)} ${CUR[r.q?.category] || ""}` : "　（未填成本）"}</span>
                </div>
                <div class="col" style="align-items:flex-end;gap:0">
                  <span class="num" style="font-weight:600">{r.value ? twd(r.value) : "—"}</span>
                  {r.plPct != null && (
                    <span class={"cap num " + (r.plPct >= 0 ? "chg-up" : "chg-down")}>{pct(r.plPct)}　{twd(r.plTwd)}</span>
                  )}
                </div>
                <button class="btn small gray" onClick={async () => { await holdingDel(r.symbol); refreshUser(); }}>刪</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---- 淨值 / 斷路器 ---- */}
      <div class="card">
        <div class="row">
          <strong>淨值 / 回撤斷路器</strong>
          {dd.drawdown <= -0.15 ? <span class="badge up">斷路器 −15%</span>
            : dd.drawdown <= -0.10 ? <span class="badge warn">警戒 −10%</span>
              : <span class="badge down">正常</span>}
        </div>
        <div class="cap3" style="margin-bottom:6px">定期記錄總淨值（現金+部位）。回撤 −10% 今日頁警示、−15% 強制去槓桿。</div>
        <div class="grid2">
          <div class="kv"><span class="k">最新淨值</span><span class="v">{twd(dd.last)}</span></div>
          <div class="kv"><span class="k">累積報酬</span>
            <span class={"v num " + (dd.ret >= 0 ? "chg-up" : "chg-down")}>{dd.ret == null ? "—" : pct(dd.ret * 100)}</span></div>
          <div class="kv"><span class="k">自高點回撤</span><span class="v chg-down num">{pct(dd.drawdown * 100)}</span></div>
          <div class="kv"><span class="k">歷史最大回撤</span><span class="v chg-down num">{pct(dd.maxDD * 100)}</span></div>
        </div>
        <hr class="sep" />
        <div style="display:flex;gap:8px">
          <input type="date" value={navDate} onChange={(e) => setNavDate(e.currentTarget.value)} style="flex:1" />
          <input type="number" placeholder="金額 TWD" value={navAmt}
            onChange={(e) => setNavAmt(e.currentTarget.value)} style="flex:1" />
          <button class="btn" onClick={addNav}>記錄</button>
        </div>
        {totV > 0 && <div class="cap3" style="margin-top:4px">提示：目前登記部位市值約 {twd(totV)}，可加上現金後記為今日淨值。</div>}
        {user.nav.length > 0 && (
          <div class="list" style="margin-top:8px">
            {user.nav.slice(-6).reverse().map((r) => (
              <div class="lrow" key={r.date}>
                <span class="cap num">{r.date}</span>
                <span class="num">{twd(r.amount)}</span>
                <button class="btn small gray" onClick={async () => { await navDel(r.date); refreshUser(); }}>刪</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---- 檢查點 ---- */}
      <div class="card">
        <strong>論述檢查點</strong>
        <div class="cap3" style="margin-bottom:8px">任一「證偽」→ 全站持股水位 −20pp、槓桿鎖 1.0×</div>
        <div class="list">
          {checkpoints.map((c) => {
            const cur = user.checkpoints?.[c.id] || "unverified";
            return (
              <div class="lrow" key={c.id} style="align-items:flex-start;flex-direction:column;gap:6px">
                <div class="col" style="gap:2px">
                  <span style="font-weight:600;font-size:14px">{c.title}</span>
                  {c.detail && <span class="cap3">{c.detail}</span>}
                </div>
                <div class="tri">
                  {CP_STATES.map((s) => (
                    <button key={s.v} class={cur === s.v ? "on-" + s.v : ""}
                      onClick={() => setCp(c.id, s.v)}>{s.label}</button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ---- 同步 ---- */}
      <div class="card">
        <strong>跨裝置同步</strong>
        <div class="cap3" style="margin:4px 0 8px">
          資料存本機瀏覽器。Google 同步存到你 Drive 的隱藏 App 空間（別人與其他 App 都看不到）。
          首次使用：Google Cloud Console → 建立 OAuth Client ID（類型「網頁應用程式」、來源填本站網址）→ 貼到下方。
        </div>
        <input type="text" placeholder="Google OAuth Client ID（xxxx.apps.googleusercontent.com）"
          value={user.gClientId || ""} onChange={(e) => setKv("gClientId", e.currentTarget.value.trim())} />
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn" style="flex:1" disabled={!!busy} onClick={() => cloud("up")}>
            {busy === "up" ? "上傳中…" : "↑ 上傳到雲端"}</button>
          <button class="btn gray" style="flex:1" disabled={!!busy} onClick={() => cloud("down")}>
            {busy === "down" ? "下載中…" : "↓ 從雲端還原"}</button>
        </div>
        {user.gLastSync && <div class="cap3" style="margin-top:6px">上次同步：{user.gLastSync.slice(0, 16).replace("T", " ")}</div>}
        <hr class="sep" />
        <div style="display:flex;gap:8px">
          <button class="btn gray small" style="flex:1" onClick={doExport}>匯出 JSON（備援）</button>
          <label class="btn gray small" style="flex:1;display:flex;align-items:center;justify-content:center;cursor:pointer">
            匯入 JSON<input type="file" accept="application/json" style="display:none" onChange={doImport} />
          </label>
        </div>
      </div>
    </div>
  );
}
