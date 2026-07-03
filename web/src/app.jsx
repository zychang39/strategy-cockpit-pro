import { useState } from "preact/hooks";
import { useAppState } from "./state.js";
import { SheetCtx, StockSheet } from "./sheet.jsx";
import { Today } from "./pages/today.jsx";
import { Orders } from "./pages/orders.jsx";
import { Strategy } from "./pages/strategy.jsx";
import { Scenario } from "./pages/scenario.jsx";
import { Holdings } from "./pages/holdings.jsx";

const TABS = [
  { id: "today", label: "今日", ico: "◉" },
  { id: "orders", label: "下單", ico: "≡" },
  { id: "strategy", label: "策略", ico: "❖" },
  { id: "scenario", label: "情境", ico: "∿" },
  { id: "holdings", label: "持倉", ico: "✓" },
];

const DISCLAIMER = "本工具僅供個人紀律管理，非投資建議。融資有斷頭風險、選擇權可能歸零，槓桿請以自身風險承受度為準。";

export function App() {
  const [tab, setTab] = useState("today");
  const [sheetSym, setSheetSym] = useState(null);
  const st = useAppState();

  const page = {
    today: <Today st={st} />,
    orders: <Orders st={st} />,
    strategy: <Strategy st={st} />,
    scenario: <Scenario st={st} />,
    holdings: <Holdings st={st} />,
  }[tab];

  return (
    <SheetCtx.Provider value={{ open: setSheetSym }}>
      <div class="layout">
        <nav class="sidebar">
          <h1>策略操作台 Pro</h1>
          {TABS.map((t) => (
            <button key={t.id} class={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>
              <span class="ico">{t.ico}</span>{t.label}
            </button>
          ))}
        </nav>
        <main class="content">
          {st.loadError && (
            <div class="banner red">⚠ 資料載入失敗：{st.loadError}。請先執行 make run-local 或確認部署。</div>
          )}
          {page}
          <footer class="disclaimer">{DISCLAIMER}</footer>
        </main>
        <nav class="tabbar">
          {TABS.map((t) => (
            <button key={t.id} class={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}
              aria-label={t.label}>
              <span class="ico">{t.ico}</span><span>{t.label}</span>
            </button>
          ))}
        </nav>
        {sheetSym && <StockSheet sym={sheetSym} st={st} onClose={() => setSheetSym(null)} />}
      </div>
    </SheetCtx.Provider>
  );
}
