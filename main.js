/* ================= FIREBASE (CDN ONLY) ================= */
import { initializeApp } from
  "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";

import {
  getFirestore, doc, setDoc, getDoc,
  collection, addDoc, onSnapshot, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import {
  getStorage, ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

/* 🔥 YOUR REAL CONFIG (CORRECTED) */
const firebaseConfig = {
  apiKey: "AIzaSyDAScHIxTwrXQEVCnEYxizNPSRKiuYsqqA",
  authDomain: "teampdf-7ec12.firebaseapp.com",
  databaseURL: "https://teampdf-7ec12-default-rtdb.firebaseio.com",
  projectId: "teampdf-7ec12",
  storageBucket: "teampdf-7ec12.firebasestorage.app",
  messagingSenderId: "307072046237",
  appId: "1:307072046237:web:d1f44f115fdf199b5a7074"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

/* ================= PDF.JS ================= */
import * as pdfjsLib from
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs";

/* ================= DOM ================= */
const viewer = document.getElementById("viewer");
const lobby = document.getElementById("lobby");
const roomLabel = document.getElementById("roomLabel");
const uploadBtn = document.getElementById("uploadBtn");
const pdfUpload = document.getElementById("pdfUpload");
const toolbar = document.getElementById("toolbar");

const penBtn = document.getElementById("pen");
const eraserBtn = document.getElementById("eraser");

/* ================= STATE ================= */
let roomId = null;
let isTeacher = false;
let pdfLoaded = false;
let tool = "pen";

/* ================= ROOMS ================= */
async function createRoom(){
  roomId = Math.random().toString(36).slice(2,8);
  isTeacher = true;

  await setDoc(doc(db,"rooms",roomId),{
    createdAt: serverTimestamp(),
    pdfUrl: null
  });

  enterRoom();
}

async function joinRoom(){
  roomId = document.getElementById("roomInput").value.trim();
  if(!roomId) return;

  const snap = await getDoc(doc(db,"rooms",roomId));
  if(!snap.exists()){
    alert("Room does not exist");
    return;
  }

  enterRoom();
}

function enterRoom(){
  lobby.classList.add("hidden");
  roomLabel.textContent = "Room: " + roomId;
  roomLabel.classList.remove("hidden");
  toolbar.style.display = "flex";

  if(isTeacher) uploadBtn.classList.remove("hidden");

  listenRoom();
  listenAnnotations();
}

/* ================= PDF UPLOAD ================= */
uploadBtn.onclick = ()=> pdfUpload.click();

pdfUpload.onchange = async e=>{
  const file = e.target.files[0];
  if(!file) return;

  const r = ref(storage,`rooms/${roomId}.pdf`);
  await uploadBytes(r,file);
  const url = await getDownloadURL(r);

  await setDoc(doc(db,"rooms",roomId),{
    pdfUrl: url
  },{merge:true});
};

async function loadPDF(url){
  viewer.innerHTML = "";
  const pdf = await pdfjsLib.getDocument(url).promise;

  for(let i=1;i<=pdf.numPages;i++){
    const page = await pdf.getPage(i);
    const vp = page.getViewport({scale:1.5});

    const base = document.createElement("canvas");
    base.width = vp.width;
    base.height = vp.height;
    await page.render({canvasContext:base.getContext("2d"),viewport:vp}).promise;

    const overlay = document.createElement("canvas");
    overlay.width = base.width;
    overlay.height = base.height;
    overlay.className = "overlay";

    const wrap = document.createElement("div");
    wrap.className = "page";
    wrap.append(base,overlay);
    viewer.appendChild(wrap);

    enableDraw(overlay,i);
  }

  pdfLoaded = true;
}

/* ================= LISTENERS ================= */
function listenRoom(){
  onSnapshot(doc(db,"rooms",roomId),snap=>{
    const d = snap.data();
    if(d?.pdfUrl && !pdfLoaded){
      loadPDF(d.pdfUrl);
    }
  });
}

function listenAnnotations(){
  const q = query(
    collection(db,"rooms",roomId,"annotations"),
    orderBy("createdAt")
  );

  onSnapshot(q,snap=>{
    snap.docChanges().forEach(c=>{
      if(c.type==="added") drawRemote(c.doc.data());
    });
  });
}

/* ================= DRAWING ================= */
penBtn.onclick = ()=> tool="pen";
eraserBtn.onclick = ()=> tool="eraser";

function enableDraw(canvas,page){
  const ctx = canvas.getContext("2d");
  let drawing=false,last=null;

  canvas.onpointerdown = e=>{
    if(!isTeacher) return;
    drawing=true;
    last=[e.offsetX,e.offsetY];
  };

  canvas.onpointermove = e=>{
    if(!drawing) return;
    const cur=[e.offsetX,e.offsetY];
    drawLine(ctx,last,cur,tool);
    saveAnnotation(page,last,cur,tool);
    last=cur;
  };

  window.onpointerup = ()=> drawing=false;
}

function drawLine(ctx,a,b,tool){
  ctx.globalCompositeOperation =
    tool==="eraser"?"destination-out":"source-over";
  ctx.strokeStyle="#b00b55";
  ctx.lineWidth = tool==="eraser"?20:3;
  ctx.beginPath();
  ctx.moveTo(...a);
  ctx.lineTo(...b);
  ctx.stroke();
}

async function saveAnnotation(page,a,b,tool){
  await addDoc(collection(db,"rooms",roomId,"annotations"),{
    page,
    x0:a[0], y0:a[1],
    x1:b[0], y1:b[1],
    tool,
    createdAt: serverTimestamp()
  });
}

function drawRemote(d){
  const c = document.querySelectorAll(".overlay")[d.page-1];
  if(!c) return;
  drawLine(c.getContext("2d"),[d.x0,d.y0],[d.x1,d.y1],d.tool);
}

/* ================= BIND ================= */
document.getElementById("createRoom").onclick = createRoom;
document.getElementById("joinRoom").onclick = joinRoom;
