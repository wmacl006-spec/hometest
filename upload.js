import { auth, db, storage } from "./firebase.js";
import { signInAnonymously } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const input = document.getElementById("pdfInput");
const button = document.getElementById("uploadBtn");
const status = document.getElementById("status");

await signInAnonymously(auth);

button.onclick = async () => {
  if (!input.files[0]) return alert("Choose a PDF");

  const roomId = Math.random().toString(36).slice(2, 8);
  const file = input.files[0];

  status.textContent = "Uploading...";

  const pdfRef = ref(storage, `rooms/${roomId}/document.pdf`);
  await uploadBytes(pdfRef, file);

  const pdfUrl = await getDownloadURL(pdfRef);

  await setDoc(doc(db, "rooms", roomId), {
    pdfUrl,
    ownerUid: auth.currentUser.uid,
    createdAt: Date.now()
  });

  window.location.href = `room.html?room=${roomId}`;
};
