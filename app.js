import { requireSession, logout } from "./session.js";
import { db } from "./firebase-config.js";
import { collection, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { initArtikel } from "./artikel.js";
import { initKategorien } from "./kategorien.js";
import { initTeam } from "./team.js";
import { toast } from "./ui.js";

async function start() {
  let session;
  try {
    session = await requireSession();
  } catch (e) {
    return; // requireSession hat bereits umgeleitet
  }

  const { profile } = session;
  const isAdmin = profile.role === "admin";
  document.getElementById("user-name-label").textContent = profile.name || "";
  document.body.classList.toggle("is-admin", isAdmin);
  document.getElementById("logout-btn").addEventListener("click", logout);

  setupNav();

  const artikel = initArtikel(session);
  const kategorien = isAdmin ? initKategorien() : null;
  if (isAdmin) initTeam(session);

  // Kategorien live laden und weitergeben
  onSnapshot(
    query(collection(db, "kategorien"), orderBy("name")),
    (snap) => {
      // Reihenfolge nach Nummernbereich (Kategorien ohne Bereich alphabetisch am Schluss)
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.nrVon ?? Infinity) - (b.nrVon ?? Infinity) || a.name.localeCompare(b.name, "de"));
      artikel.setKategorien(list);
      kategorien?.setKategorien(list);
    },
    (err) => { console.error(err); toast("Kategorien konnten nicht geladen werden."); }
  );

  // Artikel live laden (eine Abfrage, danach nur noch Änderungen)
  onSnapshot(
    query(collection(db, "artikel"), orderBy("name")),
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      artikel.setArtikel(list);
      kategorien?.setArtikel(list);
    },
    (err) => { console.error(err); toast("Artikel konnten nicht geladen werden."); }
  );

  document.querySelectorAll(".modal-backdrop").forEach((m) =>
    m.addEventListener("click", (e) => { if (e.target === m) m.classList.remove("active"); })
  );
}

function setupNav() {
  const buttons = document.querySelectorAll("#main-nav button");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      document.getElementById("panel-" + btn.dataset.tab).classList.add("active");
      window.scrollTo(0, 0);
    });
  });
}

start();
