import { chf, esc } from "./geld.js";
import { ALLERGENE, abteilungLabel } from "./stammdaten.js";

// Druckvorlagen: Preisliste (Tabelle nach Kategorien) und Artikelblätter (ein A4 pro Artikel).
// Der Inhalt wird in #print-area geschrieben; style.css zeigt beim Drucken nur diesen Bereich.

const heute = () => new Date().toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });

// Natürliche Sortierung, damit "2" vor "10" kommt; Artikel ohne Nummer zuletzt
const nrVergleich = (a, b) => {
  const x = a.artikelnummer || "", y = b.artikelnummer || "";
  if (!x !== !y) return x ? -1 : 1;
  return x.localeCompare(y, "de", { numeric: true }) || a.name.localeCompare(b.name, "de");
};

function nachKategorie(rows, katName) {
  const gruppen = new Map();
  for (const a of rows) {
    const k = katName(a);
    if (!gruppen.has(k)) gruppen.set(k, []);
    gruppen.get(k).push(a);
  }
  return [...gruppen.keys()]
    .sort((x, y) => (x === "Ohne Kategorie") - (y === "Ohne Kategorie") || x.localeCompare(y, "de"))
    .map((k) => [k, gruppen.get(k).sort(nrVergleich)]);
}

/** Preisliste. preise: "beide" | "laden" | "tearoom" */
export function preislisteHtml(rows, { preise, filterText, katName, mengeText }) {
  const mitLaden = preise !== "tearoom";
  const mitTea = preise !== "laden";
  // Bei «Nur Laden» bzw. «Nur Tea Room» nur Artikel mit diesem Preis
  const liste = rows.filter((a) => (mitLaden && a.preisLaden != null) || (mitTea && a.preisTearoom != null));
  const titel = preise === "laden" ? "Preisliste Laden" : preise === "tearoom" ? "Preisliste Tea Room" : "Preisliste";
  const spalten = 2 + 1 + (mitLaden ? 1 : 0) + (mitTea ? 1 : 0);

  const body = nachKategorie(liste, katName).map(([kat, artikel]) => `
    <tbody>
      <tr class="pl-kat"><td colspan="${spalten}">${esc(kat)}</td></tr>
      ${artikel.map((a) => `<tr>
        <td class="pl-nr">${esc(a.artikelnummer || "")}</td>
        <td>${esc(a.name)}${a.saison ? ' <span class="pl-saison">Saison</span>' : ""}</td>
        <td class="pl-menge">${esc(mengeText(a))}</td>
        ${mitLaden ? `<td class="r">${a.preisLaden != null ? chf(a.preisLaden) : ""}</td>` : ""}
        ${mitTea ? `<td class="r">${a.preisTearoom != null ? chf(a.preisTearoom) : ""}</td>` : ""}
      </tr>`).join("")}
    </tbody>`).join("");

  return `
    <div class="pr-head">
      <div><div class="pr-title">Marmotte – ${titel}</div><div class="pr-sub">${esc(filterText)}</div></div>
      <div class="pr-date">Stand ${heute()}</div>
    </div>
    ${liste.length ? `
    <table class="pl-table">
      <thead><tr>
        <th class="pl-nr">Art.-Nr.</th><th>Artikel</th><th class="pl-menge">Menge</th>
        ${mitLaden ? '<th class="r">Laden CHF</th>' : ""}${mitTea ? '<th class="r">Tea Room CHF</th>' : ""}
      </tr></thead>
      ${body}
    </table>` : "<p>Keine Artikel mit Preis für diese Auswahl.</p>"}`;
}

/** Artikelblätter: ein A4 pro Artikel mit allen Angaben */
export function artikelblaetterHtml(rows, { katName, mengeText }) {
  return nachKategorie(rows, katName).flatMap(([, artikel]) => artikel).map((a) => {
    const zeile = (label, wert) => `<tr><th>${label}</th><td>${wert || "–"}</td></tr>`;
    const halt = a.haltbarkeitTage != null ? `${a.haltbarkeitTage} ${a.haltbarkeitTage === 1 ? "Tag" : "Tage"}` : "";
    const stand = a.updatedAt?.toDate ? a.updatedAt.toDate().toLocaleDateString("de-CH") : "";
    return `
    <section class="ab-page">
      <div class="pr-head">
        <div>
          <div class="ab-nr">${a.artikelnummer ? `Art.-Nr. ${esc(a.artikelnummer)}` : "&nbsp;"}</div>
          <div class="pr-title">${esc(a.name)}</div>
          <div class="pr-sub">${esc(katName(a))}${a.saison ? " · Saisonartikel" : ""}</div>
        </div>
        <div class="pr-date">Marmotte</div>
      </div>

      <div class="ab-preise">
        <div><span>Preis Laden</span><strong>${a.preisLaden != null ? "CHF " + chf(a.preisLaden) : "–"}</strong></div>
        <div><span>Preis Tea Room</span><strong>${a.preisTearoom != null ? "CHF " + chf(a.preisTearoom) : "–"}</strong></div>
      </div>

      <table class="ab-info">
        ${zeile("Menge / Gewicht", esc(mengeText(a)))}
        ${zeile("Haltbarkeit", halt)}
        ${zeile("Lagerhinweis", esc(a.lagerung || ""))}
        ${zeile("Abteilungen", esc((a.abteilungen || []).map(abteilungLabel).join(", ")))}
      </table>

      <h4>Zutaten</h4>
      <p class="ab-zutaten">${a.zutaten ? esc(a.zutaten) : "–"}</p>

      <h4>Allergene</h4>
      <table class="ab-allergene">
        <thead><tr><th>Allergen</th><th>Enthält</th><th>Spuren</th></tr></thead>
        <tbody>
          ${ALLERGENE.map((x) => {
            const s = a.allergene?.[x.key];
            return `<tr class="${s ? "is-" + s : ""}"><td>${esc(x.label)}</td><td>${s === "enthalten" ? "●" : ""}</td><td>${s === "spuren" ? "○" : ""}</td></tr>`;
          }).join("")}
        </tbody>
      </table>

      <div class="ab-foot">Gedruckt am ${heute()}${stand ? ` · Zuletzt bearbeitet am ${stand}${a.updatedBy ? ` von ${esc(a.updatedBy)}` : ""}` : ""}</div>
    </section>`;
  }).join("");
}
