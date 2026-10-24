import { db, firebaseConfig } from "./firebase-config.js";
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, doc, getDocs, setDoc, updateDoc, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { esc } from "./geld.js";
import { ABTEILUNGEN, abteilungLabel } from "./stammdaten.js";
import { toast } from "./ui.js";

// Konten verwalten (nur Admin): ein gemeinsames Konto pro Abteilung (nur lesen) oder Admin-Konten
export function initTeam(session) {
  const listEl = document.getElementById("team-list");
  const errorEl = document.getElementById("emp-error");
  const saveBtn = document.getElementById("emp-speichern");
  let geladen = false;

  const rolleEl = document.getElementById("emp-rolle");
  const abtEl = document.getElementById("emp-abteilung");
  const abtFeld = document.getElementById("emp-abteilung-feld");
  const hinweisEl = document.getElementById("emp-hinweis");
  abtEl.innerHTML = ABTEILUNGEN.map((a) => `<option value="${a.key}">${esc(a.label)}</option>`).join("");
  function rolleGeaendert() {
    const abt = rolleEl.value === "abteilung";
    abtFeld.style.visibility = abt ? "visible" : "hidden";
    hinweisEl.textContent = abt
      ? "Gemeinsames Konto für die Abteilung, kann nur lesen. Das Passwort gilt direkt, es muss nicht geändert werden."
      : "Admin-Konto. Das Passwort muss beim ersten Login geändert werden.";
    if (abt && !document.getElementById("emp-name").value) document.getElementById("emp-name").placeholder = abtEl.selectedOptions[0]?.text || "";
  }
  rolleEl.addEventListener("change", rolleGeaendert);
  abtEl.addEventListener("change", rolleGeaendert);
  rolleGeaendert();

  async function lade() {
    try {
      const snap = await getDocs(collection(db, "users"));
      const users = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.active === false) - (b.active === false) || (a.name || "").localeCompare(b.name || ""));
      listEl.innerHTML = users
        .map((u) => `
          <div class="list-item ${u.active === false ? "is-inactive" : ""}">
            <div class="li-main">
              <strong>${esc(u.name)}</strong>
              <span class="li-sub">${esc(u.email)} · ${u.role === "admin" ? "Admin" : "Abteilung " + esc(abteilungLabel(u.abteilung))}${u.active === false ? " · inaktiv" : ""}</span>
            </div>
            ${u.id === session.uid ? '<span class="li-sub">Du</span>' :
              `<button class="btn btn-secondary btn-small" data-toggle="${u.id}" data-active="${u.active !== false}">${u.active === false ? "Aktivieren" : "Deaktivieren"}</button>`}
          </div>`)
        .join("");
      listEl.querySelectorAll("[data-toggle]").forEach((b) =>
        b.addEventListener("click", async () => {
          const neu = b.dataset.active !== "true";
          try {
            await updateDoc(doc(db, "users", b.dataset.toggle), { active: neu });
            lade();
          } catch (err) {
            console.error(err);
            toast("Ändern fehlgeschlagen");
          }
        })
      );
    } catch (err) {
      console.error(err);
      listEl.innerHTML = '<p class="error-text">Konten konnten nicht geladen werden.</p>';
    }
  }

  // Erst laden, wenn der Tab geöffnet wird
  document.querySelector('[data-tab="team"]').addEventListener("click", () => {
    if (!geladen) { geladen = true; lade(); }
  });

  saveBtn.addEventListener("click", async () => {
    errorEl.textContent = "";
    const role = rolleEl.value;
    // Bei Abteilungs-Konten ist der Name standardmässig der Abteilungsname
    const name = document.getElementById("emp-name").value.trim() || (role === "abteilung" ? abteilungLabel(abtEl.value) : "");
    const email = document.getElementById("emp-email").value.trim();
    const password = document.getElementById("emp-password").value;
    if (!name || !email) { errorEl.textContent = "Bitte Name und E-Mail ausfüllen."; return; }
    if (password.length < 8) { errorEl.textContent = "Das Passwort braucht mindestens 8 Zeichen."; return; }

    saveBtn.disabled = true;
    // Zweite Firebase-Instanz: so bleibt der Admin angemeldet, während das neue Konto erstellt wird
    const secondary = initializeApp(firebaseConfig, "Secondary-" + Date.now());
    const secondaryAuth = getAuth(secondary);
    try {
      const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
      const profil = { name, email, role, active: true, mustChangePassword: role === "admin", createdAt: serverTimestamp() };
      if (role === "abteilung") profil.abteilung = abtEl.value;
      await setDoc(doc(db, "users", cred.user.uid), profil);
      await signOut(secondaryAuth);
      ["emp-name", "emp-email", "emp-password"].forEach((id) => (document.getElementById(id).value = ""));
      toast(`Konto «${name}» wurde erstellt`);
      lade();
    } catch (err) {
      console.error(err);
      errorEl.textContent = {
        "auth/email-already-in-use": "Diese E-Mail-Adresse wird bereits verwendet.",
        "auth/invalid-email": "Diese E-Mail-Adresse ist ungültig.",
        "auth/weak-password": "Das Passwort ist zu schwach.",
      }[err.code] || "Konto konnte nicht erstellt werden.";
    } finally {
      await deleteApp(secondary).catch(() => {});
      saveBtn.disabled = false;
    }
  });
}
