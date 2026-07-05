// 全域狀態：latest.json / config.json + 使用者狀態（IndexedDB）+ 衍生指令
import { useState, useEffect, useCallback } from "preact/hooks";
import { kvGet, kvSet, navAll, holdingsAll } from "./db.js";
import { applyModifiers, drawdownStats, currentPhase } from "./engine.js";

const BASE = import.meta.env.BASE_URL || "./";

export function useAppState() {
  const [data, setData] = useState(null);       // latest.json
  const [config, setConfig] = useState(null);   // config.json
  const [loadError, setLoadError] = useState(null);
  const [user, setUser] = useState({
    capital: 1_000_000, levCap: 1.3, phaseOverride: null,
    checkpoints: {}, triggers: {}, nav: [], holdings: [], gClientId: "", gLastSync: null, twMode: "mixed", splitMode: "auto", twPct: 35,
  });
  const [tick, setTick] = useState(0);
  const refreshUser = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    (async () => {
      try {
        const [d, c] = await Promise.all([
          fetch(BASE + "data/latest.json").then((r) => { if (!r.ok) throw new Error("latest.json " + r.status); return r.json(); }),
          fetch(BASE + "data/config.json").then((r) => { if (!r.ok) throw new Error("config.json " + r.status); return r.json(); }),
        ]);
        setData(d); setConfig(c);
      } catch (e) { setLoadError(String(e)); }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      setUser({
        capital: await kvGet("capital", 1_000_000),
        levCap: await kvGet("levCap", 1.3),
        phaseOverride: await kvGet("phaseOverride", null),
        checkpoints: await kvGet("checkpoints", {}),
        triggers: await kvGet("triggers", {}),
        twMode: await kvGet("twMode", "mixed"),
        splitMode: await kvGet("splitMode", "auto"),
        twPct: await kvGet("twPct", 35),
        nav: await navAll(),
        holdings: await holdingsAll(),
        gClientId: await kvGet("gClientId", ""),
        gLastSync: await kvGet("gLastSync", null),
      });
    })();
  }, [tick]);

  // 樂觀更新：先改記憶體讓 UI 立即重算，再背景寫入 IndexedDB
  const setKv = (k, v) => {
    setUser((u) => ({ ...u, [k]: v }));
    kvSet(k, v).catch(() => {});
  };

  // ---- 衍生 ----
  const signals = data?.signals || null;
  const falsifiedAny = Object.values(user.checkpoints || {}).includes("falsified");
  const dd = drawdownStats(user.nav);
  const directive = signals
    ? applyModifiers(signals, user.levCap, falsifiedAny, dd.drawdown) : null;
  const phase = config ? currentPhase(config.phases, null, user.phaseOverride) : null;

  return {
    data, config, loadError, user, setKv, refreshUser,
    signals, directive, falsifiedAny, dd, phase,
  };
}
