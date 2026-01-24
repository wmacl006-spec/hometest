// ---------------- PDF.js (MODULE IMPORT — FIX) ----------------
import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs";

// ---------------- Firebase ----------------
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  doc,
  setDoc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// ---------------- Firebase config ----------------
const firebaseConfig = {
  apiKey: "AIzaSyDAScHIxTwrXQEVCnEYxizNPSRKiuYsqqA",
  authDomain: "teampdf-7ec12.firebaseapp.com",
  projectId: "teampdf-7ec12",
  storageBucket: "teampdf-7ec12.firebasestorage.app",
  messagingSenderId: "307072046237",
  appId: "1:307072046237:web:d1f44f115fdf199b5a7074"
};

// ---------------- Init Firebase ----------------
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

// ---------------- PDF state ----------------
let pdfDoc = null;

// ---------------- Upload handler ----------------
document.getElementById("pdfUpload").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  console.log("Uploading PDF…");

  const storageRef = ref(storage, "pdfs/shared.pdf");
  await uploadBytes(storageRef, file);

  const url = await getDownloadURL(storageRef);

  console.log("Upload complete, broadcasting");

  await setDoc(doc(db, "session", "current"), {
    pdfUrl: url,
    page: 1,
    updatedAt: Date.now()
  });
});

// ---------------- Live listener ----------------
onSnapshot(doc(db, "session", "current"), async (snap) => {
  if (!snap.exists()) return;

  const { pdfUrl, page } = snap.data();
  console.log("PDF update received");

  await loadPDF(pdfUrl, page);
});

// ---------------- Render ----------------
async function loadPDF(url, pageNumber) {
  pdfDoc = await pdfjsLib.getDocument(url).promise;
  await renderPage(pageNumber);
}

async function renderPage(pageNumber) {
  const page = await pdfDoc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1.5 });

  const canvas = document.getElementById("pdfCanvas");
  const ctx = canvas.getContext("2d");

  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({
    canvasContext: ctx,
    viewport
  }).promise;
}
