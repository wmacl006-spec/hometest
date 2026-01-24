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

// ---------- State ----------
let roomId = null;
let isTeacher = false;
let pdfDoc = null;
let unsubRoom = null;
let unsubAnnotations = null;

// ---------- UI helpers ----------
function enterRoomUI() {
  lobbyUI.classList.add("hidden");
  roomLabel.classList.remove("hidden");
  leaveBtn.classList.remove("hidden");
}

function exitRoomUI() {
  lobbyUI.classList.remove("hidden");
  roomLabel.classList.add("hidden");
  leaveBtn.classList.add("hidden");
  uploadBtn.classList.add("hidden");
  toolbar.style.display = "none";
}

// ---------- Upload ----------
uploadBtn.onclick = () => pdfUpload.click();

// ---------- Create Room ----------
document.getElementById("createRoom").onclick = async () => {
  roomId = crypto.randomUUID().slice(0, 6);
  isTeacher = true;

  await setDoc(doc(db, "rooms", roomId), { createdAt: Date.now() });

  roomLabel.textContent = `Room ${roomId}`;
  enterRoomUI();

  uploadBtn.classList.remove("hidden");
  toolbar.style.display = "flex";
};

// ---------- Join Room ----------
document.getElementById("joinRoom").onclick = async () => {
  roomId = document.getElementById("roomInput").value.trim();
  if (!roomId) return;

  isTeacher = false;
  roomLabel.textContent = `Room ${roomId}`;
  enterRoomUI();

  const snap = await getDoc(doc(db, "rooms", roomId));
  if (snap.exists() && snap.data().pdfUrl) {
    await loadPDF(snap.data().pdfUrl);
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
  if (!isTeacher || !roomId) return;

  const file = e.target.files[0];
  const storageRef = ref(storage, `pdfs/${roomId}.pdf`);
  await uploadBytes(storageRef, file);

  const url = await getDownloadURL(storageRef);
  await updateDoc(doc(db, "rooms", roomId), { pdfUrl: url });

  await loadPDF(url);
  listenRoom();
  listenAnnotations();
};

// ---------- Firestore listeners ----------
function listenRoom() {
  if (unsubRoom) unsubRoom();
  unsubRoom = onSnapshot(doc(db, "rooms", roomId), snap => {
    const d = snap.data();
    if (!d?.pdfUrl || pdfDoc) return;
    loadPDF(d.pdfUrl);
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

// ---------- PDF ----------
async function loadPDF(url) {
  viewer.innerHTML = "";
  const buffer = await (await fetch(url)).arrayBuffer();
  pdfDoc = await pdfjsLib.getDocument({ data: buffer }).promise;

  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const vp = page.getViewport({ scale: 1.4 });

    const pageDiv = document.createElement("div");
    pageDiv.className = "page";

    const base = document.createElement("canvas");
    const overlay = document.createElement("canvas");
    base.width = overlay.width = vp.width;
    base.height = overlay.height = vp.height;
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
  canvas.style.pointerEvents = "auto";

  const ctx = canvas.getContext("2d");
  let drawing = false, pts = [];

  canvas.onmousedown = () => { drawing = true; pts = []; ctx.beginPath(); };
  canvas.onmousemove = e => {
    if (!drawing) return;
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) / canvas.width;
    const y = (e.clientY - r.top) / canvas.height;
    pts.push({ x, y });
    ctx.strokeStyle = "#b00b55";
    ctx.lineWidth = 2;
    ctx.lineTo(x * canvas.width, y * canvas.height);
    ctx.stroke();
  };
  canvas.onmouseup = async () => {
    drawing = false;
    await addDoc(collection(db, "rooms", roomId, "annotations"),
      { page, points: pts, color: "#b00b55" });
  };
}

function drawAnnotation(a) {
  const pageDiv = viewer.children[a.page - 1];
  if (!pageDiv) return;
  const c = pageDiv.querySelector(".overlay").getContext("2d");
  c.strokeStyle = a.color;
  c.lineWidth = 2;
  c.beginPath();
  a.points.forEach((p, i) =>
    i ? c.lineTo(p.x * pageDiv.offsetWidth, p.y * pageDiv.offsetHeight)
      : c.moveTo(p.x * pageDiv.offsetWidth, p.y * pageDiv.offsetHeight)
  );
  c.stroke();
}

// ---------- Download ----------
document.getElementById("downloadPdf").onclick = () => {
  if (!pdfDoc) return;
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();

  [...viewer.children].forEach((p, i) => {
    const [b, o] = p.querySelectorAll("canvas");
    const t = document.createElement("canvas");
    t.width = b.width; t.height = b.height;
    t.getContext("2d").drawImage(b, 0, 0);
    t.getContext("2d").drawImage(o, 0, 0);
    if (i) pdf.addPage();
    pdf.addImage(t.toDataURL("image/jpeg", 1), "JPEG", 0, 0,
      pdf.internal.pageSize.getWidth(),
      pdf.internal.pageSize.getHeight());
  });

  pdf.save("annotated.pdf");
};
