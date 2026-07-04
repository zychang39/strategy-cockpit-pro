// 劇本：若 A 發生 → 買 B（觸發劇本）＋ 作者持倉快照
import { Sym, NAMES } from "../sheet.jsx";
import { Segmented } from "../components.jsx";
import { useState } from "preact/hooks";

const STATES = [
  { v: "waiting", label: "等待中" },
  { v: "fired", label: "已觸發" },
  { v: "done", label: "已執行" },
];

function TriggerCard({ t, st }) {
  const { signals, user, setKv } = st;
  const auto = t.auto === "rotation";
  const autoFired = auto && signals?.rotation;
  const manual = user.triggers?.[t.id] || "waiting";
  const state = auto ? (autoFired ? "fired" : "waiting") : manual;
  const setState = (v) => setKv("triggers", { ...user.triggers, [t.id]: v });

  return (
    <div class={"card" + (state === "fired" ? " accent" : "")}>
      <div class="row" style="align-items:flex-start">
        <strong style="flex:1">{state === "fired" ? "⚡ " : ""}{t.when}</strong>
        <span class={"badge " + (state === "fired" ? "up" : state === "done" ? "down" : "")}>
          {auto ? (autoFired ? "已觸發（自動判定）" : "自動監控中") : STATES.find((s) => s.v === state)?.label}
        </span>
      </div>
      <p style="margin:8px 0;font-size:14px;line-height:19px"><b>→ 行動：</b>{t.action}</p>
      <div class="ticker-row" style="margin-bottom:8px">
        {(t.tickers || []).map((s) => <Sym key={s} s={s}>{s}{NAMES[s] ? `　${NAMES[s]}` : ""}</Sym>)}
      </div>
      <div class="cap3">時窗：{t.window}</div>
      {t.note && <div class="cap" style="margin-top:6px;color:var(--text-2)">{t.note}</div>}
      {!auto && (
        <div class="tri" style="margin-top:8px">
          {STATES.map((s) => (
            <button key={s.v} class={state === s.v ? (s.v === "fired" ? "on-falsified" : s.v === "done" ? "on-confirmed" : "on-unverified") : ""}
              onClick={() => setState(s.v)}>{s.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Playbook({ st }) {
  const { config } = st;
  const pb = config?.playbook;
  const [view, setView] = useState("triggers");
  if (!pb) return <h2 class="lt">劇本</h2>;
  const fired = pb.triggers.filter((t) =>
    (t.auto === "rotation" && st.signals?.rotation) || st.user.triggers?.[t.id] === "fired");

  return (
    <div>
      <h2 class="lt">劇本</h2>
      <p class="cap" style="margin:-8px 0 12px">「若 A 發生 → 買 B」。輪動劇本由系統自動判定；其他事件發生時手動標「已觸發」，執行完標「已執行」。</p>
      <Segmented value={view} onChange={setView} options={[
        { value: "triggers", label: `觸發劇本（${pb.triggers.length}）` },
        { value: "author", label: "作者持倉快照" }]} />

      {view === "triggers" && (
        <div style="margin-top:12px">
          {fired.length > 0 && (
            <div class="banner blue">⚡ {fired.length} 個劇本已觸發——行動列在卡片上。</div>
          )}
          {pb.triggers.map((t) => <TriggerCard key={t.id} t={t} st={st} />)}
        </div>
      )}

      {view === "author" && (
        <div style="margin-top:12px">
          <div class="banner amber">快照時點 {pb.author_portfolio.as_of}。{pb.author_portfolio.note}</div>
          {pb.author_portfolio.items.map((it) => (
            <div class="card" key={it.label}>
              <div class="row">
                <strong>{it.label}</strong>
                <span class="badge num">{it.weight}</span>
              </div>
              <div class="ticker-row" style="margin-top:8px">
                {(it.tickers || []).map((s) => <Sym key={s} s={s}>{s}{NAMES[s] ? `　${NAMES[s]}` : ""}</Sym>)}
              </div>
              {it.note && <div class="cap3" style="margin-top:6px">{it.note}</div>}
            </div>
          ))}
          <div class="cap3" style="padding:4px 8px">「我很常是韭菜王，說不定我錯」——對照用，倉位與時點自行判斷。</div>
        </div>
      )}
    </div>
  );
}
