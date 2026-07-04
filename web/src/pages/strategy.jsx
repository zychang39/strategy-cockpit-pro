// 策略：三條紀律 × 四階段佈局 × 槓桿 × 退出（可分階段查閱，個股可點）
import { useState } from "preact/hooks";
import { Segmented } from "../components.jsx";
import { Sym, NAMES } from "../sheet.jsx";
import { currentPhase } from "../engine.js";

const TickerRow = ({ tickers }) => (
  <div class="ticker-row">
    {tickers.map((t) => <Sym key={t} s={t}>{t}{NAMES[t] ? `　${NAMES[t]}` : ""}</Sym>)}
  </div>
);

export function Strategy({ st }) {
  const { config } = st;
  const sg = config?.strategy;
  const autoPhase = config ? currentPhase(config.phases, null, null) : null;
  const [stage, setStage] = useState(null);
  const [view, setView] = useState("stages"); // stages | rules
  if (!sg) return <h2 class="lt">策略</h2>;
  const curId = stage ?? autoPhase?.id ?? 1;
  const cur = sg.stages.find((s) => s.id === curId) || sg.stages[0];

  return (
    <div>
      <h2 class="lt">策略</h2>
      <Segmented value={view} onChange={setView} options={[
        { value: "stages", label: "四階段佈局" }, { value: "rules", label: "紀律與退出" }]} />

      {view === "stages" && (
        <div style="margin-top:12px">
          <div class="seg">
            {sg.stages.map((s) => (
              <button key={s.id} class={curId === s.id ? "active" : ""}
                onClick={() => setStage(s.id)}>
                {s.name}{autoPhase?.id === s.id ? "・現在" : ""}
              </button>
            ))}
          </div>
          <div class="card" style="margin-top:12px">
            <div class="row">
              <span class="cap num" style="font-weight:700">{cur.period}</span>
            </div>
            {cur.entry_signal && <div class="cap3" style="margin-top:4px">進場訊號：{cur.entry_signal}</div>}
            <p style="margin-top:6px;font-weight:600">{cur.summary}</p>
          </div>
          {cur.plays.map((p) => (
            <div class="card" key={p.title}>
              <strong>{p.title}</strong>
              <p class="cap" style="margin:6px 0 8px;color:var(--text-2);font-size:14px;line-height:19px">{p.body}</p>
              <TickerRow tickers={p.tickers || []} />
            </div>
          ))}
          {cur.avoid && (
            <div class="banner amber">✋ 這階段要避開：{cur.avoid}</div>
          )}
          {cur.transition && (
            <div class="card" style="border-left:3px solid var(--tint)">
              <strong>⇢ 過渡計畫：{cur.transition.to}</strong>
              <div class="cap" style="margin:8px 0 6px"><b>盯什麼：</b>{cur.transition.watch}</div>
              {cur.transition.actions.map((a, i) => (
                <p key={i} style="font-size:14px;line-height:19px;margin-bottom:6px">・{a}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {view === "rules" && (
        <div style="margin-top:12px">
          <h3 class="st">三條貫穿全程的紀律</h3>
          {sg.disciplines.map((d, i) => (
            <div class="card" key={i}>
              <strong>{i + 1}. {d.title}</strong>
              <p class="quote">{d.quote}</p>
              <p style="font-size:14px;line-height:19px">{d.body}</p>
            </div>
          ))}
          <h3 class="st">{sg.split.title}</h3>
          <div class="card"><p style="font-size:14px;line-height:19px">{sg.split.body}</p></div>
          <h3 class="st">{sg.leverage.title}</h3>
          <div class="card">
            <p class="quote">{sg.leverage.quote}</p>
            <p style="font-size:14px;line-height:19px">{sg.leverage.body}</p>
          </div>
          <h3 class="st">{sg.exits.title}</h3>
          <div class="card">
            {sg.exits.rules.map((r, i) => (
              <p key={i} style="font-size:14px;line-height:19px;margin-bottom:8px">・{r}</p>
            ))}
          </div>
          <div class="banner red" style="margin-top:12px">⚠ {sg.risk.body}</div>
        </div>
      )}
    </div>
  );
}
