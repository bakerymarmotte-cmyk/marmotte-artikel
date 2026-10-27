import { db } from "./firebase-config.js";
import { doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { esc } from "./geld.js";
import { toast, openModal, closeModal } from "./ui.js";

// ==========================================================================
// Unterkategorien
// Sie werden direkt im Kategorie-Dokument gespeichert:
//   unterkategorien: [{ id, name, nrVon, nrBis }]
// Den Nummernbereich jeder Unterkategorie legst du selbst fest. Er muss im Bereich
// der Kategorie liegen und darf sich nicht mit anderen Unterkategorien überschneiden.
// ==========================================================================

/** Unterkategorien einer Kategorie, nach Nummernbereich sortiert */
export function unterVon(kat) {
  return [...(kat?.unterkategorien || [])].sort((a, b) => (a.nrVon ?? Infinity) - (b.nrVon ?? Infinity) || a.name.localeCompare(b.name, "de"));
}

const neueId = () => Math.random().toString(36).slice(2, 10);
const zahl = (t) => { t = String(t).trim(); return t === "" ? null : (/^\d{1,9}$/.test(t) ? Number(t) : NaN); };

export function initUnterkategorien() {
  let kat = null;      // Kategorie, die gerade im Fenster offen ist
  let artikel = [];
  let kategorien = [];
  let bearbeiteUid = null;

  const f = (id) => document.getElementById(id);
  const nameEl = f("uk-name");
  const vonEl = f("uk-von");
  const bisEl = f("uk-bis");
  const errEl = f("uk-error");

  const artikelIn = (uid) => artikel.filter((a) => a.kategorieId === kat?.id && a.unterkategorieId === uid);

  /** Erste Nummer im Kategoriebereich, die von keiner Unterkategorie belegt ist, und wie weit sie frei ist */
  function freiAb() {
    if (kat?.nrVon == null) return null;
    const andere = (kat.unterkategorien || []).filter((u) => u.id !== bearbeiteUid && u.nrVon != null);
    for (let n = kat.nrVon; n <= kat.nrBis; n++) {
      if (andere.some((u) => n >= u.nrVon && n <= u.nrBis)) continue;
      // frei bis zur nächsten belegten Nummer oder zum Ende der Kategorie
      const naechste = andere.filter((u) => u.nrVon > n).reduce((m, u) => Math.min(m, u.nrVon), kat.nrBis + 1);
      return { von: n, bis: naechste - 1 };
    }
    return null;
  }

  function zeigeVorschlag() {
    const el = f("uk-vorschlag");
    if (kat?.nrVon == null || bearbeiteUid) { el.textContent = ""; return; }
    const fr = freiAb();
    if (!fr) { el.textContent = "Der ganze Bereich der Kategorie ist verteilt."; return; }
    el.innerHTML = `Frei: ${fr.von}–${fr.bis} <button type="button" class="link-btn" id="uk-vorschlag-ok">«von» übernehmen</button>`;
    f("uk-vorschlag-ok").addEventListener("click", () => { vonEl.value = fr.von; bisEl.focus(); });
  }

  function formularLeeren() {
    bearbeiteUid = null;
    nameEl.value = vonEl.value = bisEl.value = "";
    errEl.textContent = "";
    f("uk-form-title").textContent = "Neue Unterkategorie";
    f("uk-add").textContent = "Hinzufügen";
    f("uk-abbrechen").style.display = "none";
    zeigeVorschlag();
  }

  function render() {
    if (!kat) return;
    f("uk-title").textContent = `Unterkategorien – ${kat.name}`;
    const hatBereich = kat.nrVon != null;
    f("uk-info").textContent = hatBereich
      ? `Bereich der Kategorie: ${kat.nrVon}–${kat.nrBis}. Den Bereich jeder Unterkategorie legst du selbst fest.`
      : "Diese Kategorie hat keinen Nummernbereich. Die Unterkategorien bekommen deshalb auch keinen.";
    f("uk-bereich").style.display = hatBereich ? "" : "none";

    const unter = unterVon(kat);
    f("uk-list").innerHTML = unter.length ? unter.map((u) => `
      <div class="list-item">
        <div class="li-main">
          <strong>${esc(u.name)}</strong>
          <span class="li-sub">${u.nrVon != null ? `Nr. ${u.nrVon}–${u.nrBis} (${u.nrBis - u.nrVon + 1}) · ` : ""}${artikelIn(u.id).length} Artikel</span>
        </div>
        <div class="li-actions">
          <button class="icon-btn" data-uk-edit="${u.id}" title="Bearbeiten"><i data-icon="pencil" data-size="15"></i></button>
          <button class="icon-btn" data-uk-del="${u.id}" title="Löschen"><i data-icon="trash-2" data-size="15"></i></button>
        </div>
      </div>`).join("") : '<p class="hint-text">Noch keine Unterkategorien.</p>';
    zeigeVorschlag();
  }

  async function speichern(liste) {
    await updateDoc(doc(db, "kategorien", kat.id), { unterkategorien: liste, updatedAt: serverTimestamp() });
  }

  f("uk-add").addEventListener("click", async () => {
    errEl.textContent = "";
    const name = nameEl.value.trim();
    if (!name) { errEl.textContent = "Bitte einen Namen eingeben."; return; }
    const liste = kat.unterkategorien || [];
    if (liste.some((u) => u.name.toLowerCase() === name.toLowerCase() && u.id !== bearbeiteUid)) {
      errEl.textContent = "Diese Unterkategorie gibt es schon."; return;
    }

    let nrVon = null, nrBis = null;
    if (kat.nrVon != null) {
      nrVon = zahl(vonEl.value);
      nrBis = zahl(bisEl.value);
      if (nrVon === null || nrBis === null || Number.isNaN(nrVon) || Number.isNaN(nrBis)) { errEl.textContent = "Bitte «von» und «bis» als ganze Zahlen eingeben."; return; }
      if (nrVon > nrBis) { errEl.textContent = "«von» muss kleiner sein als «bis»."; return; }
      if (nrVon < kat.nrVon || nrBis > kat.nrBis) { errEl.textContent = `Der Bereich muss innerhalb von ${kat.nrVon}–${kat.nrBis} liegen.`; return; }
      const kollision = liste.find((u) => u.id !== bearbeiteUid && u.nrVon != null && nrVon <= u.nrBis && nrBis >= u.nrVon);
      if (kollision) { errEl.textContent = `Überschneidet sich mit «${kollision.name}» (${kollision.nrVon}–${kollision.nrBis}).`; return; }
      // Beim Verkleinern: Artikel, deren Nummer danach ausserhalb läge, melden
      if (bearbeiteUid) {
        const raus = artikelIn(bearbeiteUid).filter((a) => { const n = Number(a.artikelnummer); return a.artikelnummer && Number.isInteger(n) && (n < nrVon || n > nrBis); });
        if (raus.length && !confirm(`${raus.length} Artikel hätten danach eine Nummer ausserhalb des Bereichs (z.B. «${raus[0].name}», ${raus[0].artikelnummer}). Trotzdem speichern?`)) return;
      }
    }

    const neu = bearbeiteUid
      ? liste.map((u) => (u.id === bearbeiteUid ? { ...u, name, nrVon, nrBis } : u))
      : [...liste, { id: neueId(), name, nrVon, nrBis }];
    const warNeu = !bearbeiteUid;
    f("uk-add").disabled = true;
    try {
      await speichern(neu);
      toast(warNeu ? `«${name}» hinzugefügt` : "Unterkategorie gespeichert");
      formularLeeren();
    } catch (e) { console.error(e); errEl.textContent = "Speichern fehlgeschlagen."; }
    finally { f("uk-add").disabled = false; }
  });
  f("uk-abbrechen").addEventListener("click", formularLeeren);

  f("uk-list").addEventListener("click", async (e) => {
    const ed = e.target.closest("[data-uk-edit]");
    const del = e.target.closest("[data-uk-del]");
    if (ed) {
      const u = kat.unterkategorien.find((x) => x.id === ed.dataset.ukEdit);
      bearbeiteUid = u.id;
      nameEl.value = u.name;
      vonEl.value = u.nrVon ?? "";
      bisEl.value = u.nrBis ?? "";
      errEl.textContent = "";
      f("uk-form-title").textContent = `«${u.name}» bearbeiten`;
      f("uk-add").textContent = "Speichern";
      f("uk-abbrechen").style.display = "inline-flex";
      zeigeVorschlag();
      nameEl.focus();
    }
    if (del) {
      const u = kat.unterkategorien.find((x) => x.id === del.dataset.ukDel);
      const n = artikelIn(u.id).length;
      if (n) { toast(`«${u.name}» hat noch ${n} Artikel – zuerst die Artikel umteilen`); return; }
      if (!confirm(`Unterkategorie «${u.name}» löschen? Ihr Nummernbereich wird wieder frei.`)) return;
      try { await speichern(kat.unterkategorien.filter((x) => x.id !== u.id)); toast("Unterkategorie gelöscht"); if (bearbeiteUid === u.id) formularLeeren(); }
      catch (err) { console.error(err); toast("Löschen fehlgeschlagen"); }
    }
  });

  f("uk-close").addEventListener("click", () => closeModal("unter-modal"));

  return {
    oeffnen(id) {
      kat = kategorien.find((k) => k.id === id);
      formularLeeren();
      render();
      openModal("unter-modal");
    },
    setKategorien(list) {
      kategorien = list;
      if (kat) { kat = list.find((k) => k.id === kat.id) || null; render(); }
    },
    setArtikel(list) { artikel = list; render(); },
  };
}
