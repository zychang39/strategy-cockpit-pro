// 今日：曝險水位計、制度徽章、指令卡片流、SOX/QQQ 迷你圖、資料時間與來源
import { Gauge, RegimeBadge, Spark, SourceBadge } from "../components.jsx";
import { pct, num, fmtDate } from "../fmt.js";

export function Today({ st }) {
  const { data, signals, directive, falsifiedAny, dd } = st;
  if (!data) return <h2 class="lt">今日</h2>;

  const sox = data.quotes?.["^SOX"], qqq = data.quotes?.["QQQ"];
  const missing = Object.values(data.quotes || {}).filter((q) => q.error);

  return (
    <div>
      <h2 class="lt">今日</h2>

      {data.sample && (
        <div class="banner amber">◈ 樣本資料（{data.scenario || "fixture"}）— 尚未接上真實行情。
          請執行 <code>python fetch.py --init-targets</code> 後重新整理。</div>
      )}
      {falsifiedAny && (
        <div class="banner red">■ 論述證偽生效：持股水位 −20pp、槓桿鎖 1.0×（優先於一切價格訊號）。
          請至「追蹤」頁檢視檢查點。</div>
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

      {signals?.rotation && (
        <div class="card accent">
          <div class="row"><strong style="color:var(--tint)">⇄ 資金輪動訊號</strong></div>
          <p style="margin-top:8px">SOX 破 30MA 而 QQQ 未破 —— 加碼 <strong>GOOGL / AMZN / NVDA</strong>，
            等比減碼半導體供應鏈主題。階段②的「CSP 觸發倉」已自動啟用。</p>
        </div>
      )}
      {signals?.glue && (
        <div class="banner amber">◆ 均線黏合（|30MA−60MA| &lt; 5%）：單次減碼上限 20–30%，避免一根長黑一次砍 40%。</div>
      )}
      {signals?.double_break && (
        <div class="banner amber">◆ 系統性回檔警示：SOX 與 QQQ 同破 30MA，channel check 改為每兩週。</div>
      )}
      {signals?.regime === "defense" && (
        <div class="banner blue">▼ 防守制度：禁用融資與槓桿型選擇權；下單頁僅顯示觀察價（60MA）。</div>
      )}

      {[["費城半導體 ^SOX", sox], ["NASDAQ 100 QQQ", qqq]].map(([name, q]) => q && (
        <div class="card" key={name}>
          <div class="row">
            <strong>{name}</strong>
            <span class={q.change_pct >= 0 ? "chg-up num" : "chg-down num"}>
              {num(q.price)}　{pct(q.change_pct)}
            </span>
          </div>
          {q.spark && <Spark data={q.spark} width={320} height={72} />}
          <div class="cap3">— 30MA {num(q.ma30)}　· 60MA {num(q.ma60)}
            {q.price > q.ma30 ? "（站上30MA）" : "（跌破30MA）"}</div>
        </div>
      ))}

      {missing.length > 0 && (
        <div class="card">
          <strong>資料缺漏</strong>
          <div class="src-badges">
            {missing.map((q) => <span key={q.symbol} class="badge up">{q.symbol}</span>)}
          </div>
        </div>
      )}

      <div class="cap3" style="text-align:center;margin-top:8px">
        資料更新：{fmtDate(data.generated_at)}　·　USD/TWD {num(data.fx?.USDTWD)}
      </div>
    </div>
  );
}
