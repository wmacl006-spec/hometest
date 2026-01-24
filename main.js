// ---------------- PDF.js ----------------
import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs";

// ---------------- Firebase ----------------
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  doc,
  setDoc,
  onSnapshot,
  updateDoc
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

// ---------------- State ----------------
let pdfDoc = null;
let currentPage = 1;
let totalPages = 1;

// ---------------- Upload ----------------
document.getElementById("pdfUpload").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const storageRef = ref(storage, "pdfs/shared.pdf");
  await uploadBytes(storageRef, file);

  const url = await getDownloadURL(storageRef);

  await setDoc(doc(db, "session", "current"), {
    pdfUrl: url,
    page: 1,
    updatedAt: Date.now()
  });
});

// ---------------- Live sync ----------------
onSnapshot(doc(db, "session", "current"), async (snap) => {
  if (!snap.exists()) return;

  const data = snap.data();

  if (!pdfDoc || data.pdfUrl !== pdfDoc._url) {
    await loadPDF(data.pdfUrl);
  }

  if (data.page !== currentPage) {
    currentPage = data.page;
    renderPage(currentPage);
  }
});

// ---------------- Navigation ----------------
document.getElementById("nextPage").onclick = async () => {
  if (currentPage >= totalPages) return;

  await updateDoc(doc(db, "session", "current"), {
    page: currentPage + 1
  });
};

document.getElementById("prevPage").onclick = async () => {
  if (currentPage <= 1) return;

  await updateDoc(doc(db, "session", "current"), {
    page: currentPage - 1
  });
};

// ---------------- PDF rendering ----------------
async function loadPDF(url) {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();

  pdfDoc = await pdfjsLib.getDocument({ data: buffer }).promise;
  totalPages = pdfDoc.numPages;

  renderPage(1);
}

async function renderPage(pageNumber) {
  const page = await pdfDoc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1.5 });

  const canvas = document.getElementById("pdfCanvas");
  const ctx = canvas.getContext("2d");

  canvas.width = viewport.width;
  canvas.height = viewport.height;

  document.getElementById("pageInfo").textContent =
    `Page ${pageNumber} / ${totalPages}`;

  await page.render({
    canvasContext: ctx,
    viewport
  }).promise;
}
