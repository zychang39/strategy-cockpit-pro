// 配置：階段自動選定（可手動切換）、主題權重環圈圖、本金與槓桿上限
import { Donut, Segmented } from "../components.jsx";
import { twd } from "../fmt.js";

export function Alloc({ st }) {
  const { config, user, setKv, phase } = st;
  if (!config || !phase) return <h2 class="lt">配置</h2>;
  const phases = config.phases?.phases || [];

  return (
    <div>
      <h2 class="lt">配置</h2>

      <div class="card">
        <div class="cap" style="margin-bottom:8px">階段（預設依日期自動選定）</div>
        <Segmented
          options={phases.map((p) => ({ value: p.id, label: p.name }))}
          value={phase.id}
          onChange={(v) => setKv("phaseOverride", v)}
        />
        <div class="cap3" style="margin-top:8px">
          {String(phase.start)} ～ {String(phase.end)}
          {user.phaseOverride != null && (
            <button class="btn small gray" style="margin-left:8px"
              onClick={() => setKv("phaseOverride", null)}>回到自動</button>
          )}
        </div>
      </div>

      <div class="card">
        <div class="cap" style="margin-bottom:8px">主題權重</div>
        <Donut items={phase.themes.map((t) => ({ name: t.name, weight: t.weight }))} />
      </div>

      <div class="card">
        <div class="cap">本金（TWD）</div>
        <input type="number" min="0" step="10000" value={user.capital}
          onChange={(e) => setKv("capital", Number(e.currentTarget.value) || 0)} />
        <div class="cap3" style="margin-top:4px">{twd(user.capital)}</div>
        <hr class="sep" />
        <div class="cap">槓桿上限：<b class="num">{Number(user.levCap).toFixed(1)}×</b></div>
        <input type="range" min="1" max="1.8" step="0.1" value={user.levCap}
          onInput={(e) => setKv("levCap", Number(e.currentTarget.value))} />
        <div class="cap3">槓桿只在站上 30MA（進攻）時動用；減碼/防守一律 1.0×。</div>
        {user.levCap > 1.31 && (
          <div class="banner amber" style="margin:8px 0 0">⚠ 1.3× 以上在本框架沒有支持理由——「如果回檔讓你有壓力，我建議不要。」僅供壓力測試。</div>
        )}
      </div>

      <div class="card">
        <div class="cap" style="margin-bottom:4px">主題明細</div>
        <div class="list">
          {phase.themes.map((t) => (
            <div class="lrow" key={t.name}>
              <div class="col">
                <strong>{t.name}{t.rotation_only ? "（輪動觸發）" : ""}</strong>
                <span class="cap3">{(t.tickers || []).join("、") || "現金"}</span>
              </div>
              <div class="col" style="align-items:flex-end">
                <span class="num" style="font-weight:600">{(t.weight * 100).toFixed(0)}%</span>
                <span class="cap3">{t.hold || ""}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
