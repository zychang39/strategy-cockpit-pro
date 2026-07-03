// IndexedDB — 使用者狀態（本金、槓桿上限、檢查點、淨值、實際持倉）
const DB_NAME = "strategy-cockpit-pro";
const VERSION = 1;

function open() {
  return new Promise((res, rej) => {
    const rq = indexedDB.open(DB_NAME, VERSION);
    rq.onupgradeneeded = () => {
      const db = rq.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      if (!db.objectStoreNames.contains("nav")) db.createObjectStore("nav", { keyPath: "date" });
      if (!db.objectStoreNames.contains("holdings")) db.createObjectStore("holdings", { keyPath: "symbol" });
    };
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const out = fn(s);
    t.oncomplete = () => res(out?.result !== undefined ? out.result : out);
    t.onerror = () => rej(t.error);
  });
}

const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export const kvGet = async (k, dflt = null) => {
  const db = await open();
  const v = await req(db.transaction("kv").objectStore("kv").get(k));
  return v === undefined ? dflt : v;
};
export const kvSet = (k, v) => tx("kv", "readwrite", (s) => s.put(v, k));

export const navAll = async () => {
  const db = await open();
  const all = await req(db.transaction("nav").objectStore("nav").getAll());
  return all.sort((a, b) => a.date.localeCompare(b.date));
};
export const navPut = (rec) => tx("nav", "readwrite", (s) => s.put(rec));
export const navDel = (date) => tx("nav", "readwrite", (s) => s.delete(date));

export const holdingsAll = async () => {
  const db = await open();
  return req(db.transaction("holdings").objectStore("holdings").getAll());
};
export const holdingPut = (rec) => tx("holdings", "readwrite", (s) => s.put(rec));
export const holdingDel = (symbol) => tx("holdings", "readwrite", (s) => s.delete(symbol));

// ---- 匯出 / 匯入（手機 ↔ Mac 同步用）----
export async function exportState() {
  const keys = ["capital", "levCap", "checkpoints", "phaseOverride"];
  const kv = {};
  for (const k of keys) kv[k] = await kvGet(k);
  return {
    app: DB_NAME, exported_at: new Date().toISOString(),
    kv, nav: await navAll(), holdings: await holdingsAll(),
  };
}

export async function importState(obj) {
  if (!obj || obj.app !== DB_NAME) throw new Error("格式不符：不是本工具的匯出檔");
  for (const [k, v] of Object.entries(obj.kv || {})) if (v != null) await kvSet(k, v);
  for (const r of obj.nav || []) await navPut(r);
  for (const h of obj.holdings || []) await holdingPut(h);
}
