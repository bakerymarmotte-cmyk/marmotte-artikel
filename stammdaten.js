// Feste Listen, die in der ganzen App gebraucht werden.
// Die Schlüssel (key) werden in der Datenbank gespeichert – nie ändern, nur den Text.

// Die 14 Hauptallergene nach Schweizer Lebensmittelrecht (LIV, Anhang 6)
export const ALLERGENE = [
  { key: "gluten",     label: "Glutenhaltiges Getreide", kurz: "Gluten" },
  { key: "krebstiere", label: "Krebstiere",              kurz: "Krebstiere" },
  { key: "eier",       label: "Eier",                    kurz: "Eier" },
  { key: "fisch",      label: "Fisch",                   kurz: "Fisch" },
  { key: "erdnuesse",  label: "Erdnüsse",                kurz: "Erdnüsse" },
  { key: "soja",       label: "Soja",                    kurz: "Soja" },
  { key: "milch",      label: "Milch (inkl. Laktose)",   kurz: "Milch" },
  { key: "nuesse",     label: "Schalenfrüchte (Nüsse)",  kurz: "Nüsse" },
  { key: "sellerie",   label: "Sellerie",                kurz: "Sellerie" },
  { key: "senf",       label: "Senf",                    kurz: "Senf" },
  { key: "sesam",      label: "Sesam",                   kurz: "Sesam" },
  { key: "sulfite",    label: "Schwefeldioxid / Sulfite", kurz: "Sulfite" },
  { key: "lupinen",    label: "Lupinen",                 kurz: "Lupinen" },
  { key: "weichtiere", label: "Weichtiere",              kurz: "Weichtiere" },
];

// Abteilungen (für Artikel und für die Abteilungs-Konten)
export const ABTEILUNGEN = [
  { key: "dorfladen", label: "Dorfladen Kandergrund" },
  { key: "laden",     label: "Laden Kandersteg" },
  { key: "tearoom",   label: "Tea Room Kandersteg" },
];

export const EINHEITEN = ["g", "kg", "ml", "l", "Stk"];

export const abteilungLabel = (key) => ABTEILUNGEN.find((a) => a.key === key)?.label || key;

// Vorschläge für den Lagerhinweis (im Formular zusätzlich «Eigener Text»)
export const LAGERHINWEISE = [
  "Kühl lagern (max. 5 °C)",
  "Kühl und trocken lagern",
  "Trocken lagern, vor Sonne schützen",
  "Bei Raumtemperatur lagern",
  "Tiefgekühlt lagern (–18 °C)",
];

// Nützliche Hinweise (je Ja/Nein)
export const HINWEISE = [
  { key: "schweinefett", label: "Schweinefett" },
  { key: "vegetarisch",  label: "Vegetarisch" },
  { key: "vegan",        label: "Vegan" },
];
