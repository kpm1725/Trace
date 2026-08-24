/**
 * Invariant checks and SVG previews for the circuit layout.
 *
 *     npm run diagram:check          assert only
 *     npm run diagram:check -- --svg also write previews to .diagram/
 *
 * `src/circuit/layout.ts` is pure and imports its types with `import type`, so
 * it compiles to JavaScript with no imports at all and runs in plain node. That
 * is the whole reason the layout lives apart from the renderer: the hard part
 * is checkable here, in a second, instead of only being observable on a device.
 *
 * `tsconfig.diagram.json` drives the compile so `@/*` still resolves; the
 * output lands in node_modules/.cache and is required from there.
 *
 * The box-intersection check below is not hypothetical. The first version of
 * this layout routed rail wires straight from pin to rail, which sent them
 * clean through every box in between; because boxes paint over wires, the
 * result looked like a connection to whichever box the line vanished behind.
 * The negative-height guard and the empty-circuit fixture come from the same
 * afternoon.
 */
const fs = require("fs");
const path = require("path");

const BUILD = path.join(__dirname, "..", "node_modules", ".cache", "trace-diagram", "circuit", "layout.js");
if (!fs.existsSync(BUILD)) {
  console.error(`Compiled layout not found at ${BUILD}.\nRun: npm run diagram:check`);
  process.exit(1);
}
const { layoutCircuit } = require(BUILD);

const EPS = 0.001;

// ── Fixtures ────────────────────────────────────────────────────────────────

/** A 555 astable LED blinker on 9V — the worked example from the brief. */
const astable = {
  title: "555 astable LED blinker",
  summary: "Free-running 555 flashing an LED at roughly 1 Hz from a 9V supply.",
  supply_voltage: "9V",
  components: [
    { id: "BAT1", kind: "battery", label: "9V battery", value: "9V", pins: ["+", "-"], notes: "" },
    { id: "U1", kind: "ic", label: "NE555 timer", value: "NE555",
      pins: ["GND", "TRIG", "OUT", "RESET", "CTRL", "THRES", "DISCH", "VCC"], notes: "" },
    { id: "R1", kind: "resistor", label: "Resistor", value: "10k", pins: ["1", "2"], notes: "" },
    { id: "R2", kind: "resistor", label: "Resistor", value: "47k", pins: ["1", "2"], notes: "" },
    { id: "C1", kind: "polarized_capacitor", label: "Electrolytic cap", value: "10uF", pins: ["+", "-"], notes: "" },
    { id: "C2", kind: "capacitor", label: "Ceramic cap", value: "100nF", pins: ["1", "2"], notes: "" },
    { id: "R3", kind: "resistor", label: "Resistor", value: "470R", pins: ["1", "2"], notes: "" },
    { id: "LED1", kind: "led", label: "LED", value: "red", pins: ["A", "K"], notes: "" },
  ],
  nets: [
    { id: "VCC", kind: "power", connections: [
      { component_id: "BAT1", pin: "+" }, { component_id: "U1", pin: "VCC" },
      { component_id: "U1", pin: "RESET" }, { component_id: "R1", pin: "1" }] },
    { id: "GND", kind: "ground", connections: [
      { component_id: "BAT1", pin: "-" }, { component_id: "U1", pin: "GND" },
      { component_id: "C1", pin: "-" }, { component_id: "C2", pin: "2" },
      { component_id: "LED1", pin: "K" }] },
    { id: "N1", kind: "signal", connections: [
      { component_id: "R1", pin: "2" }, { component_id: "R2", pin: "1" },
      { component_id: "U1", pin: "DISCH" }] },
    { id: "N2", kind: "signal", connections: [
      { component_id: "R2", pin: "2" }, { component_id: "U1", pin: "THRES" },
      { component_id: "U1", pin: "TRIG" }, { component_id: "C1", pin: "+" }] },
    { id: "N3", kind: "signal", connections: [
      { component_id: "U1", pin: "OUT" }, { component_id: "R3", pin: "1" }] },
    { id: "N4", kind: "signal", connections: [
      { component_id: "R3", pin: "2" }, { component_id: "LED1", pin: "A" }] },
    { id: "N5", kind: "signal", connections: [
      { component_id: "U1", pin: "CTRL" }, { component_id: "C2", pin: "1" }] },
  ],
  parts_list: [], wiring_steps: [], cautions: [],
};

/** The degenerate case: two parts, one signal net. */
const minimal = {
  title: "LED and series resistor", summary: "", supply_voltage: "5V",
  components: [
    { id: "R1", kind: "resistor", label: "Resistor", value: "220R", pins: ["1", "2"], notes: "" },
    { id: "LED1", kind: "led", label: "LED", value: "red", pins: ["A", "K"], notes: "" },
  ],
  nets: [
    { id: "VCC", kind: "power", connections: [{ component_id: "R1", pin: "1" }] },
    { id: "GND", kind: "ground", connections: [{ component_id: "LED1", pin: "K" }] },
    { id: "N1", kind: "signal", connections: [
      { component_id: "R1", pin: "2" }, { component_id: "LED1", pin: "A" }] },
  ],
  parts_list: [], wiring_steps: [], cautions: [],
};

/** Deliberately incoherent, to pin the warnings the model's output can trip. */
const broken = {
  title: "Broken netlist", summary: "", supply_voltage: "",
  components: [
    { id: "R1", kind: "resistor", label: "Resistor", value: "1k", pins: ["1", "2"], notes: "" },
    { id: "X9", kind: "other", label: "Orphan", value: "", pins: ["a"], notes: "" },
  ],
  nets: [
    { id: "N1", kind: "signal", connections: [
      { component_id: "R1", pin: "9" },       // a pin R1 does not have
      { component_id: "GHOST", pin: "1" }] }, // a component that does not exist
    { id: "N2", kind: "signal", connections: [{ component_id: "R1", pin: "1" }] }, // single-ended
  ],
  parts_list: [], wiring_steps: [], cautions: [],
};

/** Nothing at all — the empty response the UI must not crash on. */
const empty = {
  title: "Empty", summary: "", supply_voltage: "",
  components: [], nets: [], parts_list: [], wiring_steps: [], cautions: [],
};

const FIXTURES = { astable, minimal, broken, empty };

// ── Checks ──────────────────────────────────────────────────────────────────

let failures = 0;
function check(name, condition, detail) {
  if (condition) return;
  failures += 1;
  console.error(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`);
}

/** Does a segment cross the strict interior of a box? Touching an edge is fine
 *  — every pin stub starts on one. */
function crossesBox(seg, box) {
  const [x1, y1, x2, y2] = seg;
  const left = box.x, right = box.x + box.width, top = box.y, bottom = box.y + box.height;
  if (Math.abs(x1 - x2) < EPS) {
    const lo = Math.min(y1, y2), hi = Math.max(y1, y2);
    return x1 > left + EPS && x1 < right - EPS && lo < bottom - EPS && hi > top + EPS;
  }
  if (Math.abs(y1 - y2) < EPS) {
    const lo = Math.min(x1, x2), hi = Math.max(x1, x2);
    return y1 > top + EPS && y1 < bottom - EPS && lo < right - EPS && hi > left + EPS;
  }
  return false; // diagonals are caught separately
}

function runChecks(name, circuit) {
  console.log(`\n${name}`);
  const L = layoutCircuit(circuit);
  const segments = L.nets.flatMap((n) => n.segments.map((s) => [s, n.netId]));

  console.log(`  canvas ${L.width} x ${L.height}  ·  ${L.components.length} components, ` +
              `${L.rails.length} rails, ${segments.length} segments`);

  // The regression this file exists for.
  for (const [seg, netId] of segments) {
    for (const box of L.components) {
      check(
        "no wire crosses a component box",
        !crossesBox(seg, box),
        `net ${netId} segment ${seg.map(Math.round).join(",")} runs through ${box.id} ` +
        `(${Math.round(box.x)},${Math.round(box.y)} ${box.width}x${Math.round(box.height)})`,
      );
    }
  }

  for (const [seg, netId] of segments) {
    const [x1, y1, x2, y2] = seg;
    check(
      "every segment is orthogonal",
      Math.abs(x1 - x2) < EPS || Math.abs(y1 - y2) < EPS,
      `net ${netId} segment ${seg.join(",")} is diagonal`,
    );
  }

  for (const [seg, netId] of segments) {
    for (const v of seg) {
      check("geometry is finite", Number.isFinite(v), `net ${netId} has ${v}`);
    }
  }

  // Every pin the netlist connected should have a wire reaching it.
  const reached = new Set(segments.flatMap(([s]) => [`${s[0]},${s[1]}`, `${s[2]},${s[3]}`]));
  for (const component of L.components) {
    for (const pin of component.pins) {
      if (!pin.netId) continue;
      check(
        "every connected pin has a wire",
        reached.has(`${pin.x},${pin.y}`),
        `${component.id}.${pin.pin} on ${pin.netId} is unreached`,
      );
    }
  }

  // Boxes stack without touching.
  const sorted = [...L.components].sort((a, b) => a.y - b.y);
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1], cur = sorted[i];
    check(
      "component boxes don't overlap",
      cur.y >= prev.y + prev.height - EPS,
      `${cur.id} at y=${cur.y} overlaps ${prev.id} ending at ${prev.y + prev.height}`,
    );
  }

  for (const component of L.components) {
    check("boxes fit the canvas",
      component.x >= -EPS && component.x + component.width <= L.width + EPS,
      `${component.id} spans ${component.x}..${component.x + component.width} of ${L.width}`);
  }
  for (const [seg, netId] of segments) {
    check("wires fit the canvas",
      Math.min(seg[0], seg[2]) >= -EPS && Math.max(seg[0], seg[2]) <= L.width + EPS &&
      Math.min(seg[1], seg[3]) >= -EPS && Math.max(seg[1], seg[3]) <= L.height + EPS,
      `net ${netId} segment ${seg.join(",")} leaves the ${L.width}x${L.height} canvas`);
  }

  // Same input, same drawing — otherwise a re-render reshuffles the diagram
  // under the reader.
  check("layout is deterministic",
    JSON.stringify(layoutCircuit(circuit)) === JSON.stringify(L));

  return L;
}

// ── Run ─────────────────────────────────────────────────────────────────────

for (const [name, circuit] of Object.entries(FIXTURES)) {
  const L = runChecks(name, circuit);
  if (L.warnings.length > 0) {
    console.log(`  warnings:`);
    for (const w of L.warnings) console.log(`    - ${w}`);
  }
}

// Fixture-specific expectations.
console.log("\nfixture expectations");
check("astable draws every component", layoutCircuit(astable).components.length === 8);
check("astable reports no netlist problems", layoutCircuit(astable).warnings.length === 0,
  layoutCircuit(astable).warnings.join("; "));
check("empty circuit doesn't throw and has no geometry",
  layoutCircuit(empty).components.length === 0 && layoutCircuit(empty).nets.length === 0);

const brokenWarnings = layoutCircuit(broken).warnings.join(" | ");
for (const expected of ["which R1 doesn't have", "not in the parts list", "isn't connected to anything", "needs at least two"]) {
  check(`broken netlist reports: ${expected}`, brokenWarnings.includes(expected), brokenWarnings);
}

// A pin the netlist never mentions must still be drawn, flagged.
const orphanPin = layoutCircuit(broken).components
  .flatMap((c) => c.pins)
  .filter((p) => p.netId === null);
check("unconnected pins are still placed", orphanPin.length > 0);

if (process.argv.includes("--svg")) {
  const outDir = path.join(__dirname, "..", ".diagram");
  fs.mkdirSync(outDir, { recursive: true });
  for (const [name, circuit] of Object.entries(FIXTURES)) {
    fs.writeFileSync(path.join(outDir, `${name}.svg`), toSvg(layoutCircuit(circuit)));
  }
  console.log(`\nwrote ${Object.keys(FIXTURES).length} previews to frontend/.diagram/`);
}

console.log(failures === 0 ? "\nAll layout checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);

// ── Preview rendering (mirrors CircuitDiagram.tsx) ───────────────────────────

function toSvg(L) {
  const C = { surface: "#1A1428", onSurface: "#FAF9FB", box: "#241C36", border: "#332A4A",
              signal: "#C4B5FD", power: "#FBBF24", ground: "#9B90B0", error: "#F87171" };
  const wire = { power: C.power, ground: C.ground, signal: C.signal };
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const o = [`<svg xmlns="http://www.w3.org/2000/svg" width="${L.width}" height="${L.height}" viewBox="0 0 ${L.width} ${L.height}">`,
             `<rect width="${L.width}" height="${L.height}" fill="${C.surface}"/>`];

  for (const r of L.rails) {
    o.push(`<line x1="${r.x1}" y1="${r.y}" x2="${r.x2}" y2="${r.y}" stroke="${wire[r.kind]}" stroke-width="2"/>`);
    o.push(`<text x="4" y="${r.y - 6}" fill="${wire[r.kind]}" font-family="monospace" font-size="10">${esc(r.netId)}</text>`);
  }
  for (const n of L.nets) {
    for (const [x1, y1, x2, y2] of n.segments) {
      o.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${wire[n.kind]}" stroke-width="1.5" stroke-linecap="round"/>`);
    }
    for (const j of n.junctions) o.push(`<circle cx="${j.x}" cy="${j.y}" r="2.6" fill="${wire[n.kind]}"/>`);
    if (n.kind === "signal" && n.segments.length > 0) {
      o.push(`<text x="${n.segments[0][0]}" y="${n.segments[0][1] - 5}" fill="${wire[n.kind]}" font-family="monospace" font-size="8" text-anchor="middle">${esc(n.netId)}</text>`);
    }
  }
  for (const c of L.components) {
    o.push(`<rect x="${c.x}" y="${c.y}" width="${c.width}" height="${c.height}" rx="6" fill="${C.box}" stroke="${C.border}"/>`);
    o.push(`<text x="${c.x + c.width / 2}" y="${c.y + c.height / 2 - 2}" fill="${C.onSurface}" font-family="sans-serif" font-size="12" font-weight="600" text-anchor="middle">${esc(c.id)}</text>`);
    o.push(`<text x="${c.x + c.width / 2}" y="${c.y + c.height / 2 + 11}" fill="${C.ground}" font-family="sans-serif" font-size="9" text-anchor="middle">${esc([c.label, c.value].filter(Boolean).join(" · "))}</text>`);
    for (const p of c.pins) {
      o.push(`<circle cx="${p.x}" cy="${p.y}" r="2" fill="${p.netId ? C.onSurface : C.error}"/>`);
      const pos = p.side === "left" ? [p.x + 5, p.y - 4, "start"]
                : p.side === "right" ? [p.x - 5, p.y - 4, "end"]
                : p.side === "top" ? [p.x, p.y + 11, "middle"]
                : [p.x, p.y - 5, "middle"];
      o.push(`<text x="${pos[0]}" y="${pos[1]}" fill="${C.ground}" font-family="monospace" font-size="8" text-anchor="${pos[2]}">${esc(p.pin)}</text>`);
    }
  }
  o.push("</svg>");
  return o.join("\n");
}
