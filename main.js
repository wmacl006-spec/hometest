// ---------- DOM ----------
const toolbar = document.getElementById("toolbar");
const colorPaletteEl = document.getElementById("colorPalette");
const colorPicker = document.getElementById("colorPicker");
const penBtn = document.getElementById("penTool");
const eraserBtn = document.getElementById("eraserTool");

const settingsBtn = document.getElementById("settingsBtn");
const settingsModal = document.getElementById("settingsModal");
const settingsList = document.getElementById("settingsList");
const closeSettings = document.getElementById("closeSettings");

// ---------- Draw State ----------
const drawState = { tool: "pen", color: "#b00b55" };

// ---------- Palette ----------
const PALETTE = ["#b00b55", "#ffffff", "#00c2ff", "#22c55e", "#f97316"];

function setActiveColor(c) {
  drawState.color = c;
  colorPicker.value = c;
  renderPalette();
}

function renderPalette() {
  colorPaletteEl.innerHTML = "";
  PALETTE.forEach(c => {
    const d = document.createElement("div");
    d.className = "color-swatch" + (c === drawState.color ? " active" : "");
    d.style.background = c;
    d.onclick = () => setActiveColor(c);
    colorPaletteEl.appendChild(d);
  });
}

colorPicker.oninput = e => {
  PALETTE[0] = e.target.value;
  setActiveColor(e.target.value);
};

// ---------- Tools ----------
penBtn.onclick = () => {
  drawState.tool = "pen";
  penBtn.classList.add("active");
  eraserBtn.classList.remove("active");
};

eraserBtn.onclick = () => {
  drawState.tool = "eraser";
  eraserBtn.classList.add("active");
  penBtn.classList.remove("active");
};

// ---------- KEYBIND SYSTEM ----------
const keybinds = {
  eraser: { key: "e", mode: "hold" },
  color1: { key: "1", mode: "toggle" },
  color2: { key: "2", mode: "toggle" },
  color3: { key: "3", mode: "toggle" },
  color4: { key: "4", mode: "toggle" },
  color5: { key: "5", mode: "toggle" }
};

let heldAction = null;
let previousTool = null;

// ---------- Keyboard Handling ----------
document.addEventListener("keydown", e => {
  if (e.target.tagName === "INPUT") return;

  for (const [action, cfg] of Object.entries(keybinds)) {
    if (e.key.toLowerCase() === cfg.key && !e.repeat) {
      if (cfg.mode === "toggle") runAction(action);
      else if (cfg.mode === "hold") {
        heldAction = action;
        previousTool = drawState.tool;
        runAction(action);
      }
    }
  }
});

document.addEventListener("keyup", e => {
  if (!heldAction) return;
  if (e.key.toLowerCase() === keybinds[heldAction].key) {
    if (heldAction === "eraser") {
      drawState.tool = previousTool;
      penBtn.classList.toggle("active", previousTool === "pen");
      eraserBtn.classList.toggle("active", previousTool === "eraser");
    }
    heldAction = null;
  }
});

function runAction(action) {
  if (action === "eraser") {
    eraserBtn.click();
  } else if (action.startsWith("color")) {
    const idx = Number(action.slice(-1)) - 1;
    setActiveColor(PALETTE[idx]);
  }
}

// ---------- SETTINGS UI ----------
settingsBtn.onclick = () => {
  settingsList.innerHTML = "";

  Object.entries(keybinds).forEach(([action, cfg]) => {
    const row = document.createElement("div");
    row.className = "setting-row";

    const label = document.createElement("label");
    label.textContent = action;

    const keyInput = document.createElement("input");
    keyInput.value = cfg.key;
    keyInput.oninput = e => cfg.key = e.target.value.toLowerCase();

    const modeSelect = document.createElement("select");
    ["toggle", "hold"].forEach(m => {
      const o = document.createElement("option");
      o.value = m;
      o.textContent = m;
      if (cfg.mode === m) o.selected = true;
      modeSelect.appendChild(o);
    });
    modeSelect.onchange = e => cfg.mode = e.target.value;

    row.append(label, keyInput, modeSelect);
    settingsList.appendChild(row);
  });

  settingsModal.style.display = "flex";
};

closeSettings.onclick = () => {
  settingsModal.style.display = "none";
};

// ---------- INIT ----------
toolbar.style.display = "flex";
renderPalette();
