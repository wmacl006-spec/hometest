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

// ---------- GLOBAL DRAW STATE ----------
const drawState = {
  tool: "pen",
  color: "#b00b55",
  size: 2
};

const clientId = crypto.randomUUID(); // ⭐ IMPORTANT

// ---------- State ----------
let roomId = null;
let isTeacher = false;
let pdfDoc = null;
let unsubRoom = null;
let unsubAnnotations = null;
let annotationsLoaded = false;

// ---------- UI ----------
function enterRoomUI() {
  lobbyUI.classList.add("hidden");
  roomLabel.classList.remove("hidden");
  leaveBtn.classList.remove("hidden");

  if (isTeacher) {
    uploadBtn.classList.remove("hidden");
    toolbar.style.display = "flex";
  }
}

function exitRoomUI() {
  lobbyUI.classList.remove("hidden");
  roomLabel.classList.add("hidden");
  leaveBtn.classList.add("hidden");
  uploadBtn.classList.add("hidden");
  toolbar.style.display = "none";
}

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

colorPicker.oninput = e => drawState.color = e.target.value;

// ---------- Upload ----------
uploadBtn.onclick = () => pdfUpload.click();

// ---------- Create ----------
document.getElementById("createRoom").onclick = async () => {
  roomId = crypto.randomUUID().slice(0, 6);
  isTeacher = true;

  await setDoc(doc(db, "rooms", roomId), { createdAt: Date.now() });

  roomLabel.textContent = `Room ${roomId}`;
  enterRoomUI();
};

// ---------- Join ----------
document.getElementById("joinRoom").onclick = async () => {
  roomId = document.getElementById("roomInput").value.trim();
  if (!roomId) return;

  isTeacher = false;
  roomLabel.textContent = `Room ${roomId}`;
  enterRoomUI();

  const snap = await getDoc(doc(db, "rooms", roomId));
  if (snap.exists() && snap.data().pdfUrl) {
    await loadPDF(snap.data().pdfUrl);
    await loadAnnotationHistory();
  }

  listenRoom();
  listenAnnotations();
};

// ---------- Leave ----------
leaveBtn.onclick = () => {
  if (unsubRoom) unsubRoom();
  if (unsubAnnotations) unsubAnnotations();

  roomId = null;
  pdfDoc = null;
  annotationsLoaded = false;
  viewer.innerHTML = "";

  exitRoomUI();
};

// ---------- Upload PDF ----------
pdfUpload.onchange = async e => {
  if (!isTeacher) return;

  const file = e.target.files[0];
  const pdfRef = ref(storage, `pdfs/${roomId}.pdf`);
  await uploadBytes(pdfRef, file);

  const url = await getDownloadURL(pdfRef);
  await updateDoc(doc(db, "rooms", roomId), { pdfUrl: url });

  await loadPDF(url);
  await loadAnnotationHistory();
  listenRoom();
  listenAnnotations();
};

// ---------- Firestore ----------
function listenRoom() {
  if (unsubRoom) unsubRoom();
  unsubRoom = onSnapshot(doc(db, "rooms", roomId), snap => {
    const d = snap.data();
    if (d?.pdfUrl && !pdfDoc) loadPDF(d.pdfUrl);
  });
}

function listenAnnotations() {
  if (unsubAnnotations) unsubAnnotations();

  unsubAnnotations = onSnapshot(
    collection(db, "rooms", roomId, "annotations"),
    snap => {
      if (!annotationsLoaded) return;

      snap.docChanges().forEach(change => {
        if (
          change.type === "added" &&
          change.doc.data().clientId !== clientId
        ) {
          drawAnnotation(change.doc.data());
        }
      });
    }
  );
}

// ---------- Load PDF ----------
async function loadPDF(url) {
  viewer.innerHTML = "";
  pdfDoc = await pdfjsLib.getDocument(url).promise;

  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const vp = page.getViewport({ scale: 1.4 });

    const pageDiv = document.createElement("div");
    pageDiv.className = "page";

    const base = document.createElement("canvas");
    const overlay = document.createElement("canvas");

    base.width = overlay.width = vp.width;
    base.height = overlay.height = vp.height;
    base.style.width = overlay.style.width = `${vp.width}px`;
    base.style.height = overlay.style.height = `${vp.height}px`;

    overlay.className = "overlay";

    pageDiv.append(base, overlay);
    viewer.appendChild(pageDiv);

    await page.render({ canvasContext: base.getContext("2d"), viewport: vp }).promise;
    setupDrawing(overlay, i);
  }
}

// ---------- Drawing ----------
function setupDrawing(canvas, page) {
  if (!isTeacher) return;

  const ctx = canvas.getContext("2d");
  canvas.style.pointerEvents = "auto";

  let drawing = false;
  let points = [];

  const pos = e => {
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / r.width,
      y: (e.clientY - r.top) / r.height
    };
  };

  canvas.onmousemove = e => {
    if (drawState.tool === "eraser") {
      eraserCursor.style.left = `${e.clientX}px`;
      eraserCursor.style.top = `${e.clientY}px`;
    }
    if (!drawing) return;

    const p = pos(e);
    points.push(p);

    ctx.globalCompositeOperation =
      drawState.tool === "eraser" ? "destination-out" : "source-over";

    ctx.strokeStyle = drawState.color;
    ctx.lineWidth = drawState.tool === "eraser" ? 24 : 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.lineTo(p.x * canvas.width, p.y * canvas.height);
    ctx.stroke();
  };

  canvas.onmousedown = e => {
    drawing = true;
    points = [];
    const p = pos(e);
    points.push(p);
    ctx.beginPath();
    ctx.moveTo(p.x * canvas.width, p.y * canvas.height);
  };

  canvas.onmouseup = async () => {
    drawing = false;
    ctx.globalCompositeOperation = "source-over";

    if (points.length < 2) return;

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

// ---------- Load history ----------
async function loadAnnotationHistory() {
  annotationsLoaded = false;

  const q = query(
    collection(db, "rooms", roomId, "annotations"),
    orderBy("createdAt")
  );

  const snap = await getDocs(q);
  snap.forEach(d => drawAnnotation(d.data()));

  annotationsLoaded = true;
}

// ---------- Draw ----------
function drawAnnotation(a) {
  const pageDiv = viewer.children[a.page - 1];
  if (!pageDiv) return;

  const canvas = pageDiv.querySelector(".overlay");
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
