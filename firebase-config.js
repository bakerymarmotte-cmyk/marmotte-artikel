// Firebase-Konfiguration für Marmotte Artikel
// Projekt "marmotte-sortiment" – gemeinsam für Artikel, später auch Rezepte und Etiketten.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyCKUuYW_WV8AN7JhTZz1i88tZt2m8-CKYs",
  authDomain: "marmotte-sortiment.firebaseapp.com",
  projectId: "marmotte-sortiment",
  storageBucket: "marmotte-sortiment.firebasestorage.app",
  messagingSenderId: "658554515186",
  appId: "1:658554515186:web:9504aa547681168dfeea6b"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
