/* ---------------- FIREBASE ---------------- */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js"
import { getDatabase, ref, push, onChildAdded, remove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js"

const firebaseConfig = {
  apiKey: "AIzaSyBUQgksDWqis5CYkivxYnQTHY9GHiSR8SA",
  authDomain: "pdfproject-79cac.firebaseapp.com",
  databaseURL: "https://pdfproject-79cac-default-rtdb.firebaseio.com",
  projectId: "pdfproject-79cac",
  storageBucket: "pdfproject-79cac.firebasestorage.app",
  messagingSenderId: "588286215167",
  appId: "1:588286215167:web:d31467d50048fd6916ddca"
}

const app = initializeApp(firebaseConfig)
const db = getDatabase(app)

/* change this to create separate sessions */
const ROOM = "default-room"

/* ---------------- PDF ---------------- */

const pdfInput = document.getElementById("pdfInput")
const pdfCanvas = document.getElementById("pdfCanvas")
const drawCanvas = document.getElementById("drawCanvas")
const pdfCtx = pdfCanvas.getContext("2d")
const drawCtx = drawCanvas.getContext("2d")
const status = document.getElementById("status")

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"

pdfInput.addEventListener("change", async e => {
  const file = e.target.files[0]
  if (!file) return

  status.textContent = "Loading PDF…"

  const data = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument(data).promise
  const page = await pdf.getPage(1)

  const scale = 1.5
  const viewport = page.getViewport({ scale })

  pdfCanvas.width = viewport.width
  pdfCanvas.height = viewport.height
  drawCanvas.width = viewport.width
  drawCanvas.height = viewport.height

  await page.render({
    canvasContext: pdfCtx,
    viewport
  }).promise

  status.textContent = "PDF loaded"
})

/* ---------------- DRAWING ---------------- */

let drawing = false
let lastX = 0
let lastY = 0

drawCanvas.addEventListener("pointerdown", e => {
  drawing = true
  lastX = e.offsetX
  lastY = e.offsetY
})

drawCanvas.addEventListener("pointerup", () => {
  drawing = false
})

drawCanvas.addEventListener("pointermove", e => {
  if (!drawing) return

  const x = e.offsetX
  const y = e.offsetY

  drawLocal(lastX, lastY, x, y)

  sendStroke(lastX, lastY, x, y)

  lastX = x
  lastY = y
})

function drawLocal(x1, y1, x2, y2) {
  drawCtx.lineWidth = 3
  drawCtx.lineCap = "round"
  drawCtx.strokeStyle = "#ff0055"

  drawCtx.beginPath()
  drawCtx.moveTo(x1, y1)
  drawCtx.lineTo(x2, y2)
  drawCtx.stroke()
}

/* ---------------- FIREBASE SYNC ---------------- */

function sendStroke(x1, y1, x2, y2) {
  push(ref(db, `rooms/${ROOM}/strokes`), {
    x1: x1 / drawCanvas.width,
    y1: y1 / drawCanvas.height,
    x2: x2 / drawCanvas.width,
    y2: y2 / drawCanvas.height,
    color: "#ff0055",
    width: 3,
    t: Date.now()
  })
}

onChildAdded(ref(db, `rooms/${ROOM}/strokes`), snap => {
  const s = snap.val()

  drawCtx.lineWidth = s.width
  drawCtx.lineCap = "round"
  drawCtx.strokeStyle = s.color

  drawCtx.beginPath()
  drawCtx.moveTo(
    s.x1 * drawCanvas.width,
    s.y1 * drawCanvas.height
  )
  drawCtx.lineTo(
    s.x2 * drawCanvas.width,
    s.y2 * drawCanvas.height
  )
  drawCtx.stroke()
})
