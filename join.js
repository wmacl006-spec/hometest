import { db } from "./firebase.js";
import {
  doc,
  getDoc,
  collection,
  onSnapshot,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const roomCode = new URLSearchParams(location.search).get("room");

const pdfCanvas = document.getElementById("pdfCanvas");
const drawCanvas = document.getElementById("drawCanvas");
const pdfCtx = pdfCanvas.getContext("2d");
const drawCtx = drawCanvas.getContext("2d");

drawCanvas.style.pointerEvents = "none";

// Load room
const roomSnap = await getDoc(doc(db, "rooms", roomCode));
if (!roomSnap.exists()) {
  alert("Room not found");
  throw new Error("Room not found");
}

const { pdfUrl } = roomSnap.data();
if (pdfUrl) renderPDF(pdfUrl);

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

// Live strokes
const q = query(
  collection(db, "rooms", roomCode, "strokes"),
  orderBy("timestamp")
);

onSnapshot(q, (snap) => {
  snap.docChanges().forEach(change => {
    if (change.type === "added") {
      drawStroke(change.doc.data());
    }
  });
});

function drawStroke(s) {
  drawCtx.strokeStyle = s.color;
  drawCtx.lineWidth = s.width;
  drawCtx.beginPath();
  drawCtx.moveTo(s.x0, s.y0);
  drawCtx.lineTo(s.x1, s.y1);
  drawCtx.stroke();
}
