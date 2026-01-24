/* ================= FIREBASE ================= */
import { initializeApp } from
  "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";

import {
  getFirestore, doc, setDoc, getDoc,
  collection, addDoc, onSnapshot, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import {
  getStorage, ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

/* 🔥 YOUR CONFIG */
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
const colorPicker = document.getElementById("colorPicker");
const profileBtns = document.querySelectorAll(".profile");

/* ================= STATE ================= */
let roomId = null;
let isTeacher = false;
let pdfLoaded = false;

const drawState = {
  tool: "pen",
  color: "#b00b55",
  size: 3,
  profiles: [
    { color:"#b00b55", size:3 },
    { color:"#22c55e", size:4 },
    { color:"#00c2ff", size:6 }
  ],
  activeProfile: 0
};

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

/* ================= PDF ================= */
uploadBtn.onclick = ()=> pdfUpload.click();

pdfUpload.onchange = async e=>{
  const file = e.target.files[0];
  if(!file) return;

  const r = ref(storage,`rooms/${roomId}.pdf`);
  await uploadBytes(r,file);
  const url = await getDownloadURL(r);

  await setDoc(doc(db,"rooms",roomId),{ pdfUrl:url },{merge:true});
};

async function loadPDF(url){
  viewer.innerHTML="";
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

/* ================= TOOLS ================= */
penBtn.onclick = ()=> drawState.tool="pen";
eraserBtn.onclick = ()=> drawState.tool="eraser";

colorPicker.oninput = e=>{
  drawState.color = e.target.value;
  drawState.profiles[drawState.activeProfile].color = e.target.value;
};

profileBtns.forEach(btn=>{
  btn.onclick = ()=>{
    const i = +btn.dataset.p;
    drawState.activeProfile = i;
    drawState.color = drawState.profiles[i].color;
    drawState.size = drawState.profiles[i].size;
    colorPicker.value = drawState.color;
  };
});

/* ================= DRAWING ================= */
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

    const stroke = {
      page,
      x0:last[0], y0:last[1],
      x1:cur[0], y1:cur[1],
      tool: drawState.tool,
      color: drawState.color,
      size: drawState.size
    };

    drawStroke(ctx, stroke);
    saveStroke(stroke);
    last=cur;
  };

  window.onpointerup = ()=> drawing=false;
}

function drawStroke(ctx,s){
  ctx.save();

  if(s.tool==="eraser"){
    ctx.globalCompositeOperation="destination-out";
    ctx.lineWidth=s.size*6;
    ctx.strokeStyle="rgba(0,0,0,1)";
  }else{
    ctx.globalCompositeOperation="source-over";
    ctx.lineWidth=s.size;
    ctx.strokeStyle=s.color;
  }

  ctx.lineCap="round";
  ctx.beginPath();
  ctx.moveTo(s.x0,s.y0);
  ctx.lineTo(s.x1,s.y1);
  ctx.stroke();

  ctx.restore();
}

async function saveStroke(s){
  await addDoc(collection(db,"rooms",roomId,"annotations"),{
    ...s,
    createdAt: serverTimestamp()
  });
}

function drawRemote(s){
  const c = document.querySelectorAll(".overlay")[s.page-1];
  if(!c) return;
  drawStroke(c.getContext("2d"), s);
}

/* ================= BIND ================= */
document.getElementById("createRoom").onclick = createRoom;
document.getElementById("joinRoom").onclick = joinRoom;
