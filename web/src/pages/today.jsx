// 今日：制度水位計、指令卡片流、我的組合快照、SOX/QQQ（點擊開圖表）
import { Gauge, RegimeBadge, Spark } from "../components.jsx";
import { Sym } from "../sheet.jsx";
import { fxRate, twd, pct, num, fmtDate } from "../fmt.js";

export function Today({ st }) {
  const { data, signals, directive, falsifiedAny, dd, user } = st;
  if (!data) return <h2 class="lt">今日</h2>;

  const sox = data.quotes?.["^SOX"], qqq = data.quotes?.["QQQ"];
  const missing = Object.values(data.quotes || {}).filter((q) => q.error);

  // 我的組合快照（與持倉頁連動）
  let port = null;
  if (user.holdings.length) {
    let value = 0, prev = 0, costV = 0, hasCost = true;
    for (const h of user.holdings) {
      const q = data.quotes?.[h.symbol];
      const r = q ? fxRate(q.category, data.fx) : null;
      if (!q?.price || !r) continue;
      value += h.shares * q.price * r;
      prev += h.shares * (q.prev_close ?? q.price) * r;
      if (h.cost != null) costV += h.shares * h.cost * r; else hasCost = false;
    }
    port = { value, dayChg: prev ? (value / prev - 1) * 100 : null,
             totChg: hasCost && costV ? (value / costV - 1) * 100 : null };
  }

  return (
    <div>
      <h2 class="lt">今日</h2>

      {data.sample && (
        <div class="banner amber">◈ 樣本資料（{data.scenario || "fixture"}）— 請執行 python fetch.py 接上真實行情。</div>
      )}
      {falsifiedAny && (
        <div class="banner red">■ 論述證偽生效：持股水位 −20pp、槓桿鎖 1.0×（優先於一切價格訊號）。請至「持倉」頁檢視檢查點。</div>
      )}
      {directive?.breaker === "force_delever" && (
        <div class="banner red">■ 回撤斷路器 −15%：槓桿歸 1.0×，僅保留現股。</div>
      )}
      {directive?.breaker === "review" && (
        <div class="banner amber">◆ 淨值自高點回撤 {pct(dd.drawdown * 100)}：請重新檢視槓桿。</div>
      )}

      {signals ? (
        <div class="card">
          <div class="row">
            <RegimeBadge regime={signals.regime} label={signals.regime_label} />
            <span class="cap">SOX vs 30/60MA 判定</span>
          </div>
          {directive && <Gauge exposure={directive.exposure} regime={signals.regime} />}
          <div class="grid2" style="margin-top:12px">
            <div class="kv"><span class="k">目標持股水位</span><span class="v num">{(directive.position * 100).toFixed(0)}%</span></div>
            <div class="kv"><span class="k">允許槓桿</span><span class="v num">{directive.leverage.toFixed(1)}×</span></div>
          </div>
        </div>
      ) : (
        <div class="banner red">⚠ SOX / QQQ 均線資料缺漏，無法判定制度。</div>
      )}

      {port && (
        <div class="card">
          <div class="row">
            <strong>我的組合</strong>
            <span class="num" style="font-weight:700">{twd(port.value)}</span>
          </div>
          <div class="grid2" style="margin-top:6px">
            <div class="kv"><span class="k">今日</span>
              <span class={"v num " + (port.dayChg >= 0 ? "chg-up" : "chg-down")}>{pct(port.dayChg)}</span></div>
            <div class="kv"><span class="k">未實現（依成本）</span>
              <span class={"v num " + ((port.totChg ?? 0) >= 0 ? "chg-up" : "chg-down")}>
                {port.totChg == null ? "部分未填成本" : pct(port.totChg)}</span></div>
          </div>
        </div>
      )}

      {signals?.rotation && (
        <div class="card accent">
          <div class="row"><strong style="color:var(--tint)">⇄ 資金輪動訊號</strong></div>
          <p style="margin-top:8px">SOX 破 30MA 而 QQQ 未破——<strong>市場正在用股價投票</strong>。
            加碼 <Sym s="GOOGL" /> <Sym s="AMZN" /> <Sym s="NVDA" />，等比減碼半導體供應鏈主題。</p>
          <p class="cap" style="margin-top:6px">論述：2023 年購入的 H 系列伺服器 2027–28 折舊到期；
            當 CAPEX YoY（~30%）低於 RPO YoY，CSP 營業現金流轉正（檢查點⑦）。持有到折舊紅利兌現。</p>
        </div>
      )}
      {signals?.glue && (
        <div class="banner amber">◆ 均線黏合（|30MA−60MA| &lt; 5%）：單次減碼上限 20–30%，避免一根長黑一次砍 40%。</div>
      )}
      {signals?.qqq_below30 && (
        <div class="banner red">■ QQQ 破 30MA——大盤觸發：拉高現金 20%、先砍「線型最弱」的持股（跌到 120MA＝砍太慢）。
          加回條件：站回 30MA 且第二個交易日尾盤守住。</div>
      )}
      {signals?.double_break && (
        <div class="banner amber">◆ 費半與 QQQ 同破 30MA——「大家一起跌，不需要特別看 CSP」，照紀律減倉；channel check 改為每兩週。</div>
      )}
      {signals?.regime === "reduce" && (
        <div class="banner blue">◆ 減碼制度：跌破 30MA——先把槓桿歸 1.0×，再降現股倉位至 80%。不頭鐵、不逆勢。</div>
      )}
      {signals?.regime === "defense" && (
        <div class="banner blue">▼ 防守制度：禁用融資與槓桿型選擇權；下單頁僅顯示觀察價（60MA）。</div>
      )}

      {[["^SOX", "費城半導體", sox], ["QQQ", "NASDAQ 100", qqq]].map(([symId, name, q]) => q && (
        <div class="card" key={symId}>
          <div class="row">
            <Sym s={symId}><strong>{name} {symId}</strong></Sym>
            <span class={q.change_pct >= 0 ? "chg-up num" : "chg-down num"}>
              {num(q.price)}　{pct(q.change_pct)}
            </span>
          </div>
          {q.spark && <Spark data={q.spark} width={320} height={72} />}
          <div class="cap3">— 30MA {num(q.ma30)}　· 60MA {num(q.ma60)}
            {q.price > q.ma30 ? "（站上30MA）" : "（跌破30MA）"}　·　點標題開完整圖表</div>
        </div>
      ))}

      {missing.length > 0 && (
        <div class="card">
          <strong>資料缺漏</strong>
          <div class="src-badges">{missing.map((q) => <span key={q.symbol} class="badge up">{q.symbol}</span>)}</div>
        </div>
      )}

      <div class="cap3" style="text-align:center;margin-top:8px">
        資料更新：{fmtDate(data.generated_at)}　·　<Sym s="TWD=X">USD/TWD {num(data.fx?.USDTWD)} ↗</Sym>
      </div>
    </div>
  );
}
