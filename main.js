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
let isRemoteScroll = false;

// ---------- Create Room ----------
document.getElementById("createRoom").onclick = async () => {
  roomId = crypto.randomUUID().slice(0, 6);
  isTeacher = true;

  await setDoc(doc(db, "rooms", roomId), {
    scrollTop: 0,
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

// ---------- Upload PDF (Teacher only) ----------
pdfUpload.onchange = async (e) => {
  const file = e.target.files[0];
  if (!file || !roomId) return;

  const storageRef = ref(storage, `pdfs/${roomId}.pdf`);
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);

  const roomRef = doc(db, "rooms", roomId);
  await updateDoc(roomRef, { pdfUrl: url });

  await loadPDF(url);
  listenRoom(roomRef);
  listenAnnotations();
};

// ---------- Room Sync ----------
function listenRoom(roomRef) {
  onSnapshot(roomRef, (snap) => {
    const data = snap.data();
    if (!data) return;

    if (!pdfDoc && data.pdfUrl) {
      loadPDF(data.pdfUrl);
    }

    if (!isTeacher && !isRemoteScroll) {
      isRemoteScroll = true;
      viewer.scrollTop = data.scrollTop || 0;
      setTimeout(() => (isRemoteScroll = false), 50);
    }
  });
}

// ---------- Scroll broadcast ----------
viewer.addEventListener("scroll", async () => {
  if (!isTeacher || isRemoteScroll || !roomId) return;

  await updateDoc(doc(db, "rooms", roomId), {
    scrollTop: viewer.scrollTop
  });
});

// ---------- Render PDF ----------
async function loadPDF(url) {
  viewer.innerHTML = "";
  pdfDoc = await pdfjsLib.getDocument(url).promise;

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
}

// ---------- Drawing (Teacher only) ----------
function setupDrawing(canvas, pageNumber) {
  if (!isTeacher) return;

  canvas.style.pointerEvents = "auto";
  const ctx = canvas.getContext("2d");
  let drawing = false;
  let points = [];

  canvas.onmousedown = (e) => {
    drawing = true;
    points = [];
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
  const colRef = collection(db, "rooms", roomId, "annotations");

  onSnapshot(colRef, (snap) => {
    snap.docChanges().forEach((change) => {
      if (change.type === "added") {
        drawAnnotation(change.doc.data());
      }
    });
  });
}

function drawAnnotation(a) {
  const pageDiv = viewer.children[a.page - 1];
  if (!pageDiv) return;

  const canvas = pageDiv.querySelector(".overlay");
  const ctx = canvas.getContext("2d");

  ctx.strokeStyle = a.color;
  ctx.lineWidth = 2;
  ctx.beginPath();

  a.points.forEach((p, i) => {
    const x = p.x * canvas.width;
    const y = p.y * canvas.height;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  ctx.stroke();
}
