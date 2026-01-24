/* ---------- Firebase ---------- */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore, doc, setDoc, getDoc,
  collection, addDoc, getDocs, onSnapshot,
  query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  getStorage, ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

/* 🔴 PUT YOUR CONFIG HERE */
const firebaseConfig = {/* your config */};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

/* ---------- PDF.js ---------- */
import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs";
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs";

/* ---------- DOM ---------- */
const viewer = document.getElementById("viewer");
const toolbar = document.getElementById("toolbar");
const paletteEl = document.getElementById("palette");
const colorPicker = document.getElementById("colorPicker");
const penBtn = document.getElementById("pen");
const eraserBtn = document.getElementById("eraser");
const uploadBtn = document.getElementById("uploadBtn");
const pdfUpload = document.getElementById("pdfUpload");
const roomLabel = document.getElementById("roomLabel");
const lobby = document.getElementById("lobby");

const settingsBtn = document.getElementById("settingsBtn");
const settingsModal = document.getElementById("settingsModal");
const settingsList = document.getElementById("settingsList");
const closeSettings = document.getElementById("closeSettings");

/* ---------- State ---------- */
let roomId = null;
let isTeacher = false;
let pdfDoc = null;

const drawState = { tool:"pen", color:"#b00b55" };
const palette = ["#b00b55","#ffffff","#00c2ff","#22c55e","#f97316"];

/* ---------- Palette ---------- */
function renderPalette(){
  paletteEl.innerHTML="";
  palette.forEach(c=>{
    const d=document.createElement("div");
    d.className="color-swatch"+(c===drawState.color?" active":"");
    d.style.background=c;
    d.onclick=()=>setColor(c);
    paletteEl.appendChild(d);
  });
}
function setColor(c){
  drawState.color=c;
  colorPicker.value=c;
  renderPalette();
}
colorPicker.oninput=e=>setColor(e.target.value);

/* ---------- Tools ---------- */
penBtn.onclick=()=>{
  drawState.tool="pen";
  penBtn.classList.add("active");
  eraserBtn.classList.remove("active");
};
eraserBtn.onclick=()=>{
  drawState.tool="eraser";
  eraserBtn.classList.add("active");
  penBtn.classList.remove("active");
};

/* ---------- Rooms ---------- */
async function ensureRoom(id){
  const ref=doc(db,"rooms",id);
  const snap=await getDoc(ref);
  if(!snap.exists()){
    await setDoc(ref,{createdAt:serverTimestamp(),pdfUrl:null});
  }
}

async function createRoom(){
  roomId=Math.random().toString(36).slice(2,8);
  isTeacher=true;
  await ensureRoom(roomId);
  enterRoom();
}

async function joinRoom(){
  roomId=document.getElementById("roomInput").value.trim();
  if(!roomId)return;
  await ensureRoom(roomId);
  enterRoom();
}

function enterRoom(){
  lobby.classList.add("hidden");
  roomLabel.textContent="Room: "+roomId;
  roomLabel.classList.remove("hidden");
  toolbar.style.display="flex";
  renderPalette();
  if(isTeacher)uploadBtn.classList.remove("hidden");
  listenRoom();
  listenAnnotations();
}

/* ---------- PDF ---------- */
async function loadPDF(url){
  viewer.innerHTML="";
  pdfDoc=await pdfjsLib.getDocument(url).promise;
  for(let i=1;i<=pdfDoc.numPages;i++){
    const page=await pdfDoc.getPage(i);
    const vp=page.getViewport({scale:1.5});
    const base=document.createElement("canvas");
    base.width=vp.width;base.height=vp.height;
    await page.render({canvasContext:base.getContext("2d"),viewport:vp}).promise;

    const overlay=document.createElement("canvas");
    overlay.width=base.width;overlay.height=base.height;
    overlay.className="overlay";

    const wrap=document.createElement("div");
    wrap.className="page";
    wrap.append(base,overlay);
    viewer.appendChild(wrap);

    enableDraw(overlay,i);
  }
}

uploadBtn.onclick=()=>pdfUpload.click();
pdfUpload.onchange=async e=>{
  const file=e.target.files[0];
  const r=ref(storage,`rooms/${roomId}.pdf`);
  await uploadBytes(r,file);
  const url=await getDownloadURL(r);
  await setDoc(doc(db,"rooms",roomId),{pdfUrl:url},{merge:true});
};

/* ---------- Firestore Listeners ---------- */
function listenRoom(){
  onSnapshot(doc(db,"rooms",roomId),snap=>{
    if(snap.exists()&&snap.data().pdfUrl&&!pdfDoc){
      loadPDF(snap.data().pdfUrl);
    }
  });
}

async function listenAnnotations(){
  const q=query(collection(db,"rooms",roomId,"annotations"),orderBy("createdAt"));
  const snap=await getDocs(q);
  snap.forEach(d=>drawRemote(d.data()));
  onSnapshot(q,s=>{
    s.docChanges().forEach(c=>{
      if(c.type==="added")drawRemote(c.doc.data());
    });
  });
}

/* ---------- Drawing ---------- */
function enableDraw(canvas,page){
  const ctx=canvas.getContext("2d");
  let drawing=false,last=null;

  canvas.onpointerdown=e=>{
    if(!isTeacher)return;
    drawing=true;
    last=[e.offsetX,e.offsetY];
  };

  canvas.onpointermove=e=>{
    if(!drawing)return;
    const cur=[e.offsetX,e.offsetY];
    drawLine(ctx,last,cur,drawState);
    saveAnnotation(page,last,cur,drawState);
    last=cur;
  };

  window.onpointerup=()=>drawing=false;
}

function drawLine(ctx,a,b,s){
  ctx.strokeStyle=s.tool==="eraser"?"#0000":s.color;
  ctx.globalCompositeOperation=s.tool==="eraser"?"destination-out":"source-over";
  ctx.lineWidth=s.tool==="eraser"?20:3;
  ctx.beginPath();
  ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke();
}

async function saveAnnotation(page,a,b,s){
  await addDoc(collection(db,"rooms",roomId,"annotations"),{
    page,x0:a[0],y0:a[1],x1:b[0],y1:b[1],
    tool:s.tool,color:s.color,createdAt:serverTimestamp()
  });
}

function drawRemote(d){
  const c=document.querySelectorAll(".overlay")[d.page-1];
  if(!c)return;
  drawLine(c.getContext("2d"),[d.x0,d.y0],[d.x1,d.y1],d);
}

/* ---------- Settings (simple, safe) ---------- */
settingsBtn.onclick=()=>{
  settingsList.innerHTML="<p>Keybind system ready for extension.</p>";
  settingsModal.style.display="flex";
};
closeSettings.onclick=()=>settingsModal.style.display="none";

/* ---------- Bind ---------- */
document.getElementById("createRoom").onclick=createRoom;
document.getElementById("joinRoom").onclick=joinRoom;
