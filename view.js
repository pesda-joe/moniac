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

  // --- Cam editors (one per entry in flow.valve.cams) ---------------------
  const updaters = [];
  if (flow.valve?.mode === "cam") {
    for (const [camName, cam] of Object.entries(flow.valve.cams)) {
      const camPanel = document.createElement("div");
      camPanel.className = "cam-panel";
      container.appendChild(camPanel);
      updaters.push(mountCam(camPanel, cam, camName));
    }
  } else {
    const note = document.createElement("div");
    note.className = "panel-note";
    note.textContent = `Mode: ${flow.valve?.mode ?? "derived"} — no cam controls.`;
    container.appendChild(note);
  }

  // --- Current value readout ----------------------------------------------
  const readout = document.createElement("div");
  readout.className = "readout";
  container.appendChild(readout);

  return function updateInspector() {
    updaters.forEach(u => u());
    readout.textContent = `Current rate: ${(flow.value ?? 0).toFixed(2)} £/sec`;
  };
}

const updateInspector = mountInspector(
  document.getElementById("inspector"),
  flows.savings
);


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

  updateInspector();
}

function loop() {
  tick(0.01);
  draw();
  requestAnimationFrame(loop);
}
loop();
