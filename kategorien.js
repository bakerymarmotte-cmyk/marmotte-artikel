import { db } from "./firebase-config.js";
import {
  addDoc, collection, doc, updateDoc, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { esc } from "./geld.js";
import { toast } from "./ui.js";

// Kategorien verwalten (nur Admin). Kategorien werden nie gelöscht, nur deaktiviert –
// so bleiben die Artikel immer einer Kategorie zugeordnet.
export function initKategorien() {
  let kategorien = [];
  let artikel = [];
  let bearbeiteId = null;

  const nameEl = document.getElementById("kat-name");
  const errorEl = document.getElementById("kat-error");
  const saveBtn = document.getElementById("kat-speichern");
  const cancelBtn = document.getElementById("kat-abbrechen");
  const titleEl = document.getElementById("kat-form-title");
  const listEl = document.getElementById("kat-list");
  const vonEl = document.getElementById("kat-von");
  const beschrEl = document.getElementById("kat-beschreibung");
  const bisEl = document.getElementById("kat-bis");
  const vorschlagEl = document.getElementById("kat-vorschlag");

  // Leeres Feld → null, sonst ganze Zahl (NaN bei ungültiger Eingabe)
  const zahl = (t) => { t = t.trim(); return t === "" ? null : (/^\d{1,9}$/.test(t) ? Number(t) : NaN); };

  // Vorschlag für eine neue Kategorie: direkt nach dem höchsten bisherigen Bereich, gleiche Grösse (Standard 200)
  function vorschlag() {
    const mitBereich = kategorien.filter((k) => k.nrBis != null);
    if (!mitBereich.length) return { von: 1000, bis: 1199 };
    const letzte = mitBereich.reduce((a, b) => (b.nrBis > a.nrBis ? b : a));
    const groesse = letzte.nrVon != null ? letzte.nrBis - letzte.nrVon + 1 : 200;
    return { von: letzte.nrBis + 1, bis: letzte.nrBis + groesse };
  }
  function zeigeVorschlag() {
    if (bearbeiteId) { vorschlagEl.textContent = ""; return; }
    const v = vorschlag();
    vorschlagEl.innerHTML = `Nächster freier Bereich: ${v.von}–${v.bis} <button type="button" class="link-btn" id="kat-vorschlag-ok">übernehmen</button>`;
    document.getElementById("kat-vorschlag-ok").addEventListener("click", () => { vonEl.value = v.von; bisEl.value = v.bis; });
  }

  function formularLeeren() {
    bearbeiteId = null;
    nameEl.value = "";
    beschrEl.value = "";
    vonEl.value = "";
    bisEl.value = "";
    errorEl.textContent = "";
    titleEl.textContent = "Neue Kategorie";
    saveBtn.textContent = "Kategorie anlegen";
    cancelBtn.style.display = "none";
    zeigeVorschlag();
  }

  saveBtn.addEventListener("click", async () => {
    errorEl.textContent = "";
    const name = nameEl.value.trim();
    const beschreibung = beschrEl.value.trim();
    if (!name) { errorEl.textContent = "Bitte einen Namen eingeben."; return; }
    if (kategorien.some((k) => k.name.toLowerCase() === name.toLowerCase() && k.id !== bearbeiteId)) {
      errorEl.textContent = "Es gibt bereits eine Kategorie mit diesem Namen."; return;
    }
    const nrVon = zahl(vonEl.value);
    const nrBis = zahl(bisEl.value);
    if (Number.isNaN(nrVon) || Number.isNaN(nrBis)) { errorEl.textContent = "Art.-Nr. bitte als ganze Zahl eingeben."; return; }
    if ((nrVon === null) !== (nrBis === null)) { errorEl.textContent = "Bitte «von» und «bis» ausfüllen – oder beide leer lassen."; return; }
    if (nrVon !== null) {
      if (nrVon > nrBis) { errorEl.textContent = "«von» muss kleiner sein als «bis»."; return; }
      const ueberschneidung = kategorien.find((k) => k.id !== bearbeiteId && k.nrVon != null && nrVon <= k.nrBis && nrBis >= k.nrVon);
      if (ueberschneidung) {
        errorEl.textContent = `Überschneidet sich mit «${ueberschneidung.name}» (${ueberschneidung.nrVon}–${ueberschneidung.nrBis}).`; return;
      }
    }
    saveBtn.disabled = true;
    try {
      if (bearbeiteId) {
        await updateDoc(doc(db, "kategorien", bearbeiteId), { name, beschreibung, nrVon, nrBis, updatedAt: serverTimestamp() });
        toast("Kategorie gespeichert");
      } else {
        await addDoc(collection(db, "kategorien"), { name, beschreibung, nrVon, nrBis, active: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        toast("Kategorie angelegt");
      }
      formularLeeren();
    } catch (err) {
      console.error(err);
      errorEl.textContent = "Speichern fehlgeschlagen.";
    } finally {
      saveBtn.disabled = false;
    }
  });
  cancelBtn.addEventListener("click", formularLeeren);

  const anzahl = (id) => artikel.filter((a) => a.kategorieId === id).length;

  function render() {
    if (!kategorien.length) { listEl.innerHTML = '<p class="hint-text">Noch keine Kategorien angelegt.</p>'; return; }
    listEl.innerHTML = [...kategorien]
      .sort((a, b) => (a.nrVon ?? Infinity) - (b.nrVon ?? Infinity) || a.name.localeCompare(b.name, "de"))
      .map((k) => `
        <div class="list-item ${k.active === false ? "is-inactive" : ""}">
          <div class="li-main">
            <strong>${esc(k.name)}</strong>
            ${k.beschreibung ? `<span class="li-beschr">${esc(k.beschreibung)}</span>` : ""}
            <span class="li-sub">${k.nrVon != null ? `Nr. ${k.nrVon}–${k.nrBis} · ` : ""}${anzahl(k.id)} Artikel${k.active === false ? " · inaktiv" : ""}</span>
          </div>
          <div class="li-actions">
            <button class="icon-btn" data-edit="${k.id}" title="Umbenennen"><i data-icon="pencil" data-size="15"></i></button>
            <button class="btn btn-secondary btn-small" data-toggle="${k.id}">${k.active === false ? "Aktivieren" : "Deaktivieren"}</button>
          </div>
        </div>`)
      .join("");
    listEl.querySelectorAll("[data-edit]").forEach((b) =>
      b.addEventListener("click", () => {
        const k = kategorien.find((x) => x.id === b.dataset.edit);
        bearbeiteId = k.id;
        nameEl.value = k.name;
        beschrEl.value = k.beschreibung || "";
        vonEl.value = k.nrVon ?? "";
        bisEl.value = k.nrBis ?? "";
        vorschlagEl.textContent = "";
        titleEl.textContent = "Kategorie bearbeiten";
        saveBtn.textContent = "Speichern";
        cancelBtn.style.display = "inline-flex";
        errorEl.textContent = "";
        window.scrollTo({ top: 0, behavior: "smooth" });
      })
    );
    listEl.querySelectorAll("[data-toggle]").forEach((b) =>
      b.addEventListener("click", async () => {
        const k = kategorien.find((x) => x.id === b.dataset.toggle);
        const neu = k.active === false;
        if (!neu && !confirm(`Kategorie «${k.name}» deaktivieren? Sie kann dann bei neuen Artikeln nicht mehr gewählt werden. Bestehende Artikel bleiben unverändert.`)) return;
        try {
          await updateDoc(doc(db, "kategorien", k.id), { active: neu, updatedAt: serverTimestamp() });
        } catch (err) {
          console.error(err);
          toast("Ändern fehlgeschlagen");
        }
      })
    );
  }

  return {
    setKategorien(list) { kategorien = list; render(); zeigeVorschlag(); },
    setArtikel(list) { artikel = list; render(); },
  };
}
