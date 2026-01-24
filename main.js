// ---------- PDF.js ----------
import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs";

// ---------- Firebase ----------
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  onSnapshot,
  collection,
  addDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL
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

const viewer = document.getElementById("viewer");
const pdfUpload = document.getElementById("pdfUpload");
const roomLabel = document.getElementById("roomLabel");

let pdfDoc = null;
let roomId = null;
let isTeacher = false;

// unsubscribe handles
let unsubRoom = null;
let unsubAnnotations = null;

// ---------- Create Room ----------
document.getElementById("createRoom").onclick = async () => {
  roomId = crypto.randomUUID().slice(0, 6);
  isTeacher = true;

  await setDoc(doc(db, "rooms", roomId), {
    createdAt: Date.now()
  });

  roomLabel.textContent = `Room: ${roomId}`;
  pdfUpload.style.display = "inline-block";
};

// ---------- Join Room ----------
document.getElementById("joinRoom").onclick = async () => {
  roomId = document.getElementById("roomInput").value.trim();
  if (!roomId) return;

  isTeacher = false;
  pdfUpload.style.display = "none";
  roomLabel.textContent = `Room: ${roomId}`;

  const roomRef = doc(db, "rooms", roomId);
  const snap = await getDoc(roomRef);

  if (snap.exists() && snap.data().pdfUrl) {
    await loadPDF(snap.data().pdfUrl);
  }

  listenRoom(roomRef);
  listenAnnotations();
};

// ---------- Leave ----------
document.getElementById("leaveRoom").onclick = () => {
  if (unsubRoom) unsubRoom();
  if (unsubAnnotations) unsubAnnotations();

  unsubRoom = null;
  unsubAnnotations = null;

  roomId = null;
  pdfDoc = null;
  viewer.innerHTML = "";

  roomLabel.textContent = "";
  pdfUpload.style.display = "none";
};

// ---------- Upload PDF (teacher) ----------
pdfUpload.onchange = async (e) => {
  const file = e.target.files[0];
  if (!file || !roomId) return;

  const storageRef = ref(storage, `pdfs/${roomId}.pdf`);
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);

  await updateDoc(doc(db, "rooms", roomId), {
    pdfUrl: url
  });

  await loadPDF(url);
  listenRoom(doc(db, "rooms", roomId));
  listenAnnotations();
};

// ---------- Room Listener (PDF only, NO scroll syncing) ----------
function listenRoom(roomRef) {
  if (unsubRoom) unsubRoom();

  unsubRoom = onSnapshot(roomRef, (snap) => {
    const data = snap.data();
    if (!data || !data.pdfUrl || pdfDoc) return;
    loadPDF(data.pdfUrl);
  });
}

// ---------- Load PDF ----------
async function loadPDF(url) {
  const prevScroll = viewer.scrollTop;

  viewer.innerHTML = "";
  pdfDoc = null;

  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  pdfDoc = await pdfjsLib.getDocument({ data: buffer }).promise;

  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const viewport = page.getViewport({ scale: 1.4 });

    const pageDiv = document.createElement("div");
    pageDiv.className = "page";
    pageDiv.style.width = viewport.width + "px";
    pageDiv.style.height = viewport.height + "px";

    const pdfCanvas = document.createElement("canvas");
    pdfCanvas.width = viewport.width;
    pdfCanvas.height = viewport.height;

    const overlay = document.createElement("canvas");
    overlay.width = viewport.width;
    overlay.height = viewport.height;
    overlay.className = "overlay";

    pageDiv.appendChild(pdfCanvas);
    pageDiv.appendChild(overlay);
    viewer.appendChild(pageDiv);

    await page.render({
      canvasContext: pdfCanvas.getContext("2d"),
      viewport
    }).promise;

    setupDrawing(overlay, i);
  }

  viewer.scrollTop = prevScroll;
}

// ---------- Drawing (teacher only) ----------
function setupDrawing(canvas, pageNumber) {
  if (!isTeacher) return;

  canvas.style.pointerEvents = "auto";
  const ctx = canvas.getContext("2d");

  let drawing = false;
  let points = [];

  canvas.onmousedown = () => {
    drawing = true;
    points = [];
    ctx.beginPath();
  };

  canvas.onmousemove = (e) => {
    if (!drawing) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / canvas.width;
    const y = (e.clientY - rect.top) / canvas.height;

    points.push({ x, y });
    ctx.strokeStyle = "red";
    ctx.lineWidth = 2;
    ctx.lineTo(x * canvas.width, y * canvas.height);
    ctx.stroke();
  };

  canvas.onmouseup = async () => {
    drawing = false;
    ctx.beginPath();

    await addDoc(collection(db, "rooms", roomId, "annotations"), {
      page: pageNumber,
      points,
      color: "red"
    });
  };
}

// ---------- Annotation Sync ----------
function listenAnnotations() {
  if (unsubAnnotations) unsubAnnotations();

  unsubAnnotations = onSnapshot(
    collection(db, "rooms", roomId, "annotations"),
    (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type === "added") {
          drawAnnotation(change.doc.data());
        }
      });
    }
  );
}

function drawAnnotation(a) {
  const pageDiv = viewer.children[a.page - 1];
  if (!pageDiv) return;

  const overlay = pageDiv.querySelector(".overlay");
  const ctx = overlay.getContext("2d");

  ctx.beginPath();
  ctx.strokeStyle = a.color;
  ctx.lineWidth = 2;

  a.points.forEach((p, i) => {
    const x = p.x * overlay.width;
    const y = p.y * overlay.height;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  ctx.stroke();
}

// ---------- Download Annotated PDF ----------
document.getElementById("downloadPdf").onclick = () => {
  if (!pdfDoc) {
    alert("No PDF loaded");
    return;
  }

  const jsPDFLib = window.jspdf?.jsPDF;
  if (!jsPDFLib) {
    alert("jsPDF failed to load");
    return;
  }

  const pdf = new jsPDFLib();

  [...viewer.children].forEach((pageDiv, i) => {
    const canvases = pageDiv.querySelectorAll("canvas");
    const base = canvases[0];
    const overlay = canvases[1];

    const temp = document.createElement("canvas");
    temp.width = base.width;
    temp.height = base.height;

    const ctx = temp.getContext("2d");
    ctx.drawImage(base, 0, 0);
    ctx.drawImage(overlay, 0, 0);

    const img = temp.toDataURL("image/jpeg", 1.0);

    if (i > 0) pdf.addPage();
    pdf.addImage(
      img,
      "JPEG",
      0,
      0,
      pdf.internal.pageSize.getWidth(),
      pdf.internal.pageSize.getHeight()
    );
  });

  pdf.save("annotated.pdf");
};
