import { db } from "./firebase-config.js";
import {
  addDoc, collection, doc, updateDoc, deleteDoc, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { chf, parseChf, toInput, esc } from "./geld.js";
import { ALLERGENE, ABTEILUNGEN, EINHEITEN, LAGERHINWEISE, HINWEISE, abteilungLabel } from "./stammdaten.js";
import { preislisteHtml, artikelblaetterHtml } from "./drucken.js";
import { unterVon } from "./unterkategorien.js";
import { toast, openModal, closeModal } from "./ui.js";

// Artikel-Liste, Detailansicht und (für den Admin) Bearbeiten
export function initArtikel(session) {
  const isAdmin = session.profile.role === "admin";
  let artikel = [];
  let kategorien = [];
  let offen = null;      // Artikel in der Detailansicht
  let bearbeite = null;  // Artikel im Bearbeiten-Formular (null = neu)

  const listEl = document.getElementById("artikel-list");
  const sucheEl = document.getElementById("suche");
  const katFilterEl = document.getElementById("filter-kategorie");
  const abtFilterEl = document.getElementById("filter-abteilung");
  const inaktivEl = document.getElementById("zeige-inaktive");
  const saisonEl = document.getElementById("nur-saison");
  const ukFilterEl = document.getElementById("filter-unterkategorie");

  abtFilterEl.innerHTML = '<option value="">Alle Abteilungen</option>' +
    ABTEILUNGEN.map((a) => `<option value="${a.key}">${esc(a.label)}</option>`).join("");
  // Abteilungs-Konten sehen zuerst ihre eigenen Artikel
  if (session.profile.abteilung) abtFilterEl.value = session.profile.abteilung;

  [sucheEl, abtFilterEl, inaktivEl, saisonEl, ukFilterEl].forEach((el) => el.addEventListener("input", render));
  katFilterEl.addEventListener("input", () => { fuelleUnterFilter(); render(); });

  // Zweite Filterstufe: nur sichtbar, wenn die gewählte Kategorie Unterkategorien hat
  function fuelleUnterFilter() {
    const unter = unterVon(kategorien.find((k) => k.id === katFilterEl.value));
    const aktuell = ukFilterEl.value;
    ukFilterEl.style.display = unter.length ? "" : "none";
    ukFilterEl.innerHTML = '<option value="">Alle Unterkategorien</option>' +
      unter.map((u) => `<option value="${u.id}">${esc(u.name)}</option>`).join("");
    ukFilterEl.value = unter.some((u) => u.id === aktuell) ? aktuell : "";
  }

  // ---------- Hilfen ----------
  const katName = (a) => kategorien.find((k) => k.id === a.kategorieId)?.name || a.kategorieName || "Ohne Kategorie";
  const mengeText = (a) => (a.menge != null ? `${String(a.menge).replace(".", ",")} ${a.einheit || ""}`.trim() : "");
  const haltText = (a) => (a.haltbarkeitTage != null ? `${a.haltbarkeitTage} ${a.haltbarkeitTage === 1 ? "Tag" : "Tage"} haltbar` : "");
  const allergenListe = (a, stufe) => ALLERGENE.filter((x) => a.allergene?.[x.key] === stufe);
  const preis = (r) => (r != null ? chf(r) : "–");
  // Position einer Kategorie in der (nach Nummernbereich sortierten) Kategorienliste; unbekannte zuletzt
  const katRang = (name) => { const i = kategorien.findIndex((k) => k.name === name); return i < 0 ? Infinity : i; };
  // Unterkategorie eines Artikels (Objekt) und ihre Position innerhalb der Kategorie
  const unterVonArtikel = (a) => (kategorien.find((k) => k.id === a.kategorieId)?.unterkategorien || []).find((u) => u.id === a.unterkategorieId) || null;
  const unterName = (a) => unterVonArtikel(a)?.name || "";
  const unterRang = (a) => {
    const kat = kategorien.find((k) => k.id === a.kategorieId);
    const i = unterVon(kat).findIndex((u) => u.id === a.unterkategorieId);
    return i < 0 ? -1 : i; // ohne Unterkategorie zuerst
  };

  // ---------- Liste ----------
  function gefiltert() {
    const q = sucheEl.value.trim().toLowerCase();
    return artikel.filter((a) =>
      (!isAdmin || inaktivEl.checked || a.active !== false) &&
      (!saisonEl.checked || a.saison === true) &&
      (!katFilterEl.value || a.kategorieId === katFilterEl.value) &&
      (!ukFilterEl.value || a.unterkategorieId === ukFilterEl.value) &&
      (!abtFilterEl.value || (a.abteilungen || []).includes(abtFilterEl.value)) &&
      (!q || a.name.toLowerCase().includes(q) || (a.artikelnummer || "").toLowerCase().includes(q) || (a.zutaten || "").toLowerCase().includes(q))
    );
  }

  function render() {
    const rows = gefiltert();
    document.getElementById("artikel-anzahl").textContent =
      `${rows.length} ${rows.length === 1 ? "Artikel" : "Artikel"}`;
    if (!artikel.length) {
      listEl.innerHTML = `<p class="hint-text">Noch keine Artikel erfasst.${isAdmin && !kategorien.length ? " Lege zuerst unter «Kategorien» die Kategorien an." : ""}</p>`;
      return;
    }
    if (!rows.length) { listEl.innerHTML = '<p class="hint-text">Keine Artikel gefunden.</p>'; return; }

    // Nach Kategorie gruppieren (Reihenfolge wie die Kategorienliste, «Ohne Kategorie» zuletzt)
    const gruppen = new Map();
    const sortiert = [...rows].sort((x, y) => (x.active === false) - (y.active === false));
    for (const a of sortiert) {
      const name = katName(a);
      if (!gruppen.has(name)) gruppen.set(name, []);
      gruppen.get(name).push(a);
    }
    const namen = [...gruppen.keys()].sort((x, y) => katRang(x) - katRang(y) || x.localeCompare(y, "de"));

    listEl.innerHTML = namen.map((name) => {
      // Innerhalb der Kategorie nach Unterkategorie ordnen; Zwischentitel bei jedem Wechsel
      const liste = [...gruppen.get(name)].sort((x, y) => unterRang(x) - unterRang(y));
      let letzte = null;
      return `
      <div class="m-section-title">${esc(name)}</div>
      ${(() => { const b = kategorien.find((k) => k.name === name)?.beschreibung; return b ? `<p class="kat-beschr">${esc(b)}</p>` : ""; })()}
      ${liste.map((a) => {
        // Hat die Kategorie Unterkategorien, werden noch nicht zugeteilte Artikel als «Ohne Unterkategorie» markiert
        const hatUnter = unterVon(kategorien.find((k) => k.id === a.kategorieId)).length > 0;
        const uk = unterName(a) || (hatUnter ? "Ohne Unterkategorie" : "");
        const titel = uk && uk !== letzte ? `<div class="sub-title">${esc(uk)}</div>` : "";
        letzte = uk;
        const sub = [a.artikelnummer ? `Nr. ${a.artikelnummer}` : "", mengeText(a), haltText(a)].filter(Boolean).join(" · ");
        const enth = allergenListe(a, "enthalten").map((x) => x.kurz);
        return `${titel}
        <button class="art-item ${a.active === false ? "is-inactive" : ""}" data-id="${a.id}" type="button">
          <div class="ai-main">
            <div class="ai-name">${esc(a.name)}${a.saison ? ' <span class="tag-saison">Saison</span>' : ""}${a.active === false ? ' <span class="tag-aus">nicht im Verkauf</span>' : ""}</div>
            ${sub ? `<div class="ai-sub">${esc(sub)}</div>` : ""}
            ${enth.length ? `<div class="ai-allerg">${esc(enth.join(" · "))}</div>` : ""}
          </div>
          <div class="ai-preise">
            ${a.preisLaden != null ? `<div><span class="ai-pl">Laden</span> <span class="mono">${chf(a.preisLaden)}</span></div>` : ""}
            ${a.preisTearoom != null ? `<div><span class="ai-pl">Tea Room</span> <span class="mono">${chf(a.preisTearoom)}</span></div>` : ""}
          </div>
        </button>`;
      }).join("")}`;
    }).join("");
  }

  listEl.addEventListener("click", (e) => {
    const b = e.target.closest(".art-item");
    if (b) zeigeDetail(artikel.find((a) => a.id === b.dataset.id));
  });

  // ---------- Detail ----------
  function zeigeDetail(a) {
    if (!a) return;
    offen = a;
    const enth = allergenListe(a, "enthalten");
    const spur = allergenListe(a, "spuren");
    const zeile = (label, wert) => (wert ? `<span>${label}</span><span>${wert}</span>` : "");
    document.getElementById("detail-body").innerHTML = `
      <div class="detail-head">
        <div class="m-tint m-tint-indigo"><i data-icon="package"></i></div>
        <div>
          <h3>${esc(a.name)}</h3>
          <div class="li-sub">${a.artikelnummer ? `Nr. ${esc(a.artikelnummer)} · ` : ""}${esc(katName(a))}${unterName(a) ? ` › ${esc(unterName(a))}` : ""}${a.saison ? " · Saisonartikel" : ""}${a.active === false ? " · nicht im Verkauf" : ""}</div>
        </div>
      </div>
      <div class="preis-boxen">
        <div class="preis-box"><span>Preis Laden</span><strong class="mono">${preis(a.preisLaden)}</strong></div>
        <div class="preis-box"><span>Preis Tea Room</span><strong class="mono">${preis(a.preisTearoom)}</strong></div>
      </div>
      <div class="detail-grid">
        ${zeile("Menge", esc(mengeText(a)))}
        ${zeile("Haltbarkeit", a.haltbarkeitTage != null ? `${a.haltbarkeitTage} ${a.haltbarkeitTage === 1 ? "Tag" : "Tage"}` : "")}
        ${zeile("Lagerung", esc(a.lagerung || ""))}
        ${zeile("Abteilungen", esc((a.abteilungen || []).map(abteilungLabel).join(", ")))}
      </div>
      <div class="detail-block">
        <div class="db-title">Zutaten</div>
        <p class="zutaten-text">${a.zutaten ? esc(a.zutaten) : '<span class="hint-text">Keine Zutaten erfasst.</span>'}</p>
      </div>
      <div class="detail-block">
        <div class="db-title">Allergene</div>
        ${enth.length ? `<div class="allerg-line"><span class="al-label">Enthält</span><div class="badge-row">${enth.map((x) => `<span class="al-badge al-enth">${esc(x.label)}</span>`).join("")}</div></div>` : ""}
        ${spur.length ? `<div class="allerg-line"><span class="al-label">Kann Spuren enthalten</span><div class="badge-row">${spur.map((x) => `<span class="al-badge al-spur">${esc(x.label)}</span>`).join("")}</div></div>` : ""}
        ${!enth.length && !spur.length ? '<p class="hint-text" style="margin:0;">Keine Allergene erfasst.</p>' : ""}
      </div>
      <div class="detail-block">
        <div class="db-title">Nützliche Hinweise</div>
        <div class="hinweis-liste">${HINWEISE.map((h) => `<span class="hw ${a.hinweise?.[h.key] ? "hw-ja" : ""}">${esc(h.label)}: <strong>${a.hinweise?.[h.key] ? "Ja" : "Nein"}</strong></span>`).join("")}</div>
      </div>
      ${a.updatedBy ? `<p class="hint-text" style="margin:14px 0 0;">Zuletzt bearbeitet von ${esc(a.updatedBy)}${a.updatedAt?.toDate ? ` am ${a.updatedAt.toDate().toLocaleDateString("de-CH")}` : ""}</p>` : ""}`;
    openModal("detail-modal");
  }
  document.getElementById("detail-close").addEventListener("click", () => closeModal("detail-modal"));

  function fuelleKategorieFilter() {
    const aktuell = katFilterEl.value;
    katFilterEl.innerHTML = '<option value="">Alle Kategorien</option>' +
      kategorien.map((k) => `<option value="${k.id}">${esc(k.name)}</option>`).join("");
    katFilterEl.value = kategorien.some((k) => k.id === aktuell) ? aktuell : "";
    fuelleUnterFilter();
  }

  // ---------- Drucken (alle) ----------
  // Gedruckt wird, was gerade gefiltert ist – aber nur Artikel, die im Verkauf sind
  const druckWahl = { art: "preisliste", preise: "beide" };
  const druckRows = () => gefiltert().filter((a) => a.active !== false);
  function filterText() {
    const teile = [
      abtFilterEl.value ? abteilungLabel(abtFilterEl.value) : "Alle Abteilungen",
      katFilterEl.value ? kategorien.find((k) => k.id === katFilterEl.value)?.name : "Alle Kategorien",
    ];
    if (saisonEl.checked) teile.push("nur Saisonartikel");
    if (sucheEl.value.trim()) teile.push(`Suche «${sucheEl.value.trim()}»`);
    return teile.join(" · ");
  }
  function druckInfo() {
    const n = druckRows().length;
    document.getElementById("print-preise-feld").style.display = druckWahl.art === "preisliste" ? "" : "none";
    document.getElementById("print-info").textContent =
      `${n} Artikel im Verkauf (${filterText()}).` +
      (druckWahl.art === "blaetter" ? ` Das ergibt ${n} ${n === 1 ? "Seite" : "Seiten"}.` : "") +
      " Die Auswahl richtet sich nach den Filtern in der Liste.";
  }
  [["print-art", "art"], ["print-preise", "preise"]].forEach(([id, key]) =>
    document.getElementById(id).addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      druckWahl[key] = b.dataset.wert;
      b.parentElement.querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b));
      druckInfo();
    })
  );
  document.getElementById("drucken-btn").addEventListener("click", () => { druckInfo(); openModal("print-modal"); });
  document.getElementById("print-cancel").addEventListener("click", () => closeModal("print-modal"));
  document.getElementById("print-ok").addEventListener("click", () => {
    const rows = druckRows();
    if (!rows.length) { toast("Keine Artikel zum Drucken"); return; }
    const hilfen = { katName, katRang, unterName, unterRang, mengeText, filterText: filterText(), preise: druckWahl.preise };
    const area = document.getElementById("print-area");
    area.className = druckWahl.art === "preisliste" ? "druck-preisliste" : "druck-blaetter";
    area.innerHTML = druckWahl.art === "preisliste" ? preislisteHtml(rows, hilfen) : artikelblaetterHtml(rows, hilfen);
    closeModal("print-modal");
    setTimeout(() => window.print(), 100);
  });

  if (!isAdmin) {
    return {
      setArtikel(list) { artikel = list; render(); },
      setKategorien(list) { kategorien = list; fuelleKategorieFilter(); render(); },
    };
  }

  // ---------- Bearbeiten (nur Admin) ----------
  const f = (id) => document.getElementById(id);
  f("a-lagerung").innerHTML = '<option value="">– kein Hinweis –</option>' +
    LAGERHINWEISE.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join("") +
    '<option value="__eigen">Eigener Text …</option>';
  f("a-lagerung").addEventListener("change", () => {
    const eigen = f("a-lagerung").value === "__eigen";
    f("a-lagerung-eigen").style.display = eigen ? "" : "none";
    if (eigen) f("a-lagerung-eigen").focus();
  });
  f("a-einheit").innerHTML = EINHEITEN.map((e) => `<option value="${e}">${e}</option>`).join("");
  f("a-abteilungen").innerHTML = ABTEILUNGEN.map((a) => `
    <label class="chip-check"><input type="checkbox" value="${a.key}"><span>${esc(a.label)}</span></label>`).join("");
  f("a-allergene").innerHTML = ALLERGENE.map((x) => `
    <div class="allergen-row" data-key="${x.key}">
      <span class="ar-label">${esc(x.label)}</span>
      <div class="seg">
        <button type="button" data-stufe="">Nein</button>
        <button type="button" data-stufe="spuren">Spuren</button>
        <button type="button" data-stufe="enthalten">Enthält</button>
      </div>
    </div>`).join("");
  f("a-hinweise").innerHTML = HINWEISE.map((h) => `
    <div class="allergen-row hinweis-row" data-key="${h.key}">
      <span class="ar-label">${esc(h.label)}</span>
      <div class="seg">
        <button type="button" data-ja="0">Nein</button>
        <button type="button" data-ja="1">Ja</button>
      </div>
    </div>`).join("");
  function setzeHinweis(key, ja) {
    const row = f("a-hinweise").querySelector(`[data-key="${key}"]`);
    row.dataset.ja = ja ? "1" : "0";
    row.querySelectorAll("button").forEach((x) => x.classList.toggle("active", x.dataset.ja === row.dataset.ja));
  }
  f("a-hinweise").addEventListener("click", (e) => {
    const b = e.target.closest(".seg button");
    if (!b) return;
    const key = b.closest(".hinweis-row").dataset.key;
    const ja = b.dataset.ja === "1";
    setzeHinweis(key, ja);
    // Logisch zusammenhängende Angaben gleich mitsetzen
    if (ja && key === "vegan") { setzeHinweis("vegetarisch", true); setzeHinweis("schweinefett", false); }
    if (ja && key === "vegetarisch") setzeHinweis("schweinefett", false);
    if (ja && key === "schweinefett") { setzeHinweis("vegetarisch", false); setzeHinweis("vegan", false); }
    if (!ja && key === "vegetarisch") setzeHinweis("vegan", false);
  });
  f("a-allergene").addEventListener("click", (e) => {
    const b = e.target.closest(".seg button");
    if (!b) return;
    b.parentElement.querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b));
    b.closest(".allergen-row").dataset.stufe = b.dataset.stufe;
  });
  function setzeAllergen(key, stufe) {
    const row = f("a-allergene").querySelector(`[data-key="${key}"]`);
    row.dataset.stufe = stufe || "";
    row.querySelectorAll("button").forEach((x) => x.classList.toggle("active", x.dataset.stufe === (stufe || "")));
  }

  // ---------- Art.-Nr. aus dem Bereich der Kategorie ----------
  let autoNr = null; // zuletzt automatisch vorgeschlagene Nummer
  const kategorieVon = (id) => kategorien.find((k) => k.id === id);
  function ersteFreieNr(kat, ausser) {
    if (!kat || kat.nrVon == null) return null;
    const belegt = new Set(artikel.filter((a) => a.id !== ausser).map((a) => a.artikelnummer).filter(Boolean));
    for (let n = kat.nrVon; n <= kat.nrBis; n++) if (!belegt.has(String(n))) return String(n);
    return null; // Bereich voll
  }
  // Massgebender Nummernbereich: die gewählte Unterkategorie, sonst die Kategorie (wenn sie keine Unterkategorien hat)
  function aktuellerBereich() {
    const kat = kategorieVon(f("a-kategorie").value);
    if (!kat) return null;
    if (unterVon(kat).length) {
      const u = kat.unterkategorien.find((x) => x.id === f("a-unterkategorie").value);
      return u?.nrVon != null ? { name: `${kat.name} › ${u.name}`, nrVon: u.nrVon, nrBis: u.nrBis } : null;
    }
    return kat.nrVon != null ? { name: kat.name, nrVon: kat.nrVon, nrBis: kat.nrBis } : null;
  }
  function zeigeBereich() {
    const b = aktuellerBereich();
    f("a-nummer").placeholder = b ? `${b.nrVon}–${b.nrBis}` : "z.B. 1001";
  }
  function nummerVorschlagen() {
    zeigeBereich();
    // Nur ausfüllen, wenn das Feld leer ist oder die Nummer vorher automatisch kam
    const aktuell = f("a-nummer").value.trim();
    if (aktuell && aktuell !== autoNr) return;
    const b = aktuellerBereich();
    const frei = ersteFreieNr(b, bearbeite?.id);
    if (b && !frei) toast(`Der Nummernbereich von «${b.name}» ist voll`);
    f("a-nummer").value = frei || "";
    autoNr = frei;
  }
  function fuelleUnterAuswahl(aktuell) {
    const unter = unterVon(kategorieVon(f("a-kategorie").value));
    f("a-unter-feld").style.display = unter.length ? "" : "none";
    f("a-unterkategorie").innerHTML = '<option value="">Bitte wählen</option>' +
      unter.map((u) => `<option value="${u.id}">${esc(u.name)}${u.nrVon != null ? ` (${u.nrVon}–${u.nrBis})` : ""}</option>`).join("");
    f("a-unterkategorie").value = unter.some((u) => u.id === aktuell) ? aktuell : "";
  }
  f("a-kategorie").addEventListener("change", () => { fuelleUnterAuswahl(null); nummerVorschlagen(); });
  f("a-unterkategorie").addEventListener("change", nummerVorschlagen);

  function oeffneFormular(a) {
    bearbeite = a || null;
    f("edit-title").textContent = a ? "Artikel bearbeiten" : "Neuer Artikel";
    f("edit-error").textContent = "";
    fuelleKategorieAuswahl(a?.kategorieId);
    f("a-name").value = a?.name || "";
    f("a-nummer").value = a?.artikelnummer || "";
    autoNr = null;
    fuelleUnterAuswahl(a?.unterkategorieId);
    zeigeBereich();
    const lager = a?.lagerung || "";
    const ausListe = !lager || LAGERHINWEISE.includes(lager);
    f("a-lagerung").value = ausListe ? lager : "__eigen";
    f("a-lagerung-eigen").value = ausListe ? "" : lager;
    f("a-lagerung-eigen").style.display = ausListe ? "none" : "";
    f("a-preis-laden").value = toInput(a?.preisLaden);
    f("a-preis-tearoom").value = toInput(a?.preisTearoom);
    f("a-menge").value = a?.menge != null ? String(a.menge) : "";
    f("a-einheit").value = a?.einheit || "g";
    f("a-haltbarkeit").value = a?.haltbarkeitTage ?? "";
    f("a-saison").checked = a?.saison === true;
    f("a-zutaten").value = a?.zutaten || "";
    f("a-abteilungen").querySelectorAll("input").forEach((i) => { i.checked = (a?.abteilungen || []).includes(i.value); });
    ALLERGENE.forEach((x) => setzeAllergen(x.key, a?.allergene?.[x.key]));
    HINWEISE.forEach((h) => setzeHinweis(h.key, a?.hinweise?.[h.key] === true));
    f("edit-extra").style.display = a ? "flex" : "none";
    if (a) f("edit-toggle").textContent = a.active === false ? "Wieder aktivieren" : "Deaktivieren";
    closeModal("detail-modal");
    openModal("edit-modal");
    if (!a) setTimeout(() => f("a-kategorie").focus(), 50);
  }

  f("artikel-neu").addEventListener("click", () => {
    if (!kategorien.some((k) => k.active !== false)) { toast("Bitte zuerst unter «Kategorien» eine Kategorie anlegen"); return; }
    oeffneFormular(null);
  });
  f("detail-edit").addEventListener("click", () => oeffneFormular(offen));
  f("edit-cancel").addEventListener("click", () => closeModal("edit-modal"));

  f("edit-save").addEventListener("click", async () => {
    const err = f("edit-error");
    err.textContent = "";
    const name = f("a-name").value.trim();
    const kategorieId = f("a-kategorie").value;
    if (!name) { err.textContent = "Bitte einen Namen eingeben."; return; }
    if (!kategorieId) { err.textContent = "Bitte eine Kategorie wählen."; return; }
    const unterkategorieId = unterVon(kategorieVon(kategorieId)).length ? f("a-unterkategorie").value : "";
    if (unterVon(kategorieVon(kategorieId)).length && !unterkategorieId) { err.textContent = "Bitte eine Unterkategorie wählen."; return; }
    if (artikel.some((a) => a.name.toLowerCase() === name.toLowerCase() && a.id !== bearbeite?.id)) {
      err.textContent = "Es gibt bereits einen Artikel mit diesem Namen."; return;
    }
    const artikelnummer = f("a-nummer").value.trim();
    if (artikelnummer) {
      const doppelt = artikel.find((a) => (a.artikelnummer || "").toLowerCase() === artikelnummer.toLowerCase() && a.id !== bearbeite?.id);
      if (doppelt) { err.textContent = `Die Art.-Nr. ${artikelnummer} hat bereits «${doppelt.name}».`; return; }
      const b = aktuellerBereich();
      const n = Number(artikelnummer);
      if (b && !(Number.isInteger(n) && n >= b.nrVon && n <= b.nrBis) &&
          !confirm(`Die Art.-Nr. ${artikelnummer} liegt nicht im Bereich von «${b.name}» (${b.nrVon}–${b.nrBis}). Trotzdem speichern?`)) return;
    }
    const lagerung = f("a-lagerung").value === "__eigen" ? f("a-lagerung-eigen").value.trim() : f("a-lagerung").value;
    const preisLaden = parseChf(f("a-preis-laden").value);
    const preisTearoom = parseChf(f("a-preis-tearoom").value);
    if (Number.isNaN(preisLaden)) { err.textContent = "«Preis Laden» ist keine gültige Zahl."; return; }
    if (Number.isNaN(preisTearoom)) { err.textContent = "«Preis Tea Room» ist keine gültige Zahl."; return; }

    const mengeTxt = f("a-menge").value.trim().replace(",", ".");
    const menge = mengeTxt === "" ? null : Number(mengeTxt);
    if (menge !== null && !(menge > 0)) { err.textContent = "«Menge» muss eine Zahl grösser als 0 sein."; return; }
    const haltTxt = f("a-haltbarkeit").value.trim();
    const haltbarkeitTage = haltTxt === "" ? null : Number(haltTxt);
    if (haltbarkeitTage !== null && !(Number.isInteger(haltbarkeitTage) && haltbarkeitTage >= 0)) {
      err.textContent = "«Haltbarkeit» bitte als ganze Anzahl Tage eingeben."; return;
    }

    const allergene = {};
    f("a-allergene").querySelectorAll(".allergen-row").forEach((r) => { if (r.dataset.stufe) allergene[r.dataset.key] = r.dataset.stufe; });

    const hinweise = {};
    f("a-hinweise").querySelectorAll(".hinweis-row").forEach((r) => { hinweise[r.dataset.key] = r.dataset.ja === "1"; });

    const daten = {
      artikelnummer,
      name,
      kategorieId,
      unterkategorieId,
      kategorieName: kategorien.find((k) => k.id === kategorieId)?.name || "",
      abteilungen: [...f("a-abteilungen").querySelectorAll("input:checked")].map((i) => i.value),
      preisLaden,
      preisTearoom,
      menge,
      einheit: menge !== null ? f("a-einheit").value : null,
      haltbarkeitTage,
      saison: f("a-saison").checked,
      lagerung,
      zutaten: f("a-zutaten").value.trim(),
      allergene,
      hinweise,
      updatedAt: serverTimestamp(),
      updatedBy: session.profile.name || "",
    };

    const btn = f("edit-save");
    btn.disabled = true;
    try {
      if (bearbeite) {
        await updateDoc(doc(db, "artikel", bearbeite.id), daten);
        toast(`«${name}» gespeichert`);
      } else {
        await addDoc(collection(db, "artikel"), { ...daten, active: true, createdAt: serverTimestamp() });
        toast(`«${name}» angelegt`);
      }
      closeModal("edit-modal");
    } catch (e) {
      console.error(e);
      err.textContent = "Speichern fehlgeschlagen. Bitte Verbindung prüfen und erneut versuchen.";
    } finally {
      btn.disabled = false;
    }
  });

  f("edit-toggle").addEventListener("click", async () => {
    if (!bearbeite) return;
    const neu = bearbeite.active === false;
    if (!neu && !confirm(`«${bearbeite.name}» deaktivieren? Die Abteilungen sehen ihn dann grau als «nicht im Verkauf». Er bleibt gespeichert.`)) return;
    try {
      await updateDoc(doc(db, "artikel", bearbeite.id), { active: neu, updatedAt: serverTimestamp(), updatedBy: session.profile.name || "" });
      toast(neu ? "Artikel aktiviert" : "Artikel deaktiviert");
      closeModal("edit-modal");
    } catch (e) { console.error(e); toast("Ändern fehlgeschlagen"); }
  });

  f("edit-delete").addEventListener("click", async () => {
    if (!bearbeite) return;
    if (!confirm(`«${bearbeite.name}» endgültig löschen? Das kann nicht rückgängig gemacht werden.\n\nTipp: «Deaktivieren» blendet den Artikel nur aus.`)) return;
    try {
      await deleteDoc(doc(db, "artikel", bearbeite.id));
      toast("Artikel gelöscht");
      closeModal("edit-modal");
    } catch (e) { console.error(e); toast("Löschen fehlgeschlagen"); }
  });

  function fuelleKategorieAuswahl(aktuell) {
    const wahl = kategorien.filter((k) => k.active !== false || k.id === aktuell);
    f("a-kategorie").innerHTML = '<option value="">Bitte wählen</option>' +
      wahl.map((k) => `<option value="${k.id}">${esc(k.name)}${k.active === false ? " (inaktiv)" : ""}</option>`).join("");
    f("a-kategorie").value = aktuell || "";
  }

  return {
    setArtikel(list) {
      artikel = list;
      render();
      if (offen && document.getElementById("detail-modal").classList.contains("active")) {
        const neu = list.find((a) => a.id === offen.id);
        if (neu) zeigeDetail(neu); else closeModal("detail-modal");
      }
    },
    setKategorien(list) { kategorien = list; fuelleKategorieFilter(); render(); },
  };
}
