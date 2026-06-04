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
// For now this is hardcoded to inspect the `savings` flow.
// Generalising to "the flow the user is currently hovering"
// comes later.
// ============================================================

function mountInspector(container, flow) { // flows are read in somehow, very useful
  // --- Functional pieces --------------------------------------------------
  flow.cam.savedParams ??= {[flow.cam.type]: {...flow.cam.params}}; // Set up params cache
  
  // --- Header + description -------------------------------------------------
  const header = document.createElement("div");
  header.className = "panel-header";
  header.textContent = flow.name; // Take panel heaeding from flow name
  container.appendChild(header); 

  const describe = document.createElement("div");
  describe.className = "panel-describe";
  describe.textContent = flow.describe({ params: flow.params, flows }); // Use description of flow for subheading
  container.appendChild(describe);

  // --- Cam type dropdown ----------------------------------------------------
  const camTypeRow = document.createElement("div");
  camTypeRow.className = "cam-type-row"; // make space for the drop-down
  const camTypeLabel = document.createElement("label");
  camTypeLabel.textContent = "Cam shape:"; // label the drop-down
  const camTypeSelect = document.createElement("select");
  // populate drop-down with cams library
  for (const camId of Object.keys(cams)) {
    const opt = document.createElement("option");
    opt.value = camId;
    opt.textContent = cams[camId].name;
    if (camId === flow.cam.type) opt.selected = true;
    camTypeSelect.appendChild(opt);
  }
  camTypeRow.appendChild(camTypeLabel);
  camTypeRow.appendChild(camTypeSelect);
  container.appendChild(camTypeRow);

  // Listen for change in drop-down
  camTypeSelect.addEventListener("change", (e) => {
    const oldType = flow.cam.type; // Capture cam before applying change
    flow.cam.savedParams[oldType] = {...flow.cam.params}; // Save parameters

    const newType = camTypeSelect.value; // Get selected type
    flow.cam.type = newType; // change the cam
    flow.cam.params = flow.cam.savedParams[newType]
      ? {...flow.cam.savedParams[newType]} // if params saved in cache, use them
      : {...cams[newType].params} // if not, get them from default
    buildSliders(); 
  })

  // --- Param sliders (rebuilt whenever cam type changes) --------------------
  const slidersContainer = document.createElement("div");
  container.appendChild(slidersContainer);

  function buildSliders() {
    slidersContainer.innerHTML = "";  // wipe whatever was there
    for (const [paramName, value] of Object.entries(flow.cam.params)) {
      const row = document.createElement("div");
      row.className = "param-row";

      const label = document.createElement("label");
      label.textContent = paramName;

      const slider = document.createElement("input");
      slider.type = "range";
      // Crude defaults — fine for now, you can per-param-tune later.
      slider.min = -5; slider.max = 20; slider.step = 0.01;
      slider.value = value;

      const display = document.createElement("span");
      display.className = "value";
      display.textContent = (+value).toFixed(2);

      slider.addEventListener("input", (e) => {
        const v = parseFloat(e.target.value);
        flow.cam.params[paramName] = v;
        display.textContent = v.toFixed(2);
      })
      
      row.appendChild(label);
      row.appendChild(slider);
      row.appendChild(display);
      slidersContainer.appendChild(row);
    }
  }
  buildSliders();

  // --- Curve preview canvas -------------------------------------------------
  const canvas = document.createElement("canvas");
  canvas.className = "curve"; // get name from cams library
  canvas.width = 320;
  canvas.height = 200;
  container.appendChild(canvas);

  const ctx = canvas.getContext("2d");

  // x range to plot over. Later this should be configurable per flow.
  const xRange = [0, 20];
  const yRange = [0, 0.25];   // tune to your max param's plausible range

  function pixelx(x) {
    return (x - xRange[0]) / (xRange[1] - xRange[0]) * canvas.width;
  } 
  function pixely(y) {
    return canvas.height - (y - yRange[0]) / (yRange[1] - yRange[0]) * canvas.height;
  }

  function drawCurve() {
    ctx.clearRect(0,0,canvas.width, canvas.height); // clear the canvas
    ctx.beginPath(); // start drawing
    const N = 100; // Choose large-ish sampling
    for (let i = 0; i <= N; i++){
      const x = xRange[0] + (xRange[1] - xRange[0]) * i / N; // select next x point
      const y = cams[flow.cam.type].curve(x, flow.cam.params); // calculate y
      if (i == 0) ctx.moveTo(pixelx(x), pixely(y)); // in the first instance, start the line
      else ctx.lineTo(pixelx(x), pixely(y)); // continue the line to the next y
    }
    ctx.strokeStyle = "#000" // draw in black
    ctx.stroke(); // defauly style

    ctx.beginPath(); // start path for indicator dot
    ctx.arc(pixelx(flow.cam.lastInput), pixely(flow.cam.value), 4, 0, 2*Math.PI); // draw small circle centred on indicator
    ctx.fillStyle = "tomato";
    ctx.fill();
  }

  // --- Current value readout ------------------------------------------------
  const readout = document.createElement("div");
  readout.className = "readout";
  container.appendChild(readout);

  // --- The update function the animation loop will call --------------------
  return function updateInspector() {
    drawCurve();
    readout.textContent = `Current rate: ${(flow.value ?? 0).toFixed(2)} £/sec`;
  };
}

const updateInspector = mountInspector(
  document.getElementById("inspector"), // don't see wher ethis element gets instantiated
  flows.savings // don't quite understand how flows come in here from main.js
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
