import { render } from "preact";
import { App } from "./app.jsx";
import "./styles.css";

render(<App />, document.getElementById("app"));

// PWA service worker（離線可看最後一次資料）
if ("serviceWorker" in navigator && !import.meta.env.DEV) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(import.meta.env.BASE_URL + "sw.js").catch(() => {});
  });
}
