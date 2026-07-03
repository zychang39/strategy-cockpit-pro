// 下單：核心交付頁。依主題分組，每檔一張卡（含買進時點/理由/上檔空間）+ 與現況差異摘要。
import { useState } from "preact/hooks";
import { buildOrders, diffHoldings, DEFENSE } from "../engine.js";
import { Segmented, SourceBadge } from "../components.jsx";
import { twd, num, pct, localPrice, CUR } from "../fmt.js";

function PlanA({ o }) {
  const a = o.planA;
  return (
    <div>
      <div class="kv"><span class="k">所需融資金額</span><span class="v">{twd(a.loan)}</span></div>
      {a.type === "tw" && <div class="kv"><span class="k">自備款（40%）</span><span class="v">{twd(a.selfFunded)}</span></div>}
      <div class="kv"><span class="k">預估年利率</span><span class="v num">{(a.rate * 100).toFixed(1)}%</span></div>
      <div class="kv"><span class="k">維持率警戒價</span>
        <span class="v chg-down">{num(a.alertPrice)} {CUR[o.quote.category]}（{pct(a.alertDropPct)}）</span></div>
      <div class="cap3">{a.type === "tw" ? "台股融資維持率 130% 警戒線" : "海外 margin 維持保證金 30% 估算"}；跌破警戒價將接近追繳。</div>
    </div>
  );
}

function PlanB({ o }) {
  const b = o.planB;
  if (!b.live) {
    return <div class="cap">選擇權報價暫缺，改顯示融資方案。（估算：履約價 {num(b.strike)}、{b.contracts} 口）</div>;
  }
  return (
    <div>
      <div class="kv"><span class="k">建議履約價（deep ITM）</span><span class="v num">{num(b.strike)}（{b.expiry}）</span></div>
      <div class="kv"><span class="k">delta / 每口等效曝險</span><span class="v num">{b.delta}　/　US${num(b.perContract, 0)}</span></div>
      <div class="kv"><span class="k">所需口數</span><span class="v num">{b.contracts} 口</span></div>
      <div class="kv"><span class="k">權利金（mid）</span><span class="v num">US${num(b.premiumEach)} × {b.contracts} = US${num(b.premiumTotal, 0)}</span></div>
      <div class="kv"><span class="k">最大損失</span><span class="v chg-down">US${num(b.maxLoss, 0)}（＝權利金）</span></div>
      <div class="cap3">最大損失鎖定為權利金——天然優於融資的斷頭風險。到期 9–15 個月、delta 0.75–0.85。</div>
    </div>
  );
}

function Thesis({ t }) {
  if (!t) return null;
  return (
    <details class="thesis">
      <summary>為什麼買？時點與上檔空間</summary>
      <div class="thesis-body">
        <div class="trow"><span class="tk">買進時點</span><span>{t.buy}</span></div>
        <div class="trow"><span class="tk">理由</span><span>{t.why}</span></div>
        <div class="trow"><span class="tk">上檔空間</span><span>{t.upside}</span></div>
        <div class="trow"><span class="tk">風險/退出</span><span>{t.risk}</span></div>
      </div>
    </details>
  );
}

function OrderCard({ o, regime, thesis }) {
  const [plan, setPlan] = useState("A");
  const q = o.quote;
  if (o.missing) {
    return (
      <div class="card">
        <div class="order-head"><span class="order-sym">{o.symbol}</span><span class="badge up">資料缺漏</span></div>
        <div class="cap">無法取得報價，暫不提供部位建議。{q?.error ? ` (${q.error.slice(0, 80)})` : ""}</div>
      </div>
    );
  }
  const hasLev = o.gapValueTwd > 0 && regime !== DEFENSE;
  return (
    <div class="card">
      <div class="order-head">
        <span class="order-sym">{o.symbol}</span>
        <span class={q.change_pct >= 0 ? "chg-up num" : "chg-down num"}>
          {localPrice(q)}　{pct(q.change_pct)}
        </span>
      </div>
      <div class="cap3" style="margin-bottom:8px"><SourceBadge q={q} /></div>

      <div class="kv"><span class="k">目標市值（現股）</span><span class="v">{twd(o.actualValueTwd)}</span></div>
      <div class="kv"><span class="k">目標股數</span>
        <span class="v">{o.shares === 0 ? <span class="badge warn">本金不足最小單位</span> : num(o.shares, 0) + " 股"}</span></div>
      {o.shares === 0 && (q.category === "tw" || q.category === "two") && (
        <div class="cap3">台股以千股為單位取整；此檔目標金額 {twd(o.targetValueTwd)} 不足一張，可考慮零股或提高本金。</div>
      )}
      <div class="kv">
        <span class="k">{o.limit.mode === "watch" ? "觀察價（60MA，防守不建倉）" : "建議限價"}</span>
        <span class="v num" style={o.limit.mode === "watch" ? "color:var(--down)" : "font-weight:700"}>
          {num(o.limit.value)} {CUR[q.category]}</span>
      </div>
      <div class="kv"><span class="k">預期報酬（熊/基準/牛）</span>
        <span class={"v num" + (o.thesisExpired ? " gray-out" : "")}>
          {o.expected ? `${pct(o.expected.bear)} ～ ${pct(o.expected.bull)}（基準 ${pct(o.expected.base)}）` : "—"}
        </span></div>
      {o.thesisExpired && <div class="cap3" style="color:var(--warn)">⚠ 目標價已過 thesis_expiry，請重估。</div>}
      <div class="kv"><span class="k">抱的週期</span><span class="v">{o.hold}</span></div>
      <div class="kv"><span class="k">退出條件</span><span class="v" style="max-width:60%">{o.exit}</span></div>

      <Thesis t={thesis} />

      {hasLev && (
        <div style="margin-top:10px">
          <hr class="sep" />
          <div class="cap" style="margin-bottom:6px">槓桿層 {twd(o.gapValueTwd)}</div>
          {o.planB ? (
            <div>
              <Segmented value={plan} onChange={setPlan} options={[
                { value: "A", label: "方案A 融資" }, { value: "B", label: "方案B LEAPS" }]} />
              <div style="margin-top:8px">{plan === "A" ? <PlanA o={o} /> : <PlanB o={o} />}</div>
            </div>
          ) : o.planA ? <PlanA o={o} /> : null}
        </div>
      )}
    </div>
  );
}

export function Orders({ st }) {
  const { data, config, user, directive, signals, phase } = st;
  if (!data || !config || !signals || !directive || !phase) {
    return <div><h2 class="lt">下單</h2><div class="cap">等待資料…（需 latest.json 與制度訊號）</div></div>;
  }

  const result = buildOrders({
    capital: user.capital, directive, regime: signals.regime, rotation: signals.rotation,
    phase, quotes: data.quotes, fx: data.fx, targets: config.targets,
    settings: config.settings, options: data.options,
  });
  const diffs = diffHoldings(result.orders, user.holdings);
  const theses = config.theses || {};

  // 依階段主題順序分組
  const byTheme = new Map();
  for (const th of phase.themes) {
    if ((th.tickers || []).length) byTheme.set(th.name, { theme: th, orders: [] });
  }
  for (const o of result.orders) byTheme.get(o.theme)?.orders.push(o);

  return (
    <div>
      <h2 class="lt">下單</h2>

      <div class="card">
        <div class="grid2">
          <div class="kv"><span class="k">現股層</span><span class="v">{twd(result.equity)}</span></div>
          <div class="kv"><span class="k">槓桿缺口</span><span class="v">{twd(result.gap)}</span></div>
          <div class="kv"><span class="k">現金保留（{(result.cashWeight * 100).toFixed(0)}%）</span><span class="v">{twd(result.cash)}</span></div>
          <div class="kv"><span class="k">目標總曝險</span><span class="v num">{(directive.exposure * 100).toFixed(0)}%</span></div>
        </div>
        <div class="cap3">匯率換算時點：{data.fx?.fetched_at?.slice(0, 16).replace("T", " ")}　USD/TWD {num(data.fx?.USDTWD)}　JPY/TWD {num(data.fx?.JPYTWD, 4)}</div>
      </div>

      <div class="card">
        <strong>與現況差異</strong>
        <div class="cap3" style="margin-bottom:4px">對照「追蹤」頁登記的實際持倉</div>
        {diffs.length === 0 ? (
          <div class="cap">✓ 與目標一致（或尚未登記持倉）</div>
        ) : (
          <div class="list">
            {diffs.map((d) => (
              <div class="lrow" key={d.symbol}>
                <strong>{d.symbol}</strong>
                <span class={d.action === "加碼" ? "chg-up" : "chg-down"}>
                  {d.action}　<span class="num">{num(d.shares, 0)} 股</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {[...byTheme.values()].filter((g) => g.orders.length).map((g) => {
        const subtotal = g.orders.reduce((s, o) => s + (o.actualValueTwd || 0), 0);
        return (
          <section key={g.theme.name}>
            <div class="theme-head">
              <div class="row">
                <strong>{g.theme.name}</strong>
                <span class="cap num">{(g.theme.weight * 100).toFixed(0)}%　·　{twd(subtotal)}</span>
              </div>
              {g.theme.rotation_only && <span class="cap3">輪動觸發倉——僅輪動訊號成立時啟用</span>}
            </div>
            {g.orders.map((o) => (
              <OrderCard key={o.symbol} o={o} regime={signals.regime} thesis={theses[o.symbol]} />
            ))}
          </section>
        );
      })}

      <div class="cap3" style="padding:4px 8px">
        ⚠ 各檔論述數字為單一分析師 channel check（CAPEX +30%、TPU 1,000 萬顆、HDD 缺口 30%），
        非公開共識——當假設用，每季以財報驗證。最早證偽點：2027 年初 CSP CAPEX 指引、TER CPO 出貨（追蹤頁檢查點①②）。
      </div>
    </div>
  );
}
