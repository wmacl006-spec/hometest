import { auth, db, rtdb } from "./firebase.js";
import { signInAnonymously } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { ref, push, onChildAdded } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.mjs";

await signInAnonymously(auth);

const roomId = new URLSearchParams(location.search).get("room");
const roomSnap = await getDoc(doc(db, "rooms", roomId));
const { pdfUrl, ownerUid } = roomSnap.data();

const isOwner = auth.currentUser.uid === ownerUid;

// Load PDF
const pdf = await pdfjsLib.getDocument(pdfUrl).promise;
const page = await pdf.getPage(1);

const viewport = page.getViewport({ scale: 1.5 });
const pdfCanvas = document.getElementById("pdfCanvas");
const drawCanvas = document.getElementById("drawCanvas");

[pdfCanvas, drawCanvas].forEach(c => {
  c.width = viewport.width;
  c.height = viewport.height;
});

await page.render({
  canvasContext: pdfCanvas.getContext("2d"),
  viewport
}).promise;

// Drawing setup
const ctx = drawCanvas.getContext("2d");
ctx.lineWidth = 2;
ctx.strokeStyle = "red";

const drawRef = ref(rtdb, `drawing/${roomId}`);

let drawing = false;
let lastX, lastY;

if (isOwner) {
  drawCanvas.addEventListener("mousedown", e => {
    drawing = true;
    push(drawRef, { x: e.offsetX, y: e.offsetY, type: "start" });
  });

  drawCanvas.addEventListener("mousemove", e => {
    if (!drawing) return;
    push(drawRef, { x: e.offsetX, y: e.offsetY, type: "draw" });
  });

  window.addEventListener("mouseup", () => drawing = false);
} else {
  drawCanvas.style.pointerEvents = "none";
}

// Replay drawing
onChildAdded(drawRef, snap => {
  const { x, y, type } = snap.val();

  if (type === "start") {
    lastX = x;
    lastY = y;
    return;
  }

  ctx.beginPath();
  ctx.moveTo(lastX, lastY);
  ctx.lineTo(x, y);
  ctx.stroke();

  lastX = x;
  lastY = y;
});
