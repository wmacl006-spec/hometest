// --- PDF.js ES MODULE (NO GLOBALS) ---
import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/legacy/build/pdf.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/legacy/build/pdf.worker.min.js";

// --- Firebase ---
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

// --- Firebase config ---
const firebaseConfig = {
  apiKey: "AIzaSyDAScHIxTwrXQEVCnEYxizNPSRKiuYsqqA",
  authDomain: "teampdf-7ec12.firebaseapp.com",
  projectId: "teampdf-7ec12",
  storageBucket: "teampdf-7ec12.firebasestorage.app",
  messagingSenderId: "307072046237",
  appId: "1:307072046237:web:d1f44f115fdf199b5a7074"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

const viewer = document.getElementById("viewer");
let pdfDoc = null;

// --- Upload PDF ---
document.getElementById("pdfUpload").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const storageRef = ref(storage, "pdfs/shared.pdf");
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);

  await setDoc(doc(db, "session", "current"), {
    pdfUrl: url,
    updatedAt: Date.now()
  });
});

// --- Live updates ---
onSnapshot(doc(db, "session", "current"), async (snap) => {
  if (!snap.exists()) return;
  await loadPDF(snap.data().pdfUrl);
});

// --- Load & render PDF ---
async function loadPDF(url) {
  viewer.innerHTML = "";

  const buffer = await fetch(url).then(r => r.arrayBuffer());
  pdfDoc = await pdfjsLib.getDocument({ data: buffer }).promise;

  for (let i = 1; i <= pdfDoc.numPages; i++) {
    await renderPage(i);
  }
}

async function renderPage(num) {
  const page = await pdfDoc.getPage(num);
  const viewport = page.getViewport({ scale: 1.4 });

  const pageDiv = document.createElement("div");
  pageDiv.className = "page";
  pageDiv.style.width = viewport.width + "px";
  pageDiv.style.height = viewport.height + "px";
  viewer.appendChild(pageDiv);

  // PDF canvas
  const pdfCanvas = document.createElement("canvas");
  pdfCanvas.width = viewport.width;
  pdfCanvas.height = viewport.height;
  pageDiv.appendChild(pdfCanvas);

  await page.render({
    canvasContext: pdfCanvas.getContext("2d"),
    viewport
  }).promise;

  // Drawing canvas
  const drawCanvas = document.createElement("canvas");
  drawCanvas.width = viewport.width;
  drawCanvas.height = viewport.height;
  drawCanvas.className = "draw-layer";
  pageDiv.appendChild(drawCanvas);

  enableDrawing(drawCanvas);
}

// --- Drawing ---
function enableDrawing(canvas) {
  const ctx = canvas.getContext("2d");

  let drawing = false;
  let lastX = 0;
  let lastY = 0;

  ctx.strokeStyle = "red";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";

  canvas.addEventListener("mousedown", e => {
    drawing = true;
    const r = canvas.getBoundingClientRect();
    lastX = e.clientX - r.left;
    lastY = e.clientY - r.top;
  });

  canvas.addEventListener("mousemove", e => {
    if (!drawing) return;
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;

    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(x, y);
    ctx.stroke();

    lastX = x;
    lastY = y;
  });

  ["mouseup", "mouseleave"].forEach(evt =>
    canvas.addEventListener(evt, () => drawing = false)
  );
}
