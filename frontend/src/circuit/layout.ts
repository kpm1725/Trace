/**
 * Netlist -> geometry.
 *
 * A netlist is a graph; a schematic is a *drawing* of that graph, and turning
 * one into the other is genuinely hard — EDA tools have worked at it for
 * decades and still ship manual placement. This does not attempt a symbol
 * schematic with routed nets. It produces a **rail-and-ladder diagram**, which
 * is the layout a hobbyist actually draws on paper:
 *
 *     ──────────────── VCC ────────────────      power rail across the top
 *          │                  │
 *      ┌───┴────┐         ┌───┴────┐
 *   ───┤   R1   ├──┐   ┌──┤   U1   │             components stacked vertically,
 *      └────┬───┘  │   │  └───┬────┘             one per row, full width
 *           │      └─lane─┘   │
 *     ──────┴──────── GND ────┴────────────      ground rail across the bottom
 *
 * Three properties make it work on a phone, where a left-to-right schematic
 * would not:
 *
 *   - **Rails.** Power and ground become horizontal lines rather than ordinary
 *     nets. That alone removes most of the wires from a small circuit, and it
 *     matches how these are conventionally read: up is positive, down is
 *     ground.
 *   - **One component per row.** The canvas is tall and narrow, which is the
 *     shape of a phone screen, and the page already scrolls vertically.
 *   - **Lanes.** Every signal net gets a vertical trunk in a side channel.
 *     Nets whose vertical spans don't overlap share a lane, so the margins stay
 *     narrow. Wires meet pins at right angles and never diagonally.
 *
 * This module is deliberately pure and free of React and react-native imports:
 * it takes a `Circuit` and returns numbers. `CircuitDiagram.tsx` draws them.
 * Keeping the split means the hard part is testable without a renderer, and
 * `npm run diagram:preview` can render the same geometry to an SVG file.
 */
import type { Circuit, CircuitComponent, ComponentKind, Net } from "@/src/types";

// ── Geometry constants, in SVG user units ────────────────────────────────────
// The canvas is scaled to the container width at draw time, so these are
// proportions rather than pixels. They are tuned so a 10-component circuit
// stays legible at a 360pt screen width.

const BOX_WIDTH = 168;
const BOX_MIN_HEIGHT = 46;
const PIN_SPACING = 22; // between side pins on the same edge
const PIN_EDGE_PAD = 14; // from box corner to the first side pin
const TOP_PIN_PAD = 22; // from box corner to the first top/bottom pin
const ROW_GAP = 52; // vertical channel between component rows
const LANE_GAP = 13; // between adjacent trunk lanes
const LANE_MARGIN = 16; // from box edge to the innermost lane
const RAIL_GAP = 40; // between a rail and the nearest row
const RAIL_PAD = 20; // from canvas edge to a rail
const RAIL_STACK = 16; // between two rails of the same polarity
const MIN_LANE_CLEAR = 16; // vertical clearance before two nets reuse a lane

/**
 * How far a rail pin's stub travels before turning toward its riser.
 *
 * Must be less than ROW_GAP, or the turn lands inside the next component's box.
 */
const RAIL_ESCAPE = 24;

/**
 * Vertical room reserved inside a box for top-edge pin labels.
 *
 * Side-pin labels are drawn just above their pin and top-pin labels just below
 * theirs, so without this the first left/right label overprints the top ones —
 * which is what `TRIG` over `RESET` looked like before it existed.
 */
const TOP_LABEL_BAND = 13;

export type PinSide = "left" | "right" | "top" | "bottom";

export type LaidOutPin = {
  componentId: string;
  pin: string;
  side: PinSide;
  /** The point a wire attaches to — on the box edge. */
  x: number;
  y: number;
  /** The net this pin sits on, or null when the netlist never mentions it. */
  netId: string | null;
};

export type LaidOutComponent = {
  id: string;
  label: string;
  value: string;
  kind: ComponentKind;
  x: number;
  y: number;
  width: number;
  height: number;
  pins: LaidOutPin[];
};

export type LaidOutRail = {
  netId: string;
  kind: "power" | "ground";
  y: number;
  x1: number;
  x2: number;
};

export type LaidOutNet = {
  netId: string;
  kind: Net["kind"];
  /** Orthogonal polyline segments, as [x1, y1, x2, y2]. */
  segments: [number, number, number, number][];
  /** Solder dots, drawn where three or more wires meet. */
  junctions: { x: number; y: number }[];
  side: "left" | "right" | null;
  lane: number | null;
};

export type CircuitLayout = {
  width: number;
  height: number;
  components: LaidOutComponent[];
  rails: LaidOutRail[];
  nets: LaidOutNet[];
  /**
   * Problems found in the netlist itself, not in the drawing.
   *
   * Structured output guarantees the response *parses*; it cannot guarantee the
   * circuit is coherent. A net naming a pin its component never declared, or a
   * component nothing connects to, is a model mistake worth showing the user
   * rather than silently dropping — a diagram missing a wire looks authoritative
   * in exactly the way a wrong diagram should not.
   */
  warnings: string[];
};

/** Where a pin sits, resolved once and shared by placement and routing. */
type PinPlan = {
  componentId: string;
  pin: string;
  netId: string | null;
  side: PinSide;
};

function isRail(net: Net): boolean {
  return net.kind === "power" || net.kind === "ground";
}

/**
 * Order components so wires generally run short.
 *
 * Breadth-first from whatever touches a power net, following signal nets. A
 * power source lands at the top, the parts it feeds come next, and so on down —
 * roughly signal flow, which is what makes the drawing readable. Ties break on
 * the netlist's own order so the same circuit always draws identically.
 */
function orderComponents(circuit: Circuit, railNetIds: Set<string>): CircuitComponent[] {
  const byId = new Map(circuit.components.map((c) => [c.id, c]));
  const neighbours = new Map<string, string[]>();

  for (const net of circuit.nets) {
    if (railNetIds.has(net.id)) continue; // rails join everything; they say nothing about order
    const ids = [...new Set(net.connections.map((c) => c.component_id))];
    for (const a of ids) {
      const list = neighbours.get(a) ?? [];
      for (const b of ids) if (a !== b && !list.includes(b)) list.push(b);
      neighbours.set(a, list);
    }
  }

  const powered = new Set<string>();
  for (const net of circuit.nets) {
    if (net.kind !== "power") continue;
    for (const conn of net.connections) powered.add(conn.component_id);
  }

  const seeds = circuit.components.filter((c) => powered.has(c.id)).map((c) => c.id);
  const queue = seeds.length > 0 ? [...seeds] : circuit.components.slice(0, 1).map((c) => c.id);

  const seen = new Set<string>(queue);
  const ordered: CircuitComponent[] = [];

  while (queue.length > 0) {
    const id = queue.shift()!;
    const component = byId.get(id);
    if (component) ordered.push(component);
    for (const next of neighbours.get(id) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }

  // Anything the walk never reached — an isolated component, or one joined only
  // by rails — keeps its original position at the end.
  for (const component of circuit.components) {
    if (!seen.has(component.id)) ordered.push(component);
  }
  return ordered;
}

/**
 * Decide each pin's edge before any coordinates exist.
 *
 * Placement needs to know how many pins land on each edge to size the box, and
 * lane packing needs the pins placed to know each net's vertical span. Deciding
 * sides first breaks that circularity: a power pin goes up, a ground pin goes
 * down, and a signal pin follows its net's side, which is fixed here by
 * alternating so the two margins stay balanced.
 */
function planPins(
  circuit: Circuit,
  railNetIds: Set<string>,
  warnings: string[],
): { plans: Map<string, PinPlan[]>; netSide: Map<string, "left" | "right"> } {
  const byId = new Map(circuit.components.map((c) => [c.id, c]));

  // netId per (componentId, pin). A pin on two nets is a short; the netlist
  // should not produce one, so it is reported rather than drawn twice.
  const pinNet = new Map<string, string>();
  for (const net of circuit.nets) {
    for (const conn of net.connections) {
      const component = byId.get(conn.component_id);
      if (!component) {
        warnings.push(`Net ${net.id} connects to ${conn.component_id}, which is not in the parts list.`);
        continue;
      }
      if (!component.pins.includes(conn.pin)) {
        warnings.push(`Net ${net.id} uses pin ${conn.component_id}.${conn.pin}, which ${component.id} doesn't have.`);
        continue;
      }
      const key = `${conn.component_id} ${conn.pin}`;
      const existing = pinNet.get(key);
      if (existing && existing !== net.id) {
        warnings.push(`${conn.component_id}.${conn.pin} is on both ${existing} and ${net.id}.`);
        continue;
      }
      pinNet.set(key, net.id);
    }
  }

  const netKind = new Map(circuit.nets.map((n) => [n.id, n.kind]));

  // Signal nets alternate sides in netlist order — deterministic, and it keeps
  // the left and right margins within one lane of each other.
  const netSide = new Map<string, "left" | "right">();
  let i = 0;
  for (const net of circuit.nets) {
    if (isRail(net)) continue;
    netSide.set(net.id, i % 2 === 0 ? "right" : "left");
    i += 1;
  }

  const plans = new Map<string, PinPlan[]>();
  for (const component of circuit.components) {
    const componentPlans: PinPlan[] = component.pins.map((pin) => {
      const netId = pinNet.get(`${component.id} ${pin}`) ?? null;
      const kind = netId ? netKind.get(netId) : undefined;
      const side: PinSide =
        kind === "power" ? "top"
        : kind === "ground" ? "bottom"
        // An unconnected pin still gets drawn, on the right, so a missing
        // connection is visible as a stub going nowhere rather than invisible.
        : netId ? netSide.get(netId)! : "right";
      return { componentId: component.id, pin, netId, side };
    });
    plans.set(component.id, componentPlans);

    if (componentPlans.every((p) => p.netId === null)) {
      warnings.push(`${component.id} (${component.label}) isn't connected to anything.`);
    }
  }

  for (const net of circuit.nets) {
    if (net.connections.length < 2) {
      warnings.push(`Net ${net.id} has only ${net.connections.length} connection — a net needs at least two.`);
    }
  }
  void railNetIds;
  return { plans, netSide };
}

/** Greedy interval packing: nets whose spans clear each other share a lane. */
function packLanes(
  spans: { netId: string; top: number; bottom: number }[],
): Map<string, number> {
  const laneBottom: number[] = [];
  const assigned = new Map<string, number>();
  for (const span of [...spans].sort((a, b) => a.top - b.top || a.netId.localeCompare(b.netId))) {
    let lane = laneBottom.findIndex((bottom) => span.top > bottom + MIN_LANE_CLEAR);
    if (lane === -1) {
      lane = laneBottom.length;
      laneBottom.push(span.bottom);
    } else {
      laneBottom[lane] = span.bottom;
    }
    assigned.set(span.netId, lane);
  }
  return assigned;
}

export function layoutCircuit(circuit: Circuit): CircuitLayout {
  const warnings: string[] = [];

  const powerNets = circuit.nets.filter((n) => n.kind === "power");
  const groundNets = circuit.nets.filter((n) => n.kind === "ground");
  const signalNets = circuit.nets.filter((n) => !isRail(n));
  const railNetIds = new Set([...powerNets, ...groundNets].map((n) => n.id));

  const { plans, netSide } = planPins(circuit, railNetIds, warnings);
  const ordered = orderComponents(circuit, railNetIds);

  // ── Pass 1: box sizes, from the pin counts on each edge ───────────────────
  const sized = ordered.map((component) => {
    const componentPlans = plans.get(component.id) ?? [];
    const left = componentPlans.filter((p) => p.side === "left");
    const right = componentPlans.filter((p) => p.side === "right");
    const sideMax = Math.max(left.length, right.length);
    // Side pins start below the top-label band, so their labels clear any
    // top-edge ones; the same band is reserved at the bottom.
    const sideTop = PIN_EDGE_PAD + (componentPlans.some((p) => p.side === "top") ? TOP_LABEL_BAND : 0);
    const sideBottom = PIN_EDGE_PAD + (componentPlans.some((p) => p.side === "bottom") ? TOP_LABEL_BAND : 0);
    const height = Math.max(
      BOX_MIN_HEIGHT,
      sideTop + Math.max(0, sideMax - 1) * PIN_SPACING + sideBottom,
    );
    return { component, componentPlans, height, sideTop };
  });

  // ── Pass 2: lane counts, so the horizontal origin is known ────────────────
  // Lanes are packed properly in pass 4, once pins have real y values. Here we
  // only need an upper bound per side to reserve margin width, and the count of
  // nets on a side is exactly that.
  const leftNetCount = signalNets.filter((n) => netSide.get(n.id) === "left").length;
  const rightNetCount = signalNets.filter((n) => netSide.get(n.id) === "right").length;

  // Rails get risers in the outermost lanes — ground on the left, power on the
  // right — past every signal lane so a riser never lands on a trunk. Reserving
  // by net count rather than by packed lane count over-reserves by at most a
  // lane or two, which is cheaper than the circular dependency that computing
  // it exactly would create.
  const leftLanes = leftNetCount + groundNets.length;
  const rightLanes = rightNetCount + powerNets.length;
  const leftWidth = LANE_MARGIN + leftLanes * LANE_GAP;
  const rightWidth = LANE_MARGIN + rightLanes * LANE_GAP;

  const boxX = leftWidth;
  const width = leftWidth + BOX_WIDTH + rightWidth;

  // ── Pass 3: place boxes and pins ──────────────────────────────────────────
  const hasPowerRail = powerNets.length > 0;
  const hasGroundRail = groundNets.length > 0;

  // Stacked when there is more than one supply, outermost first.
  const powerRailY = new Map(powerNets.map((n, i) => [n.id, RAIL_PAD + i * RAIL_STACK]));
  const lowestPowerRail = hasPowerRail ? RAIL_PAD + (powerNets.length - 1) * RAIL_STACK : RAIL_PAD;
  let y = hasPowerRail ? lowestPowerRail + RAIL_GAP : RAIL_PAD;

  const components: LaidOutComponent[] = [];
  const pinIndex = new Map<string, LaidOutPin>();

  for (const { component, componentPlans, height, sideTop } of sized) {
    let leftN = 0;
    let rightN = 0;
    const tops = componentPlans.filter((p) => p.side === "top");
    const bottoms = componentPlans.filter((p) => p.side === "bottom");
    let topN = 0;
    let bottomN = 0;

    const spread = (index: number, count: number) =>
      count === 1
        ? boxX + BOX_WIDTH / 2
        : boxX + TOP_PIN_PAD + (index * (BOX_WIDTH - 2 * TOP_PIN_PAD)) / (count - 1);

    const laidOutPins: LaidOutPin[] = componentPlans.map((plan) => {
      let px: number;
      let py: number;
      switch (plan.side) {
        case "left":
          px = boxX;
          py = y + sideTop + leftN * PIN_SPACING;
          leftN += 1;
          break;
        case "right":
          px = boxX + BOX_WIDTH;
          py = y + sideTop + rightN * PIN_SPACING;
          rightN += 1;
          break;
        case "top":
          px = spread(topN, tops.length);
          py = y;
          topN += 1;
          break;
        default:
          px = spread(bottomN, bottoms.length);
          py = y + height;
          bottomN += 1;
          break;
      }
      const pin: LaidOutPin = {
        componentId: plan.componentId,
        pin: plan.pin,
        side: plan.side,
        x: px,
        y: py,
        netId: plan.netId,
      };
      pinIndex.set(`${plan.componentId} ${plan.pin}`, pin);
      return pin;
    });

    components.push({
      id: component.id,
      label: component.label,
      value: component.value,
      kind: component.kind,
      x: boxX,
      y,
      width: BOX_WIDTH,
      height,
      pins: laidOutPins,
    });

    y += height + ROW_GAP;
  }

  // With no components at all, `y` never advanced, so subtracting the trailing
  // row gap would run the canvas past its own origin and yield a negative
  // height — which an SVG viewBox will not survive.
  const lastRowBottom = components.length > 0 ? y - ROW_GAP : y;
  const groundRailY = new Map(
    groundNets.map((n, i) => [n.id, lastRowBottom + RAIL_GAP + i * RAIL_STACK]),
  );
  const lowestGroundRail = hasGroundRail
    ? lastRowBottom + RAIL_GAP + (groundNets.length - 1) * RAIL_STACK
    : lastRowBottom;
  const height = lowestGroundRail + RAIL_PAD;

  // ── Pass 4: route ─────────────────────────────────────────────────────────
  const nets: LaidOutNet[] = [];

  const pinsOf = (netId: string): LaidOutPin[] => {
    const net = circuit.nets.find((n) => n.id === netId);
    if (!net) return [];
    return net.connections
      .map((c) => pinIndex.get(`${c.component_id} ${c.pin}`))
      .filter((p): p is LaidOutPin => !!p && p.netId === netId);
  };

  const laneX = (side: "left" | "right", lane: number) =>
    side === "left"
      ? boxX - LANE_MARGIN - lane * LANE_GAP
      : boxX + BOX_WIDTH + LANE_MARGIN + lane * LANE_GAP;

  // Rails: a horizontal line, plus a riser each pin reaches by way of the row
  // gap beside it.
  //
  // The obvious routing — a straight vertical from pin to rail — is wrong here.
  // On a tall stack those drops pass clean through every box between the pin
  // and the rail, and since boxes paint over wires the result reads as a
  // connection to whatever box the line disappears behind. A diagram that
  // invents a connection is worse than one that is merely ugly, so every rail
  // pin instead steps out into the empty gap beside its row, runs to a riser
  // outside all the signal lanes, and climbs from there.
  const rails: LaidOutRail[] = [];
  for (const net of [...powerNets, ...groundNets]) {
    const isPower = net.kind === "power";
    const railY = (isPower ? powerRailY : groundRailY).get(net.id)!;
    const riserIndex = isPower ? rightNetCount + powerNets.indexOf(net) : leftNetCount + groundNets.indexOf(net);
    const riserX = laneX(isPower ? "right" : "left", riserIndex);
    const pins = pinsOf(net.id);

    rails.push({ netId: net.id, kind: net.kind as "power" | "ground", y: railY, x1: 0, x2: width });

    const segments: [number, number, number, number][] = [];
    const escapes: number[] = [];
    for (const pin of pins) {
      const escapeY = isPower ? pin.y - RAIL_ESCAPE : pin.y + RAIL_ESCAPE;
      escapes.push(escapeY);
      segments.push([pin.x, pin.y, pin.x, escapeY]); // out of the box
      segments.push([pin.x, escapeY, riserX, escapeY]); // across to the riser
    }
    if (escapes.length > 0) {
      const far = isPower ? Math.max(...escapes) : Math.min(...escapes);
      segments.push([riserX, railY, riserX, far]); // the riser itself
    }

    nets.push({
      netId: net.id,
      kind: net.kind,
      segments,
      // A dot wherever the riser carries on past a joint, plus one where it
      // meets the rail.
      junctions: [
        ...(escapes.length > 0 ? [{ x: riserX, y: railY }] : []),
        ...escapes
          .filter((e) => (isPower ? e < Math.max(...escapes) : e > Math.min(...escapes)))
          .map((e) => ({ x: riserX, y: e })),
      ],
      side: isPower ? "right" : "left",
      lane: riserIndex,
    });
  }

  // Signal nets: a vertical trunk in a lane, a horizontal stub to each pin.
  const spansBySide: Record<"left" | "right", { netId: string; top: number; bottom: number }[]> = {
    left: [],
    right: [],
  };
  for (const net of signalNets) {
    const pins = pinsOf(net.id);
    if (pins.length === 0) continue;
    const ys = pins.map((p) => p.y);
    spansBySide[netSide.get(net.id)!].push({
      netId: net.id,
      top: Math.min(...ys),
      bottom: Math.max(...ys),
    });
  }
  const lanes = {
    left: packLanes(spansBySide.left),
    right: packLanes(spansBySide.right),
  };

  for (const net of signalNets) {
    const pins = pinsOf(net.id);
    const side = netSide.get(net.id)!;
    const lane = lanes[side].get(net.id);

    if (pins.length === 0 || lane === undefined) {
      nets.push({ netId: net.id, kind: net.kind, segments: [], junctions: [], side, lane: null });
      continue;
    }

    const x = laneX(side, lane);
    const ys = pins.map((p) => p.y);
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);

    const segments: [number, number, number, number][] = [];
    // The trunk. A two-pin net at the same height needs none.
    if (bottom > top) segments.push([x, top, x, bottom]);
    for (const pin of pins) segments.push([pin.x, pin.y, x, pin.y]);

    // A junction only where the trunk actually continues past the stub, which
    // is the schematic convention: three or more wires meeting.
    const junctions = pins
      .filter((p) => p.y > top && p.y < bottom)
      .map((p) => ({ x, y: p.y }));

    nets.push({ netId: net.id, kind: net.kind, segments, junctions, side, lane });
  }

  return { width, height, components, rails, nets, warnings };
}
