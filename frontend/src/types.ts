/**
 * The API's response shapes.
 *
 * These mirror `backend/schemas.py` field for field. That file is the schema
 * the model is constrained to; this one is what the renderer reads. They are
 * two halves of one contract, and the backend's `test_schemas.py` pins the
 * field names so a rename there fails CI rather than blanking a screen here.
 */

export type ComponentKind =
  | "resistor" | "capacitor" | "polarized_capacitor" | "inductor"
  | "diode" | "led" | "zener" | "transistor_npn" | "transistor_pnp"
  | "mosfet_n" | "mosfet_p" | "ic" | "switch" | "button" | "potentiometer"
  | "photoresistor" | "battery" | "power_supply" | "ground" | "motor"
  | "speaker" | "crystal" | "header" | "wire_junction" | "other";

export type CircuitComponent = {
  /** Reference designator, unique within the circuit — "R1", "U1", "LED1". */
  id: string;
  kind: ComponentKind;
  label: string;
  value: string;
  /** Named pins in datasheet order. Connections reference these by name. */
  pins: string[];
  notes: string;
};

export type PinRef = {
  component_id: string;
  pin: string;
};

export type Net = {
  id: string;
  kind: "power" | "ground" | "signal";
  connections: PinRef[];
};

export type PartsLine = {
  part: string;
  quantity: number;
  designators: string[];
  note: string;
};

export type WiringStep = {
  step: number;
  instruction: string;
  involves: string[];
};

/** A generated circuit. `nets` is the netlist the diagram renderer lays out. */
export type Circuit = {
  title: string;
  summary: string;
  supply_voltage: string;
  components: CircuitComponent[];
  nets: Net[];
  parts_list: PartsLine[];
  wiring_steps: WiringStep[];
  cautions: string[];
};

export type Confidence = "high" | "medium" | "low";

export type LikelyCause = {
  rank: number;
  cause: string;
  reasoning: string;
  confidence: Confidence;
  how_to_check: string;
  fix_steps: string[];
};

/** A diagnosis from a board photo. */
export type Diagnosis = {
  observation: string;
  image_quality: "clear" | "usable" | "poor";
  likely_causes: LikelyCause[];
  /** What the photo genuinely could not settle. Never empty for a real photo. */
  cannot_tell_from_photo: string[];
  next_measurement: string;
  cautions: string[];
};

/**
 * One saved piece of work. `kind` discriminates the union: the backend stores
 * both in one collection so the history list is a single reverse-chronological
 * query.
 */
export type TraceSession =
  | {
      session_id: string;
      kind: "debug";
      title: string;
      prompt: { symptom: string; context: string };
      result: Diagnosis;
      notes: string;
      created_at: string;
      updated_at: string;
    }
  | {
      session_id: string;
      kind: "circuit";
      title: string;
      prompt: { description: string };
      result: Circuit;
      notes: string;
      created_at: string;
      updated_at: string;
    };

/** The history list omits `result` — see the projection in `list_sessions`. */
export type SessionSummary = Omit<TraceSession, "result">;

export type Entitlement = {
  free_credits_used: number;
  free_credits_remaining: number;
  paid_credits: number;
  total_available: number;
  is_unlimited: boolean;
  unlimited_until: string | null;
  is_trace_unlimited: boolean;
};
