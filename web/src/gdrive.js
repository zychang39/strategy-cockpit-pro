// Google Drive appData 同步 — 使用者自備 OAuth Client ID（README 有申請步驟）
// 資料存在 Drive 的隱藏 appDataFolder，只有本 App 能讀寫。
const SCOPE = "https://www.googleapis.com/auth/drive.appdata";
const FILE = "cockpit-state.json";

let gisReady = null;
function loadGis() {
  if (gisReady) return gisReady;
  gisReady = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.onload = res; s.onerror = () => rej(new Error("無法載入 Google 登入元件"));
    document.head.appendChild(s);
  });
  return gisReady;
}

export async function getToken(clientId) {
  await loadGis();
  return new Promise((res, rej) => {
    const tc = google.accounts.oauth2.initTokenClient({
      client_id: clientId, scope: SCOPE,
      callback: (r) => (r.access_token ? res(r.access_token) : rej(new Error(r.error || "授權失敗"))),
    });
    tc.requestAccessToken();
  });
}

async function findFile(token) {
  const r = await fetch(
    "https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&fields=files(id,modifiedTime)&q=name%3D%27" + FILE + "%27",
    { headers: { Authorization: "Bearer " + token } });
  if (!r.ok) throw new Error("Drive 查詢失敗 " + r.status);
  return (await r.json()).files?.[0] || null;
}

export async function driveUpload(token, obj) {
  const f = await findFile(token);
  const meta = { name: FILE, ...(f ? {} : { parents: ["appDataFolder"] }) };
  const boundary = "scpB" + Date.now();
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(obj)}\r\n--${boundary}--`;
  const url = "https://www.googleapis.com/upload/drive/v3/files" + (f ? "/" + f.id : "") + "?uploadType=multipart";
  const r = await fetch(url, {
    method: f ? "PATCH" : "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "multipart/related; boundary=" + boundary },
    body,
  });
  if (!r.ok) throw new Error("上傳失敗 " + r.status);
}

export async function driveDownload(token) {
  const f = await findFile(token);
  if (!f) throw new Error("雲端尚無備份——請先從有資料的裝置上傳");
  const r = await fetch("https://www.googleapis.com/drive/v3/files/" + f.id + "?alt=media",
    { headers: { Authorization: "Bearer " + token } });
  if (!r.ok) throw new Error("下載失敗 " + r.status);
  return r.json();
}
