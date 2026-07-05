// 下單：資金/槓桿控制（即時連動）＋ 券商別槓桿執行策略（永豐大戶投 / IB）
import { useState } from "preact/hooks";
import { buildOrders, diffHoldings, DEFENSE } from "../engine.js";
import { Segmented, Donut } from "../components.jsx";
import { Sym, NAMES } from "../sheet.jsx";
import { twd, num, pct, localPrice, CUR } from "../fmt.js";

/* ---------- 資金與槓桿控制卡 ---------- */
const CAP_PRESETS = [1_000_000, 3_000_000, 5_000_000, 10_000_000];
const LEV_OPTS = [1.0, 1.1, 1.2, 1.3, 1.5, 1.8];

function wan(v) { return v >= 10000 ? (v / 10000).toLocaleString("zh-TW") + " 萬" : v; }

function ControlCard({ st, phase, phases, directive, signals, preview, setPreview }) {
  const { user, setKv } = st;
  const locked = directive.leverage <= 1;   // 制度鎖 1.0×
  const pickLev = (v) => {
    setKv("levCap", v);
    if (locked && v > 1.001) setPreview(true);   // 鎖定時點槓桿 → 自動進入預演
    if (v <= 1.001) setPreview(false);
  };
  const [editCap, setEditCap] = useState(false);
  const step = (d) => setKv("capital", Math.max(0, (user.capital || 0) + d));

  return (
    <div class="card">
      {/* 階段 */}
      <div class="cap" style="margin-bottom:6px">階段（自動依日期）</div>
      <Segmented options={phases.map((p) => ({ value: p.id, label: p.name }))}
        value={phase.id} onChange={(v) => setKv("phaseOverride", v)} />
      {user.phaseOverride != null && (
        <button class="btn small gray" style="margin-top:6px" onClick={() => setKv("phaseOverride", null)}>回到自動選階段</button>
      )}
      <hr class="sep" />

      {/* 本金 */}
      <div class="row">
        <span class="cap">本金（TWD）</span>
        <div style="display:flex;gap:6px">
          <button class="btn small gray" onClick={() => step(-100_000)}>−10萬</button>
          <button class="btn small gray" onClick={() => step(100_000)}>＋10萬</button>
        </div>
      </div>
      {editCap ? (
        <input type="number" autofocus min="0" step="100000" value={user.capital}
          onBlur={() => setEditCap(false)}
          onChange={(e) => { setKv("capital", Number(e.currentTarget.value) || 0); }} />
      ) : (
        <button class="cap-display num" onClick={() => setEditCap(true)}
          title="點擊直接輸入">{twd(user.capital)}<span class="cap3">　點擊修改</span></button>
      )}
      <div class="chip-row">
        {CAP_PRESETS.map((v) => (
          <button key={v} class={"chip-select" + (user.capital === v ? " active" : "")}
            onClick={() => setKv("capital", v)}>{wan(v)}</button>
        ))}
      </div>
      <hr class="sep" />

      {/* 槓桿 */}
      <div class="cap" style="margin-bottom:6px">槓桿上限（進攻制度才動用；改了下方立即重算）</div>
      <div class="chip-row">
        {LEV_OPTS.map((v) => (
          <button key={v}
            class={"chip-select num" + (Math.abs(user.levCap - v) < 0.01 ? " active" : "") + (v > 1.31 ? " warn" : "")}
            onClick={() => pickLev(v)}>{v.toFixed(1)}×</button>
        ))}
      </div>
      {user.levCap > 1.31 && (
        <div class="cap3" style="color:var(--warn);margin-top:4px">⚠ 1.3× 以上在本框架無支持理由——「如果回檔讓你有壓力，我建議不要。」</div>
      )}
      <div style="margin-top:8px">
        <Segmented value={preview ? "preview" : "regime"} onChange={(v) => setPreview(v === "preview")} options={[
          { value: "regime", label: "依今日制度" },
          { value: "preview", label: "進攻預演" }]} />
        <div class="cap3" style="margin-top:4px">
          {preview
            ? "預演：以進攻水位 95% × 你選的槓桿計算全頁（忽略今日制度與證偽/斷路器）。"
            : locked ? "今日制度鎖 1.0×——選 1.1× 以上會自動切到預演看槓桿方案。" : "依今日制度計算。"}
        </div>
      </div>
      <hr class="sep" />

      {/* 台股槓桿工具 */}
      <div class="cap" style="margin-bottom:6px">台股槓桿工具（永豐大戶投）</div>
      <Segmented value={user.twMode} onChange={(v) => setKv("twMode", v)} options={[
        { value: "mixed", label: "現股+股期" },
        { value: "futures", label: "全股期" },
        { value: "financing", label: "融資/質押" }]} />
      <div class="cap3" style="margin-top:6px">
        {user.twMode === "mixed" && "現股買到 100%，槓桿缺口用個股期補；無股期或不足一口 → 融資。"}
        {user.twMode === "futures" && "整筆曝險改用個股期（保證金交易，釋放現金）；零頭與無股期標的仍用現股。"}
        {user.twMode === "financing" && "槓桿缺口全用融資（自備 40%）；卡片另列質押借款方案比較。"}
      </div>
      <hr class="sep" />

      {/* 台股/美股市場配比 */}
      <div class="cap" style="margin-bottom:6px">台股／美股配比</div>
      <Segmented value={user.splitMode} onChange={(v) => setKv("splitMode", v)} options={[
        { value: "auto", label: "依主題權重（自動）" },
        { value: "custom", label: "自訂比例" }]} />
      {user.splitMode === "custom" && (() => {
        const investable = user.capital * directive.exposure;
        const twAmt = investable * user.twPct / 100;
        const usAmt = investable - twAmt;
        const setTw = (v) => setKv("twPct", Math.max(0, Math.min(100, Math.round(v))));
        return (
          <div style="margin-top:8px">
            <div class="row">
              <span class="cap">台股 <b class="num">{user.twPct}%</b></span>
              <span class="cap">美股 <b class="num">{100 - user.twPct}%</b></span>
            </div>
            <input type="range" min="0" max="100" step="5" value={user.twPct}
              onInput={(e) => setTw(Number(e.currentTarget.value))} />
            <div class="grid2">
              <div>
                <div class="cap3">台股金額（改了自動換算比例）</div>
                <input type="number" min="0" step="100000" value={Math.round(twAmt)}
                  onChange={(e) => investable > 0 && setTw((Number(e.currentTarget.value) || 0) / investable * 100)} />
              </div>
              <div>
                <div class="cap3">美股金額</div>
                <input type="number" min="0" step="100000" value={Math.round(usAmt)}
                  onChange={(e) => investable > 0 && setTw(100 - (Number(e.currentTarget.value) || 0) / investable * 100)} />
              </div>
            </div>
            <div class="cap3" style="margin-top:4px">在市場內按原主題權重等比縮放（總額不變）。作者參考分法：美股 60–70%、台股 30–40%。</div>
          </div>
        );
      })()}
      <hr class="sep" />

      {/* 即時摘要 */}
      <div class="grid2">
        <div class="kv"><span class="k">制度</span><span class="v">{preview
          ? <span class="badge warn">進攻預演 {directive.leverage.toFixed(1)}×</span>
          : `${signals.regime_label}（允許 ${directive.leverage.toFixed(1)}×）`}</span></div>
        <div class="kv"><span class="k">目標總曝險</span><span class="v num" style="font-weight:700">{(directive.exposure * 100).toFixed(0)}%</span></div>
        <div class="kv"><span class="k">曝險金額</span><span class="v">{twd(user.capital * directive.exposure)}</span></div>
        <div class="kv"><span class="k">槓桿缺口</span><span class="v">{twd(user.capital * Math.max(directive.exposure - 1, 0))}</span></div>
      </div>

    </div>
  );
}

/* ---------- 槓桿執行策略（逐步） ---------- */
const Step = ({ n, children }) => (
  <div class="step"><span class="step-n">{n}</span><span style="flex:1">{children}</span></div>
);

function FuturesBlock({ f, price, cur }) {
  return (
    <div>
      <div class="kv"><span class="k">口數（1口=2,000股）</span><span class="v num" style="font-weight:700">{f.contracts} 口{f.fname ? `（${f.fname}）` : ""}</span></div>
      <div class="kv"><span class="k">等效曝險</span><span class="v">{twd(f.notional)}（{num(f.eqShares, 0)} 股）</span></div>
      <div class="kv"><span class="k">最低保證金</span><span class="v">{twd(f.marginMin)}</span></div>
      <div class="kv"><span class="k">建議入金（{f.bufferX}× 緩衝）</span><span class="v" style="font-weight:700">{twd(f.marginSug)}</span></div>
      <div class="kv"><span class="k">補繳警戒</span>
        <span class="v chg-down num">只放最低：跌 {f.dropMin.toFixed(1)}%｜放緩衝：跌 {f.dropSug.toFixed(1)}%</span></div>
      {!f.liquid && <div class="cap3" style="color:var(--warn)">⚠ 此股期深度較淺——限價分批進出、避免市價單，留意近月轉倉價差。</div>}
    </div>
  );
}

function TwLeverage({ o }) {
  const q = o.quote;
  return (
    <div>
      {o.futFull && (
        <div>
          <div class="cap" style="margin-bottom:6px">全股期執行（釋放現金 {twd(Math.max(o.targetValueTwd + o.gapValueTwd - o.futFull.marginSug - o.shares * q.price, 0))}）</div>
          <Step n="1">期貨帳戶入金 <b class="num">{twd(o.futFull.marginSug)}</b>（{o.futFull.bufferX}× 緩衝）</Step>
          <Step n="2">買進 {o.futFull.fname || "個股期"} <b class="num">{o.futFull.contracts} 口</b>（近月，到期前 3–5 天轉倉）</Step>
          {o.shares > 0 && <Step n="3">零頭 <b class="num">{num(o.shares, 0)} 股</b> 用現股補（限價 {num(o.limit.value)}）</Step>}
          <FuturesBlock f={o.futFull} price={q.price} cur={CUR[q.category]} />
        </div>
      )}
      {o.futGap && (
        <div>
          <div class="cap" style="margin-bottom:6px">槓桿缺口 {twd(o.gapValueTwd)} → 股期優先</div>
          <Step n="1">現股先買滿目標股數（見上方）</Step>
          <Step n="2">缺口買 {o.futGap.fname || "個股期"} <b class="num">{o.futGap.contracts} 口</b>，入金 <b class="num">{twd(o.futGap.marginSug)}</b></Step>
          {o.planA && <Step n="3">零頭 {twd(o.planA.loan + (o.planA.selfFunded || 0))} 用融資（自備40%、年率 {(o.planA.rate * 100).toFixed(1)}%）</Step>}
          <FuturesBlock f={o.futGap} price={q.price} cur={CUR[q.category]} />
        </div>
      )}
      {!o.futFull && !o.futGap && o.planA && (
        <div>
          {o.noFutNote && <div class="cap3" style="color:var(--warn);margin-bottom:6px">⚠ {o.noFutNote}</div>}
          <div class="kv"><span class="k">融資買進金額</span><span class="v">{twd(o.gapValueTwd)}</span></div>
          <div class="kv"><span class="k">自備款 40% / 融資 60%</span><span class="v">{twd(o.planA.selfFunded)} / {twd(o.planA.loan)}</span></div>
          <div class="kv"><span class="k">年利率</span><span class="v num">{(o.planA.rate * 100).toFixed(1)}%</span></div>
          <div class="kv"><span class="k">維持率 130% 警戒價</span><span class="v chg-down">{num(o.planA.alertPrice)}（{pct(o.planA.alertDropPct)}）</span></div>
        </div>
      )}
      {o.pledge && !o.futFull && (
        <details class="thesis" style="margin-top:8px">
          <summary>替代方案：質押借款（不限用途借款）</summary>
          <div class="thesis-body">
            <div class="kv"><span class="k">借 {twd(o.pledge.loan)} 需質押現股市值</span><span class="v">{twd(o.pledge.collateralNeeded)}（成數 {(o.pledge.ltv * 100).toFixed(0)}%）</span></div>
            <div class="kv"><span class="k">年利率（依核貸）</span><span class="v num">{(o.pledge.rate * 100).toFixed(1)}%</span></div>
            <div class="cap3">利率低於融資、無 130% 維持率斷頭線（但有擔保維持率），適合長抱部位。用既有持股質押、借出的錢買進本檔。</div>
          </div>
        </details>
      )}
    </div>
  );
}

function UsLeverage({ o }) {
  const [plan, setPlan] = useState("A");
  const q = o.quote;
  const A = (
    <div>
      <Step n="1">IB 帳戶維持足夠現金/證券作為保證金（Reg-T 初始 50%）</Step>
      <Step n="2">直接以 margin 買進缺口 <b class="num">{twd(o.gapValueTwd)}</b>（IB 自動借款，年率約 {(o.planA.rate * 100).toFixed(1)}%，分層計息）</Step>
      <div class="kv" style="margin-top:6px"><span class="k">維持保證金 25% 警戒價</span>
        <span class="v chg-down">{num(o.planA.alertPrice)} {CUR[q.category]}（{pct(o.planA.alertDropPct)}）</span></div>
      <div class="cap3">IB 不發追繳通知、直接強平——警戒價前務必主動降槓桿。</div>
    </div>
  );
  const B = o.planB && (o.planB.live ? (
    <div>
      <Step n="1">買 deep ITM LEAPS Call：履約價 <b class="num">{num(o.planB.strike)}</b>（{o.planB.expiry}）</Step>
      <Step n="2"><b class="num">{o.planB.contracts} 口</b> × 權利金 US${num(o.planB.premiumEach)} = US${num(o.planB.premiumTotal, 0)}</Step>
      <div class="kv" style="margin-top:6px"><span class="k">delta / 每口等效曝險</span><span class="v num">{o.planB.delta} / US${num(o.planB.perContract, 0)}</span></div>
      <div class="kv"><span class="k">最大損失（＝權利金）</span><span class="v chg-down">US${num(o.planB.maxLoss, 0)}</span></div>
      <div class="cap3">無斷頭風險、無利息；代價是時間價值。到期 9–15 個月、delta 0.75–0.85。</div>
    </div>
  ) : <div class="cap">選擇權報價暫缺（估算：履約價 {num(o.planB.strike)}、{o.planB.contracts} 口）。</div>);
  return o.planB ? (
    <div>
      <Segmented value={plan} onChange={setPlan} options={[
        { value: "A", label: "IB Margin" }, { value: "B", label: "LEAPS" }]} />
      <div style="margin-top:8px">{plan === "A" ? A : B}</div>
    </div>
  ) : A;
}

/* ---------- 部位卡 ---------- */
function OrderCard({ o, regime }) {
  const q = o.quote;
  if (o.missing) {
    return (
      <div class="card">
        <div class="order-head"><Sym s={o.symbol}><span class="order-sym">{o.symbol}</span></Sym><span class="badge up">資料缺漏</span></div>
      </div>
    );
  }
  const isTw = q.category === "tw" || q.category === "two";
  const hasLev = (o.gapValueTwd > 0 && regime !== DEFENSE) || o.futFull;
  return (
    <div class="card">
      <div class="order-head">
        <Sym s={o.symbol}>
          <span class="order-sym">{o.symbol}</span>
          <span class="muted" style="font-size:13px">　{NAMES[o.symbol] || ""}</span>
        </Sym>
        <span class={q.change_pct >= 0 ? "chg-up num" : "chg-down num"}>
          {localPrice(q)}　{pct(q.change_pct)}
        </span>
      </div>

      <div class="kv"><span class="k">目標市值</span><span class="v">{twd(o.actualValueTwd)}</span></div>
      <div class="kv"><span class="k">{o.futFull ? "現股零頭" : "目標股數"}</span>
        <span class="v">{o.shares === 0 && !o.futFull ? <span class="badge warn">本金不足最小單位</span> : num(o.shares, 0) + " 股"}</span></div>
      {o.shares === 0 && !o.futFull && isTw && (
        <div class="cap3">台股千股取整；目標 {twd(o.targetValueTwd)} 不足一張，可考慮零股、切「全股期」或提高本金。</div>
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
      <div class="kv"><span class="k">抱的週期 / 退出</span><span class="v" style="max-width:60%">{o.hold}　·　{o.exit}</span></div>

      {hasLev && (
        <div style="margin-top:10px">
          <hr class="sep" />
          <div class="cap" style="margin-bottom:8px;font-weight:700">
            {isTw ? "槓桿執行（永豐大戶投）" : "槓桿執行（IB）"}{o.gapValueTwd > 0 ? `　缺口 ${twd(o.gapValueTwd)}` : ""}
          </div>
          {isTw ? <TwLeverage o={o} /> : <UsLeverage o={o} />}
        </div>
      )}
    </div>
  );
}

/* ---------- 頁面 ---------- */
export function Orders({ st }) {
  const { data, config, user, directive: liveDirective, signals, phase } = st;
  const [showWeights, setShowWeights] = useState(false);
  const [preview, setPreview] = useState(false);
  if (!data || !config || !signals || !liveDirective || !phase) {
    return <div><h2 class="lt">下單</h2><div class="cap">等待資料…</div></div>;
  }
  const phases = config.phases?.phases || [];

  // 進攻預演：95% 水位 × 使用者槓桿，全頁以此計算（含層別拆分與每檔股數）
  const directive = preview
    ? { position: 0.95, leverage: user.levCap, exposure: 0.95 * user.levCap, falsified: false, breaker: null, notes: [] }
    : liveDirective;
  const regime = preview ? "offense" : signals.regime;

  const result = buildOrders({
    capital: user.capital, directive, regime, rotation: signals.rotation,
    phase, quotes: data.quotes, fx: data.fx, targets: config.targets,
    settings: config.settings, options: data.options,
    instruments: config.instruments?.instruments, twMode: user.twMode,
    splitMode: user.splitMode, twPct: user.twPct,
  });
  const diffs = diffHoldings(result.orders, user.holdings, data.quotes, data.fx, user.capital);

  const byTheme = new Map();
  for (const th of phase.themes) if ((th.tickers || []).length) byTheme.set(th.name, { theme: th, orders: [] });
  for (const o of result.orders) byTheme.get(o.theme)?.orders.push(o);

  return (
    <div>
      <h2 class="lt">下單</h2>

      {preview && (
        <div class="banner amber" style="position:sticky;top:8px;z-index:20">
          ⚡ 進攻預演中——以 95% × {user.levCap.toFixed(1)}× ＝ 曝險 {(directive.exposure * 100).toFixed(0)}% 計算，
          <b>非今日制度指令</b>（今日：{signals.regime_label} {(liveDirective.exposure * 100).toFixed(0)}%）。
          <button class="btn small gray" style="margin-left:8px" onClick={() => setPreview(false)}>回到制度</button>
        </div>
      )}
      <ControlCard st={st} phase={phase} phases={phases} directive={directive} signals={signals}
        preview={preview} setPreview={setPreview} />

      <div class="card">
        <div class="row">
          <strong>層別拆分</strong>
          <button class="btn small gray" onClick={() => setShowWeights(!showWeights)}>{showWeights ? "收合權重" : "權重圖"}</button>
        </div>
        {showWeights && <div style="margin:10px 0"><Donut items={phase.themes.map((t) => ({ name: t.name, weight: t.weight }))} /></div>}
        <div class="grid2" style="margin-top:6px">
          <div class="kv"><span class="k">現股層</span><span class="v">{twd(result.equity)}</span></div>
          <div class="kv"><span class="k">槓桿缺口</span><span class="v">{twd(result.gap)}</span></div>
          <div class="kv"><span class="k">現金保留（{(result.cashWeight * 100).toFixed(0)}%）</span><span class="v">{twd(result.cash)}</span></div>
          <div class="kv"><span class="k">目標總曝險</span><span class="v num">{(directive.exposure * 100).toFixed(0)}%</span></div>
          <div class="kv"><span class="k">台股（含槓桿層）</span><span class="v num">{twd(result.marketTw)}（{result.marketTw + result.marketUs > 0 ? (result.marketTw / (result.marketTw + result.marketUs) * 100).toFixed(0) : 0}%）</span></div>
          <div class="kv"><span class="k">美股（含槓桿層）</span><span class="v num">{twd(result.marketUs)}（{result.marketTw + result.marketUs > 0 ? (result.marketUs / (result.marketTw + result.marketUs) * 100).toFixed(0) : 0}%）</span></div>
        </div>
        <div class="cap3" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <span>匯率（每日隨行情更新 {data.fx?.fetched_at?.slice(5, 16).replace("T", " ")}）：</span>
          <Sym s="TWD=X">USD/TWD {num(data.fx?.USDTWD)} ↗</Sym>
          <Sym s="JPY=X">USD/JPY {num(data.quotes?.["JPY=X"]?.price)} ↗</Sym>
          <span>JPY/TWD {num(data.fx?.JPYTWD, 4)}</span>
        </div>
      </div>

      <div class="card">
        <div class="row">
          <strong>與現況差異</strong>
          <span class="cap num">共 {diffs.length} 筆　合計 {twd(diffs.reduce((s2, d) => s2 + d.valueTwd, 0))}</span>
        </div>
        <div class="cap3" style="margin-bottom:4px">對照「持倉」頁登記的實際部位（金額基準——不足一張的零股缺口也列出）</div>
        {diffs.length === 0 ? (
          <div class="cap">✓ 與目標一致（或尚未登記持倉）</div>
        ) : (
          <div class="list">
            {diffs.map((d) => (
              <div class="lrow" key={d.symbol} style="align-items:center">
                <div class="col" style="gap:0;flex:1">
                  <Sym s={d.symbol}><strong>{d.symbol}</strong><span class="muted" style="font-size:12px">　{NAMES[d.symbol] || ""}</span></Sym>
                  <span class="cap3 num">{twd(d.valueTwd)}　≈ US${num(d.valueUsd, 0)}{d.pctCap != null ? `　·　本金 ${d.pctCap.toFixed(1)}%` : ""}</span>
                </div>
                <span class={"chip " + (d.action === "買進" ? "chip-buy" : "chip-sell")}>
                  {d.action}　{d.shares != null ? num(d.shares, 0) + " 股" : "零股/不足一張"}
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
            {g.orders.map((o) => <OrderCard key={o.symbol} o={o} regime={regime} />)}
          </section>
        );
      })}

      <div class="cap3" style="padding:4px 8px">
        ⚠ 保證金/利率為 config 預設值，請依永豐大戶投與 IB 實際帳戶條件修改 settings.yaml。
        論述數字為單一分析師 channel check，每季以財報驗證。
      </div>
    </div>
  );
}
