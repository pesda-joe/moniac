// ============================================================
// Schematic — SVG-based MONIAC diagram
// ------------------------------------------------------------
// Reads global `tanks`, `joins`, `flows` from main.js.
// Calls global `switchInspector(flow)` from view.js on label click.
//
// Architecture: build all SVG elements ONCE at startup; per-frame
// `drawSchematic()` mutates only the attributes that change (fill
// heights, line widths, level numbers). The browser repaints.
// Click handlers attach directly to label groups — no hit-testing.
// ============================================================

const SVG_NS = "http://www.w3.org/2000/svg";

// Helper to make element creation less verbose.
// SVG elements MUST be created with the SVG namespace, not document.createElement.
function svg(tag, attrs = {}, parent = null) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, v);
  }
  if (parent) parent.appendChild(el);
  return el;
}

// --- Visual constants -----------------------------------------------------
const SCHEMATIC_W = 600;
const SCHEMATIC_H = 800;
const TANK_W = 80;
const TANK_H = 120;
const TANK_MAX_LEVEL = 200;
const JOIN_R = 14;
const ARROW_HEAD_MIN   = 7;     // floor length of the arrowhead
const ARROW_HEAD_SCALE = 2.5;   // multiplier on stroke-width above the floor

const root = document.getElementById("schematic");
root.setAttribute("viewBox", `0 0 ${SCHEMATIC_W} ${SCHEMATIC_H}`);
root.setAttribute("width",  SCHEMATIC_W);
root.setAttribute("height", SCHEMATIC_H);

// Layer groups so flows render under nodes (later siblings draw on top).
const flowsLayer = svg("g", { class: "flows-layer" }, root);
const tanksLayer = svg("g", { class: "tanks-layer" }, root);
const joinsLayer = svg("g", { class: "joins-layer" }, root);

function nodePos(id) {
  return tanks[id]?.pos ?? joins[id]?.pos;
}

// --- Edge-clipping helpers -----------------------------------------------
// Where does a ray from a node's centre toward (tx,ty) hit the node boundary?
// Used so flow lines stop at the tank/junction edge instead of going inside.

function rectExit(cx, cy, hw, hh, tx, ty) {
  const dx = tx - cx, dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const tH = dx === 0 ? Infinity : hw / Math.abs(dx);
  const tV = dy === 0 ? Infinity : hh / Math.abs(dy);
  const t = Math.min(tH, tV);
  return { x: cx + t * dx, y: cy + t * dy };
}

function circleExit(cx, cy, r, tx, ty) {
  const dx = tx - cx, dy = ty - cy;
  const len = Math.hypot(dx, dy);
  if (len === 0) return { x: cx, y: cy };
  return { x: cx + r * dx / len, y: cy + r * dy / len };
}

function nodeExitToward(nodeId, towardX, towardY) {
  const tank = tanks[nodeId];
  if (tank) return rectExit(tank.pos.x, tank.pos.y, TANK_W / 2, TANK_H / 2, towardX, towardY);
  const join = joins[nodeId];
  if (join) return circleExit(join.pos.x, join.pos.y, JOIN_R, towardX, towardY);
  return null;
}

// Compute a flow's geometry: where it starts, where it ends, and (optionally)
// the bezier control point if it curves.
//
// Endpoint logic per side:
//   - if the flow has fromOffset / toOffset, use that explicit offset from
//     the node centre (the caller has placed it on the edge themselves);
//   - otherwise, auto-clip at the node's edge, heading toward `via` if
//     the flow curves, otherwise toward the opposite node's centre.

function flowGeometry(flow) {
  const fromCenter = flow.from ? nodePos(flow.from) : null;
  const toCenter   = flow.to   ? nodePos(flow.to)   : null;
  if (!fromCenter || !toCenter) return null;

  let start;
  if (flow.fromOffset) {
    start = { x: fromCenter.x + flow.fromOffset.dx, y: fromCenter.y + flow.fromOffset.dy };
  } else {
    const aimX = flow.via?.x ?? toCenter.x;
    const aimY = flow.via?.y ?? toCenter.y;
    start = nodeExitToward(flow.from, aimX, aimY);
  }

  let end;
  if (flow.toOffset) {
    end = { x: toCenter.x + flow.toOffset.dx, y: toCenter.y + flow.toOffset.dy };
  } else {
    const aimX = flow.via?.x ?? fromCenter.x;
    const aimY = flow.via?.y ?? fromCenter.y;
    end = nodeExitToward(flow.to, aimX, aimY);
  }

  return { start, end, via: flow.via ?? null };
}

// --- Tanks: build once. Capture the elements that mutate per frame. ------
const tankEls = {};
for (const [id, tank] of Object.entries(tanks)) {
  if (!tank.pos) continue;
  const { x, y } = tank.pos;
  const left = x - TANK_W / 2;
  const top  = y - TANK_H / 2;

  const g = svg("g", { class: "tank" }, tanksLayer);

  // Fill rect below outline — y and height set in drawSchematic.
  const fill = svg("rect", { x: left, width: TANK_W, class: "tank-fill" }, g);

  // Outline drawn after fill so the border is on top.
  svg("rect", {
    x: left, y: top, width: TANK_W, height: TANK_H,
    class: "tank-outline",
  }, g);

  // Name above the tank.
  const nameText = svg("text", {
    x, y: top - 6, "text-anchor": "middle", class: "tank-name",
  }, g);
  nameText.textContent = tank.name;

  // Numeric level inside — mutates per frame.
  const levelText = svg("text", {
    x, y, "text-anchor": "middle", "dominant-baseline": "middle",
    class: "tank-level",
  }, g);

  // Signal value below, only if the tank has a signal.
  let signalText = null;
  if (tank.signal) {
    signalText = svg("text", {
      x, y: top + TANK_H + 14, "text-anchor": "middle",
      class: "tank-signal",
    }, g);
  }

  tankEls[id] = { fill, levelText, signalText, top };
}

// --- Joins: built once. Nothing mutates per frame. -----------------------
for (const [id, join] of Object.entries(joins)) {
  if (!join.pos) continue;
  const { x, y } = join.pos;
  const g = svg("g", { class: "join" }, joinsLayer);
  svg("circle", { cx: x, cy: y, r: JOIN_R, class: "join-circle" }, g);
  const t = svg("text", {
    x, y: y - JOIN_R - 8, "text-anchor": "middle", class: "join-name",
  }, g);
  t.textContent = join.name;
}

// --- Flows: build once. Path geometry, arrowhead, and label are static    -
// (positions don't change). Only stroke-width mutates per frame.
const flowEls = {};
for (const [id, flow] of Object.entries(flows)) {
  const geom = flowGeometry(flow);
  if (!geom) continue;   // skip peg flows (no source or no sink)

  const { start, end, via } = geom;
  const g = svg("g", { class: "flow" }, flowsLayer);

  // Build the path 'd' attribute. Straight: M..L..  Curved: M..Q..
  // Also compute the tangent direction at the end (for the arrowhead) and
  // the label position (chord midpoint for a line, bezier(0.5) for a curve).
  let d, endTangentX, endTangentY, labelX, labelY;
  if (via) {
    d = `M ${start.x},${start.y} Q ${via.x},${via.y} ${end.x},${end.y}`;
    endTangentX = end.x - via.x;
    endTangentY = end.y - via.y;
    // Quadratic Bézier at t=0.5: 0.25·P0 + 0.5·P1 + 0.25·P2
    labelX = 0.25 * start.x + 0.5 * via.x + 0.25 * end.x;
    labelY = 0.25 * start.y + 0.5 * via.y + 0.25 * end.y;
  } else {
    d = `M ${start.x},${start.y} L ${end.x},${end.y}`;
    endTangentX = end.x - start.x;
    endTangentY = end.y - start.y;
    labelX = (start.x + end.x) / 2;
    labelY = (start.y + end.y) / 2;
  }

  // The flow path — stroke-width changes per frame.
  const path = svg("path", { d, class: "flow-line", fill: "none" }, g);

  // Arrowhead: tip at the end point, base corners back along the end tangent.
  // The polygon's `points` attribute is rewritten each frame in drawSchematic
  // so the size scales with the current stroke width.
  const arrowhead = svg("polygon", { class: "flow-arrowhead" }, g);
  const endAngle  = Math.atan2(endTangentY, endTangentX);

  // Label at the path's visual midpoint — its own clickable group.
  const labelG = svg("g", { class: "flow-label", "data-flow-id": id }, g);
  svg("rect", {
    x: labelX - 32, y: labelY - 9, width: 64, height: 18,
    class: "flow-label-bg",
  }, labelG);
  const labelText = svg("text", {
    x: labelX, y: labelY, "text-anchor": "middle", "dominant-baseline": "middle",
    class: "flow-label-text",
  }, labelG);
  labelText.textContent = flow.name;

  labelG.addEventListener("click", () => {
    switchInspector(flow);
    const sel = document.getElementById("flow-select");
    if (sel) sel.value = id;
  });

  flowEls[id] = { path, arrowhead, endX: end.x, endY: end.y, endAngle };
}

// --- Per-frame update: mutate only what changes. -------------------------
function drawSchematic() {
  for (const [id, tank] of Object.entries(tanks)) {
    const els = tankEls[id];
    if (!els) continue;
    const fillH = Math.max(0, Math.min(TANK_H, (tank.level / TANK_MAX_LEVEL) * TANK_H));
    els.fill.setAttribute("y", els.top + TANK_H - fillH);
    els.fill.setAttribute("height", fillH);
    els.levelText.textContent = tank.level.toFixed(1);
    if (els.signalText && tank.signal?.value !== undefined) {
      els.signalText.textContent =
        `${tank.signal.symbol} = ${tank.signal.value.toFixed(3)}`;
    }
  }

  for (const [id, flow] of Object.entries(flows)) {
    const els = flowEls[id];
    if (!els) continue;
    const w = Math.max(1, Math.min(10, (flow.value ?? 0) * 0.15));
    els.path.setAttribute("stroke-width", w);

    // Arrowhead scales with stroke width, with a visible floor.
    const headLen = Math.max(ARROW_HEAD_MIN, w * ARROW_HEAD_SCALE);
    const ax = els.endX - headLen * Math.cos(els.endAngle - Math.PI / 6);
    const ay = els.endY - headLen * Math.sin(els.endAngle - Math.PI / 6);
    const bx = els.endX - headLen * Math.cos(els.endAngle + Math.PI / 6);
    const by = els.endY - headLen * Math.sin(els.endAngle + Math.PI / 6);
    els.arrowhead.setAttribute(
      "points",
      `${els.endX},${els.endY} ${ax},${ay} ${bx},${by}`
    );
  }
}
