// -------- PDF.js --------
import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs";

// -------- Firebase --------
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

// -------- Config --------
const firebaseConfig = {
  apiKey: "AIzaSyDAScHIxTwrXQEVCnEYxizNPSRKiuYsqqA",
  authDomain: "teampdf-7ec12.firebaseapp.com",
  projectId: "teampdf-7ec12",
  storageBucket: "teampdf-7ec12.firebasestorage.app",
  messagingSenderId: "307072046237",
  appId: "1:307072046237:web:d1f44f115fdf199b5a7074"
};

// -------- Init --------
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

const viewer = document.getElementById("viewer");

let pdfDoc = null;
let isRemoteScroll = false;

// -------- Upload --------
document.getElementById("pdfUpload").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const storageRef = ref(storage, "pdfs/shared.pdf");
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);

  await setDoc(doc(db, "session", "current"), {
    pdfUrl: url,
    scrollTop: 0,
    updatedAt: Date.now()
  });
});

// -------- Firestore sync --------
onSnapshot(doc(db, "session", "current"), async (snap) => {
  if (!snap.exists()) return;
  const data = snap.data();

  if (!pdfDoc || data.pdfUrl !== pdfDoc._url) {
    await loadPDF(data.pdfUrl);
  }

  if (!isRemoteScroll) {
    isRemoteScroll = true;
    viewer.scrollTop = data.scrollTop || 0;
    setTimeout(() => (isRemoteScroll = false), 50);
  }
});

// -------- Scroll broadcasting --------
viewer.addEventListener("scroll", async () => {
  if (isRemoteScroll || !pdfDoc) return;

  await updateDoc(doc(db, "session", "current"), {
    scrollTop: viewer.scrollTop
  });
});

// -------- Render ALL pages --------
async function loadPDF(url) {
  viewer.innerHTML = "";

  const response = await fetch(url);
  const buffer = await response.arrayBuffer();

  pdfDoc = await pdfjsLib.getDocument({ data: buffer }).promise;

  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const canvas = document.createElement("canvas");
    viewer.appendChild(canvas);

    const page = await pdfDoc.getPage(i);
    const viewport = page.getViewport({ scale: 1.4 });

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;
  }
}
