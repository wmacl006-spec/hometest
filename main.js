// Firebase imports
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

// Firebase config (yours)
const firebaseConfig = {
  apiKey: "AIzaSyDAScHIxTwrXQEVCnEYxizNPSRKiuYsqqA",
  authDomain: "teampdf-7ec12.firebaseapp.com",
  projectId: "teampdf-7ec12",
  storageBucket: "teampdf-7ec12.firebasestorage.app",
  messagingSenderId: "307072046237",
  appId: "1:307072046237:web:d1f44f115fdf199b5a7074"
};

// Init Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

// PDF.js setup
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.js";

let pdfDoc = null;

// Upload handler
document.getElementById("pdfUpload").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const storageRef = ref(storage, "pdfs/shared.pdf");

  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);

  // Broadcast to all clients
  await setDoc(doc(db, "session", "current"), {
    pdfUrl: url,
    page: 1,
    updatedAt: Date.now()
  });
});

// Listen for live updates
onSnapshot(doc(db, "session", "current"), async (snap) => {
  if (!snap.exists()) return;

  const { pdfUrl, page } = snap.data();
  await loadPDF(pdfUrl, page);
});

// Load + render PDF
async function loadPDF(url, pageNumber) {
  pdfDoc = await pdfjsLib.getDocument(url).promise;
  renderPage(pageNumber);
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
