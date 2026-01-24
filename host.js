import { db, storage } from "./firebase.js";
import {
  doc,
  setDoc,
  updateDoc,
  collection,
  addDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const roomCode = new URLSearchParams(location.search).get("room");

const pdfCanvas = document.getElementById("pdfCanvas");
const drawCanvas = document.getElementById("drawCanvas");
const pdfCtx = pdfCanvas.getContext("2d");
const drawCtx = drawCanvas.getContext("2d");

drawCtx.lineCap = "round";
drawCtx.lineJoin = "round";

let drawing = false;
let lastX = 0;
let lastY = 0;

// Create room
await setDoc(doc(db, "rooms", roomCode), {
  createdAt: Date.now()
});

// Upload PDF
pdfInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const pdfRef = ref(storage, `pdfs/${roomCode}.pdf`);
  await uploadBytes(pdfRef, file);

  const url = await getDownloadURL(pdfRef);
  await updateDoc(doc(db, "rooms", roomCode), { pdfUrl: url });

  renderPDF(url);
});

// Render PDF
async function renderPDF(url) {
  const pdf = await pdfjsLib.getDocument(url).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 1.5 });

  pdfCanvas.width = drawCanvas.width = viewport.width;
  pdfCanvas.height = drawCanvas.height = viewport.height;

  await page.render({
    canvasContext: pdfCtx,
    viewport
  }).promise;
}

// Drawing
drawCanvas.addEventListener("mousedown", (e) => {
  drawing = true;
  lastX = e.offsetX;
  lastY = e.offsetY;
});

drawCanvas.addEventListener("mouseup", () => drawing = false);
drawCanvas.addEventListener("mouseleave", () => drawing = false);

drawCanvas.addEventListener("mousemove", async (e) => {
  if (!drawing) return;

  const stroke = {
    x0: lastX,
    y0: lastY,
    x1: e.offsetX,
    y1: e.offsetY,
    color: "red",
    width: 2,
    timestamp: Date.now()
  };

  drawStroke(stroke);
  await addDoc(collection(db, "rooms", roomCode, "strokes"), stroke);

  lastX = e.offsetX;
  lastY = e.offsetY;
});

function drawStroke(s) {
  drawCtx.strokeStyle = s.color;
  drawCtx.lineWidth = s.width;
  drawCtx.beginPath();
  drawCtx.moveTo(s.x0, s.y0);
  drawCtx.lineTo(s.x1, s.y1);
  drawCtx.stroke();
}
