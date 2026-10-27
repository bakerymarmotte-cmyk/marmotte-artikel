import { db } from "./firebase-config.js";
import { doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { esc } from "./geld.js";
import { toast, openModal, closeModal } from "./ui.js";

// ==========================================================================
// Unterkategorien
// Sie werden direkt im Kategorie-Dokument gespeichert:
//   maxUnter:        wie viele Unterkategorien höchstens (teilt den Nummernbereich in gleich grosse Blöcke)
//   unterkategorien: [{ id, name, nrVon, nrBis }]
// Die Blöcke sind fest: eine Unterkategorie behält ihren Bereich für immer,
// damit Artikelnummern nie in einen anderen Bereich «rutschen».
// ==========================================================================

/** Unterkategorien einer Kategorie, nach Nummernbereich sortiert */
export function unterVon(kat) {
  return [...(kat?.unterkategorien || [])].sort((a, b) => (a.nrVon ?? Infinity) - (b.nrVon ?? Infinity) || a.name.localeCompare(b.name, "de"));
}

/** Grösse eines Blocks (Anzahl Nummern pro Unterkategorie) oder null */
export function blockGroesse(kat) {
  if (kat?.nrVon == null || !kat.maxUnter) return null;
  return Math.floor((kat.nrBis - kat.nrVon + 1) / kat.maxUnter);
}

/** Nächster freier Block für eine neue Unterkategorie, oder null wenn alle belegt */
function freierBlock(kat) {
  const g = blockGroesse(kat);
  if (!g) return null;
  const belegt = new Set((kat.unterkategorien || []).map((u) => u.nrVon));
  for (let i = 0; i < kat.maxUnter; i++) {
    const von = kat.nrVon + i * g;
    if (!belegt.has(von)) return { nrVon: von, nrBis: von + g - 1 };
  }
  return null;
}

const neueId = () => Math.random().toString(36).slice(2, 10);

export function initUnterkategorien() {
  let kat = null;      // Kategorie, die gerade im Fenster offen ist
  let artikel = [];
  let kategorien = [];
  let bearbeiteUid = null;

  const f = (id) => document.getElementById(id);
  const maxEl = f("uk-max");
  const nameEl = f("uk-name");
  const errEl = f("uk-error");

  const benutzt = (uid) => artikel.filter((a) => a.kategorieId === kat?.id && a.unterkategorieId === uid).length;

  function render() {
    if (!kat) return;
    f("uk-title").textContent = `Unterkategorien – ${kat.name}`;
    const unter = unterVon(kat);
    const hatBereich = kat.nrVon != null;
    const g = blockGroesse(kat);

    // «Max. Unterkategorien» nur festlegbar, solange es noch keine gibt (sonst würden sich die Blöcke verschieben)
    f("uk-max-feld").style.display = hatBereich ? "" : "none";
    maxEl.disabled = unter.length > 0;
    maxEl.value = kat.maxUnter ?? "";
    const gesamt = hatBereich ? kat.nrBis - kat.nrVon + 1 : 0;
    f("uk-max-info").textContent = !hatBereich ? "" :
      unter.length ? `Fest: ${kat.maxUnter} Blöcke à ${g} Nummern (${kat.nrVon}–${kat.nrBis}). Kann nicht mehr geändert werden, weil schon Unterkategorien bestehen.` :
      g ? `${kat.maxUnter} Blöcke à ${g} Nummern. Bereich ${kat.nrVon}–${kat.nrBis} (${gesamt} Nummern).` :
      `Bereich ${kat.nrVon}–${kat.nrBis} (${gesamt} Nummern). Zuerst festlegen, wie viele Unterkategorien höchstens hineinpassen.`;
    f("uk-ohne-bereich").style.display = hatBereich ? "none" : "";

    f("uk-list").innerHTML = unter.length ? unter.map((u) => `
      <div class="list-item">
        <div class="li-main">
          <strong>${esc(u.name)}</strong>
          <span class="li-sub">${u.nrVon != null ? `Nr. ${u.nrVon}–${u.nrBis} · ` : ""}${benutzt(u.id)} Artikel</span>
        </div>
        <div class="li-actions">
          <button class="icon-btn" data-uk-edit="${u.id}" title="Umbenennen"><i data-icon="pencil" data-size="15"></i></button>
          <button class="icon-btn" data-uk-del="${u.id}" title="Löschen"><i data-icon="trash-2" data-size="15"></i></button>
        </div>
      </div>`).join("") : '<p class="hint-text">Noch keine Unterkategorien.</p>';

    const voll = hatBereich && g && !freierBlock(kat);
    f("uk-add").textContent = bearbeiteUid ? "Umbenennen" : "Hinzufügen";
    f("uk-add").disabled = !bearbeiteUid && (voll || (hatBereich && !g));
    f("uk-voll").style.display = voll && !bearbeiteUid ? "" : "none";
  }

  async function speichern(daten) {
    await updateDoc(doc(db, "kategorien", kat.id), { ...daten, updatedAt: serverTimestamp() });
  }

  maxEl.addEventListener("change", async () => {
    errEl.textContent = "";
    const n = Number(maxEl.value);
    const gesamt = kat.nrBis - kat.nrVon + 1;
    if (!Number.isInteger(n) || n < 1 || n > gesamt) { errEl.textContent = `Bitte eine Zahl zwischen 1 und ${gesamt} eingeben.`; return; }
    try { await speichern({ maxUnter: n }); } catch (e) { console.error(e); errEl.textContent = "Speichern fehlgeschlagen."; }
  });

  f("uk-add").addEventListener("click", async () => {
    errEl.textContent = "";
    const name = nameEl.value.trim();
    if (!name) { errEl.textContent = "Bitte einen Namen eingeben."; return; }
    const liste = kat.unterkategorien || [];
    if (liste.some((u) => u.name.toLowerCase() === name.toLowerCase() && u.id !== bearbeiteUid)) {
      errEl.textContent = "Diese Unterkategorie gibt es schon."; return;
    }
    let neu;
    if (bearbeiteUid) {
      neu = liste.map((u) => (u.id === bearbeiteUid ? { ...u, name } : u));
    } else {
      const block = kat.nrVon != null ? freierBlock(kat) : { nrVon: null, nrBis: null };
      if (!block) { errEl.textContent = "Alle Blöcke sind belegt."; return; }
      neu = [...liste, { id: neueId(), name, ...block }];
    }
    try {
      await speichern({ unterkategorien: neu });
      toast(bearbeiteUid ? "Unterkategorie umbenannt" : `«${name}» hinzugefügt`);
      bearbeiteUid = null;
      nameEl.value = "";
    } catch (e) { console.error(e); errEl.textContent = "Speichern fehlgeschlagen."; }
  });

  f("uk-list").addEventListener("click", async (e) => {
    const ed = e.target.closest("[data-uk-edit]");
    const del = e.target.closest("[data-uk-del]");
    if (ed) {
      const u = kat.unterkategorien.find((x) => x.id === ed.dataset.ukEdit);
      bearbeiteUid = u.id;
      nameEl.value = u.name;
      nameEl.focus();
      render();
    }
    if (del) {
      const u = kat.unterkategorien.find((x) => x.id === del.dataset.ukDel);
      const n = benutzt(u.id);
      if (n) { toast(`«${u.name}» hat noch ${n} Artikel – zuerst die Artikel umteilen`); return; }
      if (!confirm(`Unterkategorie «${u.name}» löschen? Ihr Nummernblock wird wieder frei.`)) return;
      try { await speichern({ unterkategorien: kat.unterkategorien.filter((x) => x.id !== u.id) }); toast("Unterkategorie gelöscht"); }
      catch (err) { console.error(err); toast("Löschen fehlgeschlagen"); }
    }
  });

  f("uk-close").addEventListener("click", () => closeModal("unter-modal"));

  return {
    oeffnen(id) {
      kat = kategorien.find((k) => k.id === id);
      bearbeiteUid = null;
      nameEl.value = "";
      errEl.textContent = "";
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
