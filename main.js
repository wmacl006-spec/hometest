import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs";
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore, doc, setDoc, getDoc, updateDoc,
  collection, addDoc, onSnapshot, getDocs, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  getStorage, ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

/* ---------- Firebase ---------- */
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

/* ---------- DOM ---------- */
const viewer = document.getElementById("viewer");
const lobbyUI = document.getElementById("lobbyUI");
const roomLabel = document.getElementById("roomLabel");
const uploadBtn = document.getElementById("uploadBtn");
const pdfUpload = document.getElementById("pdfUpload");
const leaveBtn = document.getElementById("leaveRoom");
const toolbar = document.getElementById("toolbar");

const penBtn = document.getElementById("penTool");
const eraserBtn = document.getElementById("eraserTool");
const colorPicker = document.getElementById("colorPicker");
const eraserCursor = document.getElementById("eraserCursor");

/* ---------- State ---------- */
let roomId = null;
let isTeacher = false;
let pdfDoc = null;
let annotationsLoaded = false;

const clientId = crypto.randomUUID();

const drawState = {
  tool: "pen",
  color: "#b00b55"
};

/* ---------- UI ---------- */
function enterRoom() {
  lobbyUI.classList.add("hidden");
  roomLabel.classList.remove("hidden");
  leaveBtn.classList.remove("hidden");
  if (isTeacher) {
    uploadBtn.classList.remove("hidden");
    toolbar.style.display = "flex";
  }
}

function leaveRoom() {
  roomId = null;
  pdfDoc = null;
  annotationsLoaded = false;
  viewer.innerHTML = "";
  lobbyUI.classList.remove("hidden");
  roomLabel.classList.add("hidden");
  leaveBtn.classList.add("hidden");
  uploadBtn.classList.add("hidden");
  toolbar.style.display = "none";
}

/* ---------- Tools ---------- */
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

colorPicker.oninput = e => drawState.color = e.target.value;

/* ---------- Room ---------- */
document.getElementById("createRoom").onclick = async () => {
  roomId = crypto.randomUUID().slice(0, 6);
  isTeacher = true;
  await setDoc(doc(db, "rooms", roomId), { createdAt: Date.now() });
  roomLabel.textContent = `Room ${roomId}`;
  enterRoom();
};

document.getElementById("joinRoom").onclick = async () => {
  roomId = document.getElementById("roomInput").value.trim();
  if (!roomId) return;

  isTeacher = false;
  roomLabel.textContent = `Room ${roomId}`;
  enterRoom();

  const snap = await getDoc(doc(db, "rooms", roomId));
  if (snap.exists() && snap.data().pdfUrl) {
    await loadPDF(snap.data().pdfUrl);
    await loadHistory();
  }

  listenAnnotations();
};

leaveBtn.onclick = leaveRoom;

/* ---------- Upload ---------- */
uploadBtn.onclick = () => pdfUpload.click();

pdfUpload.onchange = async e => {
  const file = e.target.files[0];
  const pdfRef = ref(storage, `pdfs/${roomId}.pdf`);
  await uploadBytes(pdfRef, file);
  const url = await getDownloadURL(pdfRef);
  await updateDoc(doc(db, "rooms", roomId), { pdfUrl: url });
  await loadPDF(url);
  await loadHistory();
  listenAnnotations();
};

/* ---------- PDF ---------- */
async function loadPDF(url) {
  viewer.innerHTML = "";
  pdfDoc = await pdfjsLib.getDocument(url).promise;

  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const vp = page.getViewport({ scale: 1.4 });

    const pageDiv = document.createElement("div");
    pageDiv.className = "page";

    const base = document.createElement("canvas");
    const remote = document.createElement("canvas");
    const local = document.createElement("canvas");

    [base, remote, local].forEach(c => {
      c.width = vp.width;
      c.height = vp.height;
      c.style.width = `${vp.width}px`;
      c.style.height = `${vp.height}px`;
    });

    pageDiv.append(base, remote, local);
    viewer.appendChild(pageDiv);

    await page.render({ canvasContext: base.getContext("2d"), viewport: vp }).promise;

    setupDrawing(local, remote, i);
  }
}

/* ---------- Drawing ---------- */
function setupDrawing(local, remote, page) {
  if (!isTeacher) return;

  const lctx = local.getContext("2d");
  const rctx = remote.getContext("2d");

  let drawing = false;
  let points = [];

  const pos = e => {
    const r = local.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / r.width,
      y: (e.clientY - r.top) / r.height
    };
  };

  local.onmousedown = e => {
    drawing = true;
    points = [];
    const p = pos(e);
    points.push(p);
    lctx.beginPath();
    lctx.moveTo(p.x * local.width, p.y * local.height);
  };

  local.onmousemove = e => {
    if (drawState.tool === "eraser") {
      eraserCursor.style.left = `${e.clientX}px`;
      eraserCursor.style.top = `${e.clientY}px`;
    }
    if (!drawing) return;

    const p = pos(e);
    points.push(p);

    lctx.globalCompositeOperation =
      drawState.tool === "eraser" ? "destination-out" : "source-over";

    lctx.strokeStyle = drawState.color;
    lctx.lineWidth = drawState.tool === "eraser" ? 24 : 2;
    lctx.lineCap = "round";
    lctx.lineJoin = "round";

    lctx.lineTo(p.x * local.width, p.y * local.height);
    lctx.stroke();
  };

  local.onmouseup = async () => {
    drawing = false;
    lctx.globalCompositeOperation = "source-over";

    if (points.length < 2) return;

    // commit locally
    rctx.beginPath();
    rctx.strokeStyle = drawState.color;
    rctx.lineWidth = drawState.tool === "eraser" ? 24 : 2;
    rctx.lineCap = "round";
    rctx.lineJoin = "round";

    points.forEach((p, i) => {
      const x = p.x * remote.width;
      const y = p.y * remote.height;
      i ? rctx.lineTo(x, y) : rctx.moveTo(x, y);
    });
    rctx.stroke();

    lctx.clearRect(0, 0, local.width, local.height);

    await addDoc(collection(db, "rooms", roomId, "annotations"), {
      page,
      points,
      tool: drawState.tool,
      color: drawState.color,
      createdAt: Date.now(),
      clientId
    });
  };
}

/* ---------- Sync ---------- */
async function loadHistory() {
  annotationsLoaded = false;
  const q = query(
    collection(db, "rooms", roomId, "annotations"),
    orderBy("createdAt")
  );
  const snap = await getDocs(q);
  snap.forEach(d => drawRemote(d.data()));
  annotationsLoaded = true;
}

function listenAnnotations() {
  onSnapshot(collection(db, "rooms", roomId, "annotations"), snap => {
    if (!annotationsLoaded) return;
    snap.docChanges().forEach(c => {
      const d = c.doc.data();
      if (c.type === "added" && d.clientId !== clientId) {
        drawRemote(d);
      }
    });
  });
}

function drawRemote(a) {
  const pageDiv = viewer.children[a.page - 1];
  if (!pageDiv) return;
  const canvas = pageDiv.children[1];
  const ctx = canvas.getContext("2d");

  ctx.beginPath();
  ctx.globalCompositeOperation =
    a.tool === "eraser" ? "destination-out" : "source-over";

  ctx.strokeStyle = a.color;
  ctx.lineWidth = a.tool === "eraser" ? 24 : 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  a.points.forEach((p, i) => {
    const x = p.x * canvas.width;
    const y = p.y * canvas.height;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });

  ctx.stroke();
  ctx.globalCompositeOperation = "source-over";
}
