// 追蹤：淨值紀錄、回撤斷路器、實際持倉登記、檢查點三態、JSON 匯出/匯入
import { useState } from "preact/hooks";
import { navPut, navDel, holdingPut, holdingDel, exportState, importState } from "../db.js";
import { twd, pct, num } from "../fmt.js";

const CP_STATES = [
  { v: "unverified", label: "未驗證" },
  { v: "confirmed", label: "符合" },
  { v: "falsified", label: "證偽" },
];

export function Track({ st }) {
  const { user, setKv, refreshUser, dd, config } = st;
  const [navDate, setNavDate] = useState(new Date().toISOString().slice(0, 10));
  const [navAmt, setNavAmt] = useState("");
  const [hSym, setHSym] = useState("");
  const [hShares, setHShares] = useState("");
  const checkpoints = config?.checkpoints?.checkpoints || [];

  const addNav = async () => {
    if (!navAmt) return;
    await navPut({ date: navDate, amount: Number(navAmt) });
    setNavAmt(""); refreshUser();
  };
  const addHolding = async () => {
    if (!hSym || !hShares) return;
    await holdingPut({ symbol: hSym.trim().toUpperCase(), shares: Number(hShares) });
    setHSym(""); setHShares(""); refreshUser();
  };
  const setCp = (id, v) => setKv("checkpoints", { ...user.checkpoints, [id]: v });

  const doExport = async () => {
    const blob = new Blob([JSON.stringify(await exportState(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `cockpit-state-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
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

  return (
    <div>
      <h2 class="lt">追蹤</h2>

      <div class="card">
        <div class="row">
          <strong>淨值 / 回撤</strong>
          {dd.drawdown <= -0.15 ? <span class="badge up">斷路器 −15%</span>
            : dd.drawdown <= -0.10 ? <span class="badge warn">警戒 −10%</span>
              : <span class="badge down">正常</span>}
        </div>
        <div class="grid2" style="margin-top:8px">
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
        {user.nav.length > 0 && (
          <div class="list" style="margin-top:8px">
            {user.nav.slice(-8).reverse().map((r) => (
              <div class="lrow" key={r.date}>
                <span class="cap num">{r.date}</span>
                <span class="num">{twd(r.amount)}</span>
                <button class="btn small gray" onClick={async () => { await navDel(r.date); refreshUser(); }}>刪</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div class="card">
        <strong>實際持倉登記</strong>
        <div class="cap3" style="margin-bottom:8px">供「下單」頁計算與現況差異</div>
        <div style="display:flex;gap:8px">
          <input type="text" placeholder="代碼（如 2330.TW）" value={hSym}
            onChange={(e) => setHSym(e.currentTarget.value)} style="flex:2" />
          <input type="number" placeholder="股數" value={hShares}
            onChange={(e) => setHShares(e.currentTarget.value)} style="flex:1" />
          <button class="btn" onClick={addHolding}>登記</button>
        </div>
        {user.holdings.length > 0 && (
          <div class="list" style="margin-top:8px">
            {user.holdings.map((h) => (
              <div class="lrow" key={h.symbol}>
                <strong>{h.symbol}</strong>
                <span class="num">{num(h.shares, 0)} 股</span>
                <button class="btn small gray" onClick={async () => { await holdingDel(h.symbol); refreshUser(); }}>刪</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div class="card">
        <strong>論述檢查點</strong>
        <div class="cap3" style="margin-bottom:8px">任一「證偽」→ 持股水位 −20pp、槓桿鎖 1.0×</div>
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

      <div class="card">
        <strong>同步（手機 ↔ Mac）</strong>
        <div class="cap3" style="margin-bottom:8px">狀態存於此裝置瀏覽器 IndexedDB；以 JSON 檔搬移。</div>
        <div style="display:flex;gap:8px">
          <button class="btn gray" style="flex:1" onClick={doExport}>匯出 JSON</button>
          <label class="btn gray" style="flex:1;display:flex;align-items:center;justify-content:center;cursor:pointer">
            匯入 JSON<input type="file" accept="application/json" style="display:none" onChange={doImport} />
          </label>
        </div>
      </div>
    </div>
  );
}
