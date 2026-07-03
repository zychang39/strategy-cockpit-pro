// 數字格式化 — 全站 TWD 顯示
export const twd = (v, digits = 0) =>
  v == null ? "—" : "NT$" + Number(v).toLocaleString("zh-TW", { maximumFractionDigits: digits });

export const num = (v, d = 2) =>
  v == null ? "—" : Number(v).toLocaleString("zh-TW", { maximumFractionDigits: d });

export const pct = (v, d = 1, signed = true) => {
  if (v == null) return "—";
  const s = signed && v > 0 ? "+" : "";
  return s + Number(v).toFixed(d) + "%";
};

export const CUR = { us: "USD", tw: "TWD", two: "TWD", jp: "JPY", indices: "", fx: "" };

export const localPrice = (q) =>
  q?.price == null ? "—" : `${num(q.price, q.price < 50 ? 2 : q.price < 1000 ? 1 : 0)} ${CUR[q.category] || ""}`;

// 當地幣 → TWD 匯率
export const fxRate = (category, fx) => {
  if (category === "us") return fx?.USDTWD ?? null;
  if (category === "jp") return fx?.JPYTWD ?? null;
  return 1; // tw / two
};

export const fmtDate = (iso) => (iso ? iso.replace("T", " ").slice(0, 16) : "—");
