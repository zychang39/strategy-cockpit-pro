import { useState } from "preact/hooks";
import { useAppState } from "./state.js";
import { Today } from "./pages/today.jsx";
import { Alloc } from "./pages/alloc.jsx";
import { Orders } from "./pages/orders.jsx";
import { Scenario } from "./pages/scenario.jsx";
import { Track } from "./pages/track.jsx";

const TABS = [
  { id: "today", label: "今日", ico: "◉" },
  { id: "alloc", label: "配置", ico: "◔" },
  { id: "orders", label: "下單", ico: "≡" },
  { id: "scenario", label: "情境", ico: "∿" },
  { id: "track", label: "追蹤", ico: "✓" },
];

const DISCLAIMER = "本工具僅供個人紀律管理，非投資建議。融資有斷頭風險、選擇權可能歸零，槓桿請以自身風險承受度為準。";

export function App() {
  const [tab, setTab] = useState("today");
  const st = useAppState();

  const page = {
    today: <Today st={st} />,
    alloc: <Alloc st={st} />,
    orders: <Orders st={st} />,
    scenario: <Scenario st={st} />,
    track: <Track st={st} />,
  }[tab];

  return (
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
    </div>
  );
}
