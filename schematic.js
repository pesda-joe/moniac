// ============================================================
// Schematic — canvas-based MONIAC diagram
// ------------------------------------------------------------
// Reads global `tanks`, `joins`, `flows` from main.js.
// Calls global `switchInspector(flow)` from view.js when a flow
// label is clicked.
// ============================================================

const schematicCanvas = document.getElementById("schematic");
const sctx = schematicCanvas.getContext("2d");

// --- Visual constants -----------------------------------------------------
const TANK_W = 80;
const TANK_H = 120;
const TANK_MAX_LEVEL = 200;   // y axis for fill height; tune per-tank later if needed
const JOIN_R  = 14;
const LABEL_W = 64;            // hit-box for flow labels
const LABEL_H = 16;
const ARROW_BACKOFF = 28;      // distance from node centre where arrow tip sits
const ARROWHEAD_LEN = 9;

// Hit boxes recomputed each frame for the click handler.
let flowHits = [];

// --- Lookups --------------------------------------------------------------
function nodePos(id) {
  return tanks[id]?.pos ?? joins[id]?.pos;
}

// --- Drawing primitives ---------------------------------------------------
function drawTank(tank) {
  const { x, y } = tank.pos;
  const left = x - TANK_W / 2;
  const top  = y - TANK_H / 2;

  // Fill — water level from the bottom
  const fillH = Math.max(0, Math.min(TANK_H, (tank.level / TANK_MAX_LEVEL) * TANK_H));
  sctx.fillStyle = "rgba(80, 140, 210, 0.45)";
  sctx.fillRect(left, top + TANK_H - fillH, TANK_W, fillH);

  // Outline
  sctx.strokeStyle = "#333";
  sctx.lineWidth = 2;
  sctx.strokeRect(left, top, TANK_W, TANK_H);

  // Name above
  sctx.fillStyle = "#000";
  sctx.font = "12px sans-serif";
  sctx.textAlign = "center";
  sctx.textBaseline = "alphabetic";
  sctx.fillText(tank.name, x, top - 6);

  // Numeric level inside
  sctx.fillStyle = "#000";
  sctx.font = "bold 13px sans-serif";
  sctx.textBaseline = "middle";
  sctx.fillText(tank.level.toFixed(1), x, y);

  // Signal value, if any
  if (tank.signal?.value !== undefined) {
    sctx.fillStyle = "#444";
    sctx.font = "11px sans-serif";
    sctx.fillText(`${tank.signal.symbol} = ${tank.signal.value.toFixed(3)}`,
                  x, top + TANK_H + 14);
  }
}

function drawJoin(join) {
  const { x, y } = join.pos;

  sctx.fillStyle = "#d8d8d8";
  sctx.beginPath();
  sctx.arc(x, y, JOIN_R, 0, 2 * Math.PI);
  sctx.fill();
  sctx.strokeStyle = "#333";
  sctx.lineWidth = 1.5;
  sctx.stroke();

  sctx.fillStyle = "#000";
  sctx.font = "11px sans-serif";
  sctx.textAlign = "center";
  sctx.textBaseline = "middle";
  sctx.fillText(join.name, x, y - JOIN_R - 8);
}

function drawArrowhead(fromX, fromY, toX, toY) {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  const tipX = toX - ARROW_BACKOFF * Math.cos(angle);
  const tipY = toY - ARROW_BACKOFF * Math.sin(angle);

  sctx.beginPath();
  sctx.moveTo(tipX, tipY);
  sctx.lineTo(tipX - ARROWHEAD_LEN * Math.cos(angle - Math.PI / 6),
              tipY - ARROWHEAD_LEN * Math.sin(angle - Math.PI / 6));
  sctx.lineTo(tipX - ARROWHEAD_LEN * Math.cos(angle + Math.PI / 6),
              tipY - ARROWHEAD_LEN * Math.sin(angle + Math.PI / 6));
  sctx.closePath();
  sctx.fillStyle = "#444";
  sctx.fill();
}

function drawFlow(flowId, flow) {
  const fromPos = flow.from ? nodePos(flow.from) : null;
  const toPos   = flow.to   ? nodePos(flow.to)   : null;
  if (!fromPos || !toPos) return;   // skip peg flows for now (missing endpoint)

  // Width grows with current value, with a visible floor so zero-flow lines aren't invisible
  const w = Math.max(1, Math.min(10, (flow.value ?? 0) * 0.15));
  sctx.strokeStyle = "#555";
  sctx.lineWidth = w;
  sctx.beginPath();
  sctx.moveTo(fromPos.x, fromPos.y);
  sctx.lineTo(toPos.x,   toPos.y);
  sctx.stroke();

  drawArrowhead(fromPos.x, fromPos.y, toPos.x, toPos.y);

  // Label at the midpoint of the arrow — also the click target
  const mx = (fromPos.x + toPos.x) / 2;
  const my = (fromPos.y + toPos.y) / 2;
  const lx = mx - LABEL_W / 2;
  const ly = my - LABEL_H / 2;

  sctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  sctx.fillRect(lx, ly, LABEL_W, LABEL_H);
  sctx.strokeStyle = "#888";
  sctx.lineWidth = 0.5;
  sctx.strokeRect(lx, ly, LABEL_W, LABEL_H);

  sctx.fillStyle = "#000";
  sctx.font = "11px sans-serif";
  sctx.textAlign = "center";
  sctx.textBaseline = "middle";
  sctx.fillText(flow.name, mx, my);

  flowHits.push({ id: flowId, flow, x: lx, y: ly, w: LABEL_W, h: LABEL_H });
}

// --- Frame entry point ----------------------------------------------------
function drawSchematic() {
  flowHits = [];

  sctx.fillStyle = "#fafafa";
  sctx.fillRect(0, 0, schematicCanvas.width, schematicCanvas.height);

  // Flows under nodes
  for (const [id, flow] of Object.entries(flows)) {
    drawFlow(id, flow);
  }
  for (const tank of Object.values(tanks)) {
    if (tank.pos) drawTank(tank);
  }
  for (const join of Object.values(joins)) {
    if (join.pos) drawJoin(join);
  }
}

// --- Click handling -------------------------------------------------------
schematicCanvas.addEventListener("click", (e) => {
  const rect = schematicCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  for (const hit of flowHits) {
    if (x >= hit.x && x <= hit.x + hit.w &&
        y >= hit.y && y <= hit.y + hit.h) {
      switchInspector(hit.flow);
      // keep the dropdown in sync, if present
      const sel = document.getElementById("flow-select");
      if (sel) sel.value = hit.id;
      return;
    }
  }
});
