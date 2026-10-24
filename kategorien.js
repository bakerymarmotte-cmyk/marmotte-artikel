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

  function formularLeeren() {
    bearbeiteId = null;
    nameEl.value = "";
    errorEl.textContent = "";
    titleEl.textContent = "Neue Kategorie";
    saveBtn.textContent = "Kategorie anlegen";
    cancelBtn.style.display = "none";
  }

  saveBtn.addEventListener("click", async () => {
    errorEl.textContent = "";
    const name = nameEl.value.trim();
    if (!name) { errorEl.textContent = "Bitte einen Namen eingeben."; return; }
    if (kategorien.some((k) => k.name.toLowerCase() === name.toLowerCase() && k.id !== bearbeiteId)) {
      errorEl.textContent = "Es gibt bereits eine Kategorie mit diesem Namen."; return;
    }
    saveBtn.disabled = true;
    try {
      if (bearbeiteId) {
        await updateDoc(doc(db, "kategorien", bearbeiteId), { name, updatedAt: serverTimestamp() });
        toast("Kategorie umbenannt");
      } else {
        await addDoc(collection(db, "kategorien"), { name, active: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
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
    listEl.innerHTML = kategorien
      .map((k) => `
        <div class="list-item ${k.active === false ? "is-inactive" : ""}">
          <div class="li-main">
            <strong>${esc(k.name)}</strong>
            <span class="li-sub">${anzahl(k.id)} Artikel${k.active === false ? " · inaktiv" : ""}</span>
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
        titleEl.textContent = "Kategorie umbenennen";
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
    setKategorien(list) { kategorien = list; render(); },
    setArtikel(list) { artikel = list; render(); },
  };
}
