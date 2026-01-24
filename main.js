// ---------- PDF.js ----------
import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs";
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs";

// ---------- Firebase ----------
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore, doc, setDoc, getDoc, updateDoc,
  onSnapshot, collection, addDoc, getDocs, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  getStorage, ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// ---------- Config ----------
const firebaseConfig = {
  apiKey: "AIzaSyDAScHIxTwrXQEVCnEYxizNPSRKiuYsqqA",
  authDomain: "teampdf-7ec12.firebaseapp.com",
  projectId: "teampdf-7ec12",
  storageBucket: "teampdf-7ec12.firebasestorage.app",
  messagingSenderId: "307072046237",
  appId: "1:307072046237:web:d1f44f115fdf199b5a7074"
};

// ---------- Init ----------
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

// ---------- DOM ----------
const viewer = document.getElementById("viewer");
const pdfUpload = document.getElementById("pdfUpload");
const uploadBtn = document.getElementById("uploadBtn");
const roomLabel = document.getElementById("roomLabel");
const lobbyUI = document.getElementById("lobbyUI");
const leaveBtn = document.getElementById("leaveRoom");
const toolbar = document.getElementById("toolbar");

const penBtn = document.getElementById("penTool");
const eraserBtn = document.getElementById("eraserTool");
const colorPicker = document.getElementById("colorPicker");
const eraserCursor = document.getElementById("eraserCursor");
const downloadBtn = document.getElementById("downloadPdf");
const colorHistoryEl = document.getElementById("colorHistory");

// ---------- State ----------
const drawState = { tool: "pen", color: "#b00b55" };
const colorHistory = [drawState.color];
const clientId = crypto.randomUUID();

let roomId = null;
let isTeacher = false;
let pdfDoc = null;
let annotationsLoaded = false;
let unsubRoom, unsubAnnotations;

// ---------- UI ----------
function enterRoomUI() {
  lobbyUI.classList.add("hidden");
  roomLabel.classList.remove("hidden");
  leaveBtn.classList.remove("hidden");

  if (isTeacher) {
    uploadBtn.classList.remove("hidden");
    toolbar.style.display = "flex";
    renderColorHistory(); // FIX #1
  }
}

function exitRoomUI() {
  lobbyUI.classList.remove("hidden");
  roomLabel.classList.add("hidden");
  leaveBtn.classList.add("hidden");
  uploadBtn.classList.add("hidden");
  toolbar.style.display = "none";
}

// ---------- Color History ----------
function renderColorHistory() {
  colorHistoryEl.innerHTML = "";
  colorHistory.forEach((c, i) => {
    const d = document.createElement("div");
    d.className = "color-swatch" + (i === 0 ? " active" : "");
    d.style.background = c;
    d.onclick = () => setActiveColor(c);
    colorHistoryEl.appendChild(d);
  });
}

function setActiveColor(c) {
  drawState.color = c;
  colorPicker.value = c;
  const i = colorHistory.indexOf(c);
  if (i !== -1) colorHistory.splice(i, 1);
  colorHistory.unshift(c);
  if (colorHistory.length > 5) colorHistory.length = 5;
  renderColorHistory();
}

colorPicker.oninput = e => setActiveColor(e.target.value);

// ---------- Tools ----------
penBtn.onclick = () => {
  drawState.tool = "pen";
  penBtn.classList.add("active");
  eraserBtn.classList.remove("active");
  eraserCursor.style.display = "none";
};

eraserBtn.onclick = () => {
  drawState.tool = "eraser";
  eraserBtn.classList.add("active");
  penBtn.classList.remove("active");
  eraserCursor.style.display = "block";
};

// ---------- Room ----------
document.getElementById("createRoom").onclick = async () => {
  roomId = crypto.randomUUID().slice(0, 6);
  isTeacher = true;
  await setDoc(doc(db, "rooms", roomId), { createdAt: Date.now() });
  roomLabel.textContent = `Room ${roomId}`;
  enterRoomUI();
};

document.getElementById("joinRoom").onclick = async () => {
  roomId = roomInput.value.trim();
  if (!roomId) return;
  isTeacher = false;
  roomLabel.textContent = `Room ${roomId}`;
  enterRoomUI();

  const snap = await getDoc(doc(db, "rooms", roomId));
  if (snap.exists() && snap.data().pdfUrl) loadPDF(snap.data().pdfUrl);

  listenRoom();
  listenAnnotations();
};

leaveBtn.onclick = () => {
  unsubRoom?.();
  unsubAnnotations?.();
  viewer.innerHTML = "";
  exitRoomUI();
};

// ---------- Upload ----------
uploadBtn.onclick = () => pdfUpload.click();

pdfUpload.onchange = async e => {
  const file = e.target.files[0];
  const refPdf = ref(storage, `pdfs/${roomId}.pdf`);
  await uploadBytes(refPdf, file);
  const url = await getDownloadURL(refPdf);
  await updateDoc(doc(db, "rooms", roomId), { pdfUrl: url });
  await loadPDF(url);
  listenRoom();
  listenAnnotations();
};

// ---------- Firestore ----------
function listenRoom() {
  unsubRoom?.();
  unsubRoom = onSnapshot(doc(db, "rooms", roomId), s => {
    if (s.data()?.pdfUrl && !pdfDoc) loadPDF(s.data().pdfUrl);
  });
}

function listenAnnotations() {
  unsubAnnotations?.();
  unsubAnnotations = onSnapshot(
    collection(db, "rooms", roomId, "annotations"),
    s => {
      if (!annotationsLoaded) return;
      s.docChanges().forEach(c => {
        if (c.doc.data().clientId !== clientId) drawAnnotation(c.doc.data());
      });
    }
  );
}

// ---------- PDF ----------
async function loadPDF(url) {
  viewer.innerHTML = "";
  pdfDoc = await pdfjsLib.getDocument(url).promise;

  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const vp = page.getViewport({ scale: 1.4 });

    const wrap = document.createElement("div");
    wrap.className = "page";

    const base = document.createElement("canvas");
    const overlay = document.createElement("canvas");

    base.width = overlay.width = vp.width;
    base.height = overlay.height = vp.height;
    overlay.className = "overlay";

    wrap.append(base, overlay);
    viewer.appendChild(wrap);

    await page.render({ canvasContext: base.getContext("2d"), viewport: vp }).promise;
    setupDrawing(overlay, i);
  }

  annotationsLoaded = true;
}

// ---------- Drawing ----------
function setupDrawing(canvas, page) {
  if (!isTeacher) return;
  const ctx = canvas.getContext("2d");
  let drawing = false;
  let pts = [];

  const pos = e => {
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / r.width,
      y: (e.clientY - r.top) / r.height
    };
  };

  canvas.onmousedown = e => {
    drawing = true;
    pts = [];
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x * canvas.width, p.y * canvas.height);
    pts.push(p);
  };

  canvas.onmousemove = e => {
    if (!drawing) return;
    const p = pos(e);
    pts.push(p);

    ctx.globalCompositeOperation =
      drawState.tool === "eraser" ? "destination-out" : "source-over";
    ctx.strokeStyle = drawState.color;
    ctx.lineWidth = drawState.tool === "eraser" ? 24 : 2;
    ctx.lineCap = "round";

    ctx.lineTo(p.x * canvas.width, p.y * canvas.height);
    ctx.stroke();
  };

  canvas.onmouseup = async () => {
    drawing = false;
    ctx.globalCompositeOperation = "source-over";
    if (pts.length < 2) return;

    await addDoc(collection(db, "rooms", roomId, "annotations"), {
      page,
      points: pts,
      tool: drawState.tool,
      color: drawState.color,
      clientId,
      createdAt: Date.now()
    });
  };
}

// ---------- Draw ----------
function drawAnnotation(a) {
  const page = viewer.children[a.page - 1];
  if (!page) return;

  const canvas = page.querySelector(".overlay");
  const ctx = canvas.getContext("2d");

  ctx.beginPath();
  ctx.globalCompositeOperation =
    a.tool === "eraser" ? "destination-out" : "source-over";
  ctx.strokeStyle = a.color;
  ctx.lineWidth = a.tool === "eraser" ? 24 : 2;
  ctx.lineCap = "round";

  a.points.forEach((p, i) => {
    const x = p.x * canvas.width;
    const y = p.y * canvas.height;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });

  ctx.stroke();
  ctx.globalCompositeOperation = "source-over";
}

// ---------- Download (FIX #2) ----------
downloadBtn.onclick = () => {
  if (!pdfDoc) return;

  const { jsPDF } = window.jspdf;
  const pages = document.querySelectorAll(".page");
  const dpr = window.devicePixelRatio || 1;
  let pdf;

  pages.forEach((p, i) => {
    const base = p.children[0];
    const overlay = p.children[1];

    const w = base.width / dpr;
    const h = base.height / dpr;

    const merged = document.createElement("canvas");
    merged.width = base.width;
    merged.height = base.height;

    const ctx = merged.getContext("2d");
    ctx.drawImage(base, 0, 0);
    ctx.drawImage(overlay, 0, 0);

    if (i === 0) {
      pdf = new jsPDF({ unit: "px", format: [w, h] });
    } else {
      pdf.addPage([w, h]);
    }

    pdf.addImage(
      merged.toDataURL("image/png"),
      "PNG",
      0,
      0,
      w,
      h
    );
  });

  pdf.save(`room-${roomId}.pdf`);
};
