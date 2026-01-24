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
  roomId = Math.random().toStri
