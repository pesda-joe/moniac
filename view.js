// ============================================================
// Tank and flow tables (system view)
// ============================================================

const tankCells = {};
for (const [id, tank] of Object.entries(tanks)) {
  const row = document.getElementById("tanks-table").insertRow();
  const labelCell = row.insertCell();
  labelCell.textContent = tank.name;
  labelCell.className = "label";
  tankCells[id] = row.insertCell();
  tankCells[id].className = "num";
}

const flowCells = {};
for (const [id, flow] of Object.entries(flows)) {
  const row = document.getElementById("flows-table").insertRow();
  const labelCell = row.insertCell();
  labelCell.textContent = flow.name;
  labelCell.className = "label";
  flowCells[id] = row.insertCell();
  flowCells[id].className = "num";
}

const conservationEl = document.getElementById("conservation");
const initialTotal = Object.values(tanks).reduce((s, t) => s + t.level, 0);


// ============================================================
// Inspector panel
// ------------------------------------------------------------
// mountInspector(container, flow) builds the top-level panel for
// a single flow. For cam-mode flows it delegates to mountCam,
// one editor per entry in flow.valve.cams.
// ============================================================

function mountCam(container, cam, camName) {
  // Per-cam memory of params when the user switches cam types.
  cam.savedParams ??= { [cam.type]: { ...cam.params } };

  // --- Cam name header ----------------------------------------------------
  const camHeader = document.createElement("div");
  camHeader.className = "cam-header";
  camHeader.textContent = camName;
  container.appendChild(camHeader);

  // --- Cam type dropdown --------------------------------------------------
  const camTypeRow = document.createElement("div");
  camTypeRow.className = "cam-type-row";
  const camTypeLabel = document.createElement("label");
  camTypeLabel.textContent = "Cam shape:";
  const camTypeSelect = document.createElement("select");
  for (const camId of Object.keys(camsLibrary)) {
    const opt = document.createElement("option");
    opt.value = camId;
    opt.textContent = camsLibrary[camId].name;
    if (camId === cam.type) opt.selected = true;
    camTypeSelect.appendChild(opt);
  }
  camTypeRow.appendChild(camTypeLabel);
  camTypeRow.appendChild(camTypeSelect);
  container.appendChild(camTypeRow);

  camTypeSelect.addEventListener("change", () => {
    const oldType = cam.type;
    cam.savedParams[oldType] = { ...cam.params };

    const newType = camTypeSelect.value;
    cam.type = newType;
    cam.params = cam.savedParams[newType]
      ? { ...cam.savedParams[newType] }
      : Object.fromEntries(
          Object.entries(camsLibrary[newType].spec).map(([k, s]) => [k, s.default])
        );
    buildSliders();
  });

  // --- Param sliders (rebuilt whenever cam type changes) ------------------
  const slidersContainer = document.createElement("div");
  container.appendChild(slidersContainer);

  function buildSliders() {
    slidersContainer.innerHTML = "";
    for (const [paramName, currentValue] of Object.entries(cam.params)) {
      const spec = camsLibrary[cam.type].spec[paramName];

      const row = document.createElement("div");
      row.className = "param-row";

      const label = document.createElement("label");
      label.textContent = paramName;

      const slider = document.createElement("input");
      slider.type = "range";
      slider.min  = spec.min;
      slider.max  = spec.max;
      slider.step = (spec.max - spec.min) / 200;
      slider.value = currentValue;

      const display = document.createElement("span");
      display.className = "value";
      display.textContent = (+currentValue).toFixed(2);

      slider.addEventListener("input", (e) => {
        const v = parseFloat(e.target.value);
        cam.params[paramName] = v;
        display.textContent = v.toFixed(2);
      });

      row.appendChild(label);
      row.appendChild(slider);
      row.appendChild(display);
      slidersContainer.appendChild(row);
    }
  }
  buildSliders();

  // --- Curve preview canvas -----------------------------------------------
  const canvas = document.createElement("canvas");
  canvas.className = "curve";
  canvas.width = 320;
  canvas.height = 160;
  container.appendChild(canvas);

  const ctx = canvas.getContext("2d");

  const margin = { top: 2, right: 2, bottom: 22, left: 36 };
  const plotW = canvas.width  - margin.left - margin.right;
  const plotH = canvas.height - margin.top  - margin.bottom;

  // Hardcoded for now. Tank levels live around 0..200, cams output 0..1.
  const xRange = [0, 200];
  const yRange = [0, 1];

  function pixelx(x) {
    return margin.left + (x - xRange[0]) / (xRange[1] - xRange[0]) * plotW;
  }
  function pixely(y) {
    return margin.top + plotH - (y - yRange[0]) / (yRange[1] - yRange[0]) * plotH;
  }

  function drawCurve() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.beginPath();
    const N = 100;
    for (let i = 0; i <= N; i++) {
      const x = xRange[0] + (xRange[1] - xRange[0]) * i / N;
      const y = camsLibrary[cam.type].curve(x, cam.params);
      if (i === 0) ctx.moveTo(pixelx(x), pixely(y));
      else         ctx.lineTo(pixelx(x), pixely(y));
    }
    ctx.strokeStyle = "#000";
    ctx.stroke();

    if (cam.lastInput !== undefined && cam.value !== undefined) {
      ctx.beginPath();
      ctx.arc(pixelx(cam.lastInput), pixely(cam.value), 4, 0, 2 * Math.PI);
      ctx.fillStyle = "tomato";
      ctx.fill();
    }
  }

  return function updateCam() {
    drawCurve();
  };
}


// One-slider mode panels (rate, fraction). Built once and toggled by display
// so the user's last position is preserved when they switch modes back.

function mountRatePanel(container, flow) {
  const panel = document.createElement("div");
  panel.className = "mode-panel rate-panel";

  const row = document.createElement("div");
  row.className = "param-row";

  const label = document.createElement("label");
  label.textContent = "rate (£/sec)";

  const slider = document.createElement("input");
  slider.type  = "range";
  slider.min   = 0;
  slider.max   = 200;
  slider.step  = 0.5;
  slider.value = flow.valve.rate;

  const display = document.createElement("span");
  display.className = "value";
  display.textContent = (+flow.valve.rate).toFixed(2);

  slider.addEventListener("input", (e) => {
    const v = parseFloat(e.target.value);
    flow.valve.rate = v;
    display.textContent = v.toFixed(2);
  });

  row.appendChild(label);
  row.appendChild(slider);
  row.appendChild(display);
  panel.appendChild(row);
  container.appendChild(panel);
  return panel;
}

function mountFractionPanel(container, flow) {
  const panel = document.createElement("div");
  panel.className = "mode-panel fraction-panel";

  const row = document.createElement("div");
  row.className = "param-row";

  const label = document.createElement("label");
  label.textContent = "fraction";

  const slider = document.createElement("input");
  slider.type  = "range";
  slider.min   = 0;
  slider.max   = 1;
  slider.step  = 0.005;
  slider.value = flow.valve.fraction;

  const display = document.createElement("span");
  display.className = "value";
  display.textContent = (+flow.valve.fraction).toFixed(2);

  slider.addEventListener("input", (e) => {
    const v = parseFloat(e.target.value);
    flow.valve.fraction = v;
    display.textContent = v.toFixed(2);
  });

  row.appendChild(label);
  row.appendChild(slider);
  row.appendChild(display);
  panel.appendChild(row);
  container.appendChild(panel);
  return panel;
}

function mountCamPanel(container, flow) {
  const panel = document.createElement("div");
  panel.className = "mode-panel cam-mode-panel";

  const updaters = [];
  for (const [camName, cam] of Object.entries(flow.valve.cams)) {
    const camPanel = document.createElement("div");
    camPanel.className = "cam-panel";
    panel.appendChild(camPanel);
    updaters.push(mountCam(camPanel, cam, camName));
  }

  container.appendChild(panel);
  return { panel, updaters };
}

function mountInspector(container, flow) {
  // --- Header + description -----------------------------------------------
  const header = document.createElement("div");
  header.className = "panel-header";
  header.textContent = flow.name;
  container.appendChild(header);

  if (flow.describe) {
    const describe = document.createElement("div");
    describe.className = "panel-describe";
    describe.textContent = flow.describe({ valve: flow.valve, flows });
    container.appendChild(describe);
  }

  let updaters = [];

  if (flow.valve) {
    // --- Mode dropdown ----------------------------------------------------
    const modeRow = document.createElement("div");
    modeRow.className = "mode-row";

    const modeLabel = document.createElement("label");
    modeLabel.textContent = "Valve mode:";

    const modeSelect = document.createElement("select");
    for (const mode of ["rate", "fraction", "cam"]) {
      const opt = document.createElement("option");
      opt.value = mode;
      opt.textContent = mode;
      if (mode === flow.valve.mode) opt.selected = true;
      modeSelect.appendChild(opt);
    }
    modeRow.appendChild(modeLabel);
    modeRow.appendChild(modeSelect);
    container.appendChild(modeRow);

    // --- All three mode panels (built up front, toggled by display) -------
    const ratePanel     = mountRatePanel(container, flow);
    const fractionPanel = mountFractionPanel(container, flow);
    const camResult     = mountCamPanel(container, flow);
    updaters = camResult.updaters;

    const panels = {
      rate:     ratePanel,
      fraction: fractionPanel,
      cam:      camResult.panel,
    };

    function showMode(mode) {
      for (const [m, p] of Object.entries(panels)) {
        p.style.display = m === mode ? "" : "none";
      }
    }
    showMode(flow.valve.mode);

    modeSelect.addEventListener("change", () => {
      flow.valve.mode = modeSelect.value;
      showMode(modeSelect.value);
    });
  } else {
    const note = document.createElement("div");
    note.className = "panel-note";
    note.textContent = "Derived flow — no valve controls.";
    container.appendChild(note);
  }

  // --- Current value readout ----------------------------------------------
  const readout = document.createElement("div");
  readout.className = "readout";
  container.appendChild(readout);

  return function updateInspector() {
    updaters.forEach((u) => u());
    readout.textContent = `Current rate: ${(flow.value ?? 0).toFixed(2)} £/sec`;
  };
}

function switchInspector(flow) {
  inspectorEl.innerHTML = "";
  updateInspector = mountInspector(inspectorEl, flow);
}

const inspectorEl = document.getElementById("inspector-content");
let updateInspector = mountInspector(inspectorEl, flows.savings);
const flowSelect = document.getElementById("flow-select");
for (const [id, flow] of Object.entries(flows)) {
  const opt = document.createElement("option");
  opt.value = id;
  opt.textContent = flow.name;
  flowSelect.appendChild(opt);
}
flowSelect.value = "savings";
flowSelect.addEventListener("change", () => switchInspector(flows[flowSelect.value]));

// ============================================================
// Per-frame update + animation loop
// ============================================================

function draw() {
  for (const [id, tank] of Object.entries(tanks)) {
    tankCells[id].textContent = tank.level.toFixed(2);
  }
  for (const [id, flow] of Object.entries(flows)) {
    flowCells[id].textContent = (flow.value ?? 0).toFixed(2);
  }

  const total = Object.values(tanks).reduce((s, t) => s + t.level, 0);
  conservationEl.textContent =
    `total = ${total.toFixed(4)}   drift from start: ${(total - initialTotal).toExponential(2)}`;

  drawSchematic();
  updateInspector();
}

function loop() {
  tick(0.01);
  draw();
  requestAnimationFrame(loop);
}
loop();
