// ============================
// Firebase Setup
// ============================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, push, onChildAdded, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getStorage, ref as sRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyBUQgksDWqis5CYkivxYnQTHY9GHiSR8SA",
  authDomain: "pdfproject-79cac.firebaseapp.com",
  databaseURL: "https://pdfproject-79cac-default-rtdb.firebaseio.com",
  projectId: "pdfproject-79cac",
  storageBucket: "pdfproject-79cac.firebasestorage.app",
  messagingSenderId: "588286215167",
  appId: "1:588286215167:web:d31467d50048fd6916ddca"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const storage = getStorage(app);

// ============================
// Room Logic
// ============================
const params = new URLSearchParams(location.search);
let roomId = params.get("room");

if (!roomId) {
  roomId = Math.random().toString(36).slice(2, 8);
  location.search = `?room=${roomId}`;
}

document.getElementById("roomInfo").textContent = `Room: ${roomId}`;

// ============================
// Canvas Setup
// ============================
const pdfCanvas = document.getElementById("pdfCanvas");
const drawCanvas = document.getElementById("drawCanvas");
const pdfCtx = pdfCanvas.getContext("2d");
const drawCtx = drawCanvas.getContext("2d");

let pdfDoc = null;
let currentPage = 1;

// ============================
// PDF Rendering
// ============================
async function renderPDF(url) {
  pdfDoc = await pdfjsLib.getDocument(url).promise;
  renderPage(currentPage);
}

async function renderPage(pageNum) {
  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale: 1.5 });

  pdfCanvas.width = viewport.width;
  pdfCanvas.height = viewport.height;
  drawCanvas.width = viewport.width;
  drawCanvas.height = viewport.height;

  await page.render({
    canvasContext: pdfCtx,
    viewport
  }).promise;
}

// ============================
// PDF Upload (Host)
// ============================
document.getElementById("pdfInput").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;

  const pdfRef = sRef(storage, `rooms/${roomId}/pdf.pdf`);
  await uploadBytes(pdfRef, file);
  const url = await getDownloadURL(pdfRef);

  await set(ref(db, `rooms/${roomId}/pdf/url`), url);
});

// ============================
// Listen for PDF
// ============================
onValue(ref(db, `rooms/${roomId}/pdf/url`), snap => {
  if (snap.exists()) renderPDF(snap.val());
});

// ============================
// Drawing Logic
// ============================
let drawing = false;
let currentStroke = [];

drawCanvas.addEventListener("mousedown", e => {
  drawing = true;
  currentStroke = [];
  addPoint(e);
});

drawCanvas.addEventListener("mousemove", e => {
  if (!drawing) return;
  addPoint(e);
  drawStroke(currentStroke);
});

drawCanvas.addEventListener("mouseup", () => {
  drawing = false;
  if (currentStroke.length > 1) {
    push(ref(db, `rooms/${roomId}/strokes/${currentPage}`), {
      color: "#ff0000",
      width: 2,
      points: currentStroke
    });
  }
});

function addPoint(e) {
  const rect = drawCanvas.getBoundingClientRect();
  currentStroke.push({
    x: (e.clientX - rect.left) / rect.width,
    y: (e.clientY - rect.top) / rect.height
  });
}

function drawStroke(stroke) {
  drawCtx.strokeStyle = "#ff0000";
  drawCtx.lineWidth = 2;
  drawCtx.beginPath();

  stroke.forEach((p, i) => {
    const x = p.x * drawCanvas.width;
    const y = p.y * drawCanvas.height;
    if (i === 0) drawCtx.moveTo(x, y);
    else drawCtx.lineTo(x, y);
  });

  drawCtx.stroke();
}

// ============================
// Receive Strokes
// ============================
onChildAdded(ref(db, `rooms/${roomId}/strokes/${currentPage}`), snap => {
  const stroke = snap.val();
  drawCtx.strokeStyle = stroke.color;
  drawCtx.lineWidth = stroke.width;
  drawCtx.beginPath();

  stroke.points.forEach((p, i) => {
    const x = p.x * drawCanvas.width;
    const y = p.y * drawCanvas.height;
    if (i === 0) drawCtx.moveTo(x, y);
    else drawCtx.lineTo(x, y);
  });

  drawCtx.stroke();
});
