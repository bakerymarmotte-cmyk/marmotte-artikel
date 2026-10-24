import { db } from "./firebase-config.js";
import {
  addDoc, collection, doc, updateDoc, deleteDoc, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { chf, parseChf, toInput, esc } from "./geld.js";
import { ALLERGENE, ABTEILUNGEN, EINHEITEN, abteilungLabel } from "./stammdaten.js";
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

  abtFilterEl.innerHTML = '<option value="">Alle Abteilungen</option>' +
    ABTEILUNGEN.map((a) => `<option value="${a.key}">${esc(a.label)}</option>`).join("");
  // Abteilungs-Konten sehen zuerst ihre eigenen Artikel
  if (session.profile.abteilung) abtFilterEl.value = session.profile.abteilung;

  [sucheEl, katFilterEl, abtFilterEl, inaktivEl].forEach((el) => el.addEventListener("input", render));

  // ---------- Hilfen ----------
  const katName = (a) => kategorien.find((k) => k.id === a.kategorieId)?.name || a.kategorieName || "Ohne Kategorie";
  const mengeText = (a) => (a.menge != null ? `${String(a.menge).replace(".", ",")} ${a.einheit || ""}`.trim() : "");
  const haltText = (a) => (a.haltbarkeitTage != null ? `${a.haltbarkeitTage} ${a.haltbarkeitTage === 1 ? "Tag" : "Tage"} haltbar` : "");
  const allergenListe = (a, stufe) => ALLERGENE.filter((x) => a.allergene?.[x.key] === stufe);
  const preis = (r) => (r != null ? chf(r) : "–");

  // ---------- Liste ----------
  function gefiltert() {
    const q = sucheEl.value.trim().toLowerCase();
    return artikel.filter((a) =>
      (inaktivEl.checked && isAdmin ? true : a.active !== false) &&
      (!katFilterEl.value || a.kategorieId === katFilterEl.value) &&
      (!abtFilterEl.value || (a.abteilungen || []).includes(abtFilterEl.value)) &&
      (!q || a.name.toLowerCase().includes(q) || (a.zutaten || "").toLowerCase().includes(q))
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
    for (const a of rows) {
      const name = katName(a);
      if (!gruppen.has(name)) gruppen.set(name, []);
      gruppen.get(name).push(a);
    }
    const namen = [...gruppen.keys()].sort((x, y) =>
      (x === "Ohne Kategorie") - (y === "Ohne Kategorie") || x.localeCompare(y));

    listEl.innerHTML = namen.map((name) => `
      <div class="m-section-title">${esc(name)}</div>
      ${gruppen.get(name).map((a) => {
        const sub = [mengeText(a), haltText(a)].filter(Boolean).join(" · ");
        const enth = allergenListe(a, "enthalten").map((x) => x.kurz);
        return `
        <button class="art-item ${a.active === false ? "is-inactive" : ""}" data-id="${a.id}" type="button">
          <div class="ai-main">
            <div class="ai-name">${esc(a.name)}${a.active === false ? ' <span class="li-sub">· inaktiv</span>' : ""}</div>
            ${sub ? `<div class="ai-sub">${esc(sub)}</div>` : ""}
            ${enth.length ? `<div class="ai-allerg">${esc(enth.join(" · "))}</div>` : ""}
          </div>
          <div class="ai-preise">
            ${a.preisLaden != null ? `<div><span class="ai-pl">Laden</span> <span class="mono">${chf(a.preisLaden)}</span></div>` : ""}
            ${a.preisTearoom != null ? `<div><span class="ai-pl">Tea Room</span> <span class="mono">${chf(a.preisTearoom)}</span></div>` : ""}
          </div>
        </button>`;
      }).join("")}`).join("");
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
          <div class="li-sub">${esc(katName(a))}${a.active === false ? " · inaktiv" : ""}</div>
        </div>
      </div>
      <div class="preis-boxen">
        <div class="preis-box"><span>Preis Laden</span><strong class="mono">${preis(a.preisLaden)}</strong></div>
        <div class="preis-box"><span>Preis Tea Room</span><strong class="mono">${preis(a.preisTearoom)}</strong></div>
      </div>
      <div class="detail-grid">
        ${zeile("Menge", esc(mengeText(a)))}
        ${zeile("Haltbarkeit", a.haltbarkeitTage != null ? `${a.haltbarkeitTage} ${a.haltbarkeitTage === 1 ? "Tag" : "Tage"}` : "")}
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
      ${a.updatedBy ? `<p class="hint-text" style="margin:14px 0 0;">Zuletzt bearbeitet von ${esc(a.updatedBy)}${a.updatedAt?.toDate ? ` am ${a.updatedAt.toDate().toLocaleDateString("de-CH")}` : ""}</p>` : ""}`;
    openModal("detail-modal");
  }
  document.getElementById("detail-close").addEventListener("click", () => closeModal("detail-modal"));

  function fuelleKategorieFilter() {
    const aktuell = katFilterEl.value;
    katFilterEl.innerHTML = '<option value="">Alle Kategorien</option>' +
      kategorien.map((k) => `<option value="${k.id}">${esc(k.name)}</option>`).join("");
    katFilterEl.value = kategorien.some((k) => k.id === aktuell) ? aktuell : "";
  }

  if (!isAdmin) {
    return {
      setArtikel(list) { artikel = list; render(); },
      setKategorien(list) { kategorien = list; fuelleKategorieFilter(); render(); },
    };
  }

  // ---------- Bearbeiten (nur Admin) ----------
  const f = (id) => document.getElementById(id);
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

  function oeffneFormular(a) {
    bearbeite = a || null;
    f("edit-title").textContent = a ? "Artikel bearbeiten" : "Neuer Artikel";
    f("edit-error").textContent = "";
    fuelleKategorieAuswahl(a?.kategorieId);
    f("a-name").value = a?.name || "";
    f("a-preis-laden").value = toInput(a?.preisLaden);
    f("a-preis-tearoom").value = toInput(a?.preisTearoom);
    f("a-menge").value = a?.menge != null ? String(a.menge) : "";
    f("a-einheit").value = a?.einheit || "g";
    f("a-haltbarkeit").value = a?.haltbarkeitTage ?? "";
    f("a-zutaten").value = a?.zutaten || "";
    f("a-abteilungen").querySelectorAll("input").forEach((i) => { i.checked = (a?.abteilungen || []).includes(i.value); });
    ALLERGENE.forEach((x) => setzeAllergen(x.key, a?.allergene?.[x.key]));
    f("edit-extra").style.display = a ? "flex" : "none";
    if (a) f("edit-toggle").textContent = a.active === false ? "Wieder aktivieren" : "Deaktivieren";
    closeModal("detail-modal");
    openModal("edit-modal");
    if (!a) setTimeout(() => f("a-name").focus(), 50);
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
    if (artikel.some((a) => a.name.toLowerCase() === name.toLowerCase() && a.id !== bearbeite?.id)) {
      err.textContent = "Es gibt bereits einen Artikel mit diesem Namen."; return;
    }
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

    const daten = {
      name,
      kategorieId,
      kategorieName: kategorien.find((k) => k.id === kategorieId)?.name || "",
      abteilungen: [...f("a-abteilungen").querySelectorAll("input:checked")].map((i) => i.value),
      preisLaden,
      preisTearoom,
      menge,
      einheit: menge !== null ? f("a-einheit").value : null,
      haltbarkeitTage,
      zutaten: f("a-zutaten").value.trim(),
      allergene,
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
    if (!neu && !confirm(`«${bearbeite.name}» deaktivieren? Der Artikel wird für die Abteilungen ausgeblendet, bleibt aber gespeichert.`)) return;
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
