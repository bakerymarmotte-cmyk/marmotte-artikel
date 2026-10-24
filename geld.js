// Geld-Hilfen. Beträge werden intern in RAPPEN als ganze Zahlen gespeichert (100.– = 10000).

const fmt = new Intl.NumberFormat("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 123450 → "1’234.50" */
export function chf(rappen) {
  return fmt.format((rappen || 0) / 100);
}

/** Eingabe "1'250.50" oder "1250,5" → 125050 Rappen; leer → null; ungültig → NaN */
export function parseChf(text) {
  const clean = String(text ?? "").trim().replace(/['’\s]/g, "").replace(",", ".");
  if (clean === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return NaN;
  return Math.round(parseFloat(clean) * 100);
}

/** Rappen → Text fürs Eingabefeld ("1250.50") */
export function toInput(rappen) {
  return rappen == null ? "" : (rappen / 100).toFixed(2);
}

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** Datum als YYYY-MM-DD (lokale Zeit, nicht UTC) */
export function isoDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "2026-10-22" → "Do, 22.10.2026" */
export function deDate(iso, mitTag = true) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const s = `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`;
  return mitTag ? `${dt.toLocaleDateString("de-CH", { weekday: "short" })}, ${s}` : s;
}
