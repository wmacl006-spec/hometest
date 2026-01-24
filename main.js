// ---------- PDF.js ----------
import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs";
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs";

// ---------- Firebase ----------
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore, doc, setDoc, getDoc, updateDoc,
  onSnapshot, collection, addDoc
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

// ---------- State ----------
let roomId = null;
let isTeacher = false;
let pdfDoc = null;
let unsubRoom = null;
let unsubAnnotations = null;

let tool = "pen";
let color = "#b00b55";

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
  tool = "pen";
  penBtn.classList.add("active");
  eraserBtn.classList.remove("active");
};

eraserBtn.onclick = () => {
  tool = "eraser";
  eraserBtn.classList.add("active");
  penBtn.classList.remove("active");
};

colorPicker.oninput = e => color = e.target.value;

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
    loadPDF(snap.data().pdfUrl);
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
  viewer.innerHTML = "";

  exitRoomUI();
};

// ---------- Upload PDF ----------
pdfUpload.onchange = async (e) => {
  if (!isTeacher) return;

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
    snap => snap.docChanges().forEach(c => {
      if (c.type === "added") drawAnnotation(c.doc.data());
    })
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

  canvas.onmousedown = e => {
    drawing = true;
    points = [];
    const p = pos(e);
    points.push(p);

    ctx.beginPath();
    ctx.moveTo(p.x * canvas.width, p.y * canvas.height);
  };

  canvas.onmousemove = e => {
    if (!drawing) return;
    const p = pos(e);
    points.push(p);

    ctx.globalCompositeOperation =
      tool === "eraser" ? "destination-out" : "source-over";

    ctx.strokeStyle = color;
    ctx.lineWidth = tool === "eraser" ? 24 : 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.lineTo(p.x * canvas.width, p.y * canvas.height);
    ctx.stroke();
  };

  canvas.onmouseup = async () => {
    drawing = false;
    ctx.globalCompositeOperation = "source-over";

    await addDoc(collection(db, "rooms", roomId, "annotations"), {
      page,
      points,
      color,
      tool
    });
  };
}

// ---------- Draw remote ----------
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

// ---------- Download ----------
document.getElementById("downloadPdf").onclick = () => {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();

  [...viewer.children].forEach((p, i) => {
    const [b, o] = p.querySelectorAll("canvas");
    const t = document.createElement("canvas");
    t.width = b.width;
    t.height = b.height;
    const c = t.getContext("2d");
    c.drawImage(b, 0, 0);
    c.drawImage(o, 0, 0);
    if (i) pdf.addPage();
    pdf.addImage(
      t.toDataURL("image/jpeg", 1),
      "JPEG",
      0,
      0,
      pdf.internal.pageSize.getWidth(),
      pdf.internal.pageSize.getHeight()
    );
  });

  pdf.save("annotated.pdf");
};
