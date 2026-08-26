/**
 * The generated-circuit view.
 *
 * The netlist warnings are the point here. Structured output guarantees the
 * response parses; it cannot guarantee the circuit is coherent, and a diagram
 * with a wire missing looks every bit as authoritative as a correct one.
 */
import { render, screen } from "@testing-library/react-native";

import { CircuitResult } from "@/src/components/CircuitResult";
import type { Circuit } from "@/src/types";

const blinker: Circuit = {
  title: "555 astable LED blinker",
  summary: "Free-running 555 flashing an LED at roughly 1 Hz.",
  supply_voltage: "9V",
  components: [
    { id: "R1", kind: "resistor", label: "Resistor", value: "10k", pins: ["1", "2"], notes: "" },
    { id: "LED1", kind: "led", label: "LED", value: "red", pins: ["A", "K"], notes: "" },
  ],
  nets: [
    { id: "VCC", kind: "power", connections: [{ component_id: "R1", pin: "1" }] },
    {
      id: "N1",
      kind: "signal",
      connections: [
        { component_id: "R1", pin: "2" },
        { component_id: "LED1", pin: "A" },
      ],
    },
    { id: "GND", kind: "ground", connections: [{ component_id: "LED1", pin: "K" }] },
  ],
  parts_list: [
    { part: "10k resistor", quantity: 1, designators: ["R1"], note: "" },
    { part: "Red LED", quantity: 1, designators: ["LED1"], note: "Any 5mm will do" },
  ],
  wiring_steps: [
    { step: 1, instruction: "Put R1 between the positive rail and row 10.", involves: ["R1"] },
    { step: 2, instruction: "LED anode to row 10, cathode to ground.", involves: ["LED1"] },
  ],
  cautions: [],
};

it("renders the diagram", () => {
  render(<CircuitResult circuit={blinker} />);
  expect(screen.getByTestId("circuit-diagram")).toBeTruthy();
});

it("shows the parts list and wiring steps", () => {
  render(<CircuitResult circuit={blinker} />);
  expect(screen.getByText("10k resistor")).toBeTruthy();
  expect(screen.getByText("Any 5mm will do")).toBeTruthy();
  expect(screen.getByText(/Put R1 between the positive rail/)).toBeTruthy();
});

it("shows the counts even when there is no supply voltage", () => {
  // `supply_voltage` is an empty string for circuits where it doesn't apply,
  // and the counts used to disappear along with the voltage chip.
  render(<CircuitResult circuit={{ ...blinker, supply_voltage: "" }} />);
  expect(screen.getByText("2 parts")).toBeTruthy();
  expect(screen.getByText("3 nets")).toBeTruthy();
});

it("surfaces safety cautions", () => {
  render(
    <CircuitResult
      circuit={{ ...blinker, cautions: ["The LED has no series resistor — it will fail."] }}
    />,
  );
  expect(screen.getByTestId("circuit-cautions")).toBeTruthy();
});

it("flags a netlist naming a pin the component does not have", () => {
  const broken: Circuit = {
    ...blinker,
    nets: [
      ...blinker.nets,
      { id: "N9", kind: "signal", connections: [
        { component_id: "R1", pin: "99" },
        { component_id: "LED1", pin: "A" },
      ] },
    ],
  };
  render(<CircuitResult circuit={broken} />);
  expect(screen.getByTestId("circuit-netlist-warnings")).toBeTruthy();
  expect(screen.getByText(/which R1 doesn't have/)).toBeTruthy();
});

it("flags a component nothing connects to", () => {
  const orphaned: Circuit = {
    ...blinker,
    components: [
      ...blinker.components,
      { id: "C9", kind: "capacitor", label: "Cap", value: "1uF", pins: ["1", "2"], notes: "" },
    ],
  };
  render(<CircuitResult circuit={orphaned} />);
  expect(screen.getByText(/C9 \(Cap\) isn't connected to anything/)).toBeTruthy();
});

it("shows no warning banner for a coherent netlist", () => {
  // Every pin on exactly one net, every net with two or more ends, every
  // component reachable. If this ever warns, the warning is a false positive.
  const sound: Circuit = {
    title: "LED and series resistor",
    summary: "",
    supply_voltage: "5V",
    components: [
      { id: "BAT1", kind: "battery", label: "Cell", value: "5V", pins: ["+", "-"], notes: "" },
      { id: "R1", kind: "resistor", label: "Resistor", value: "220R", pins: ["1", "2"], notes: "" },
      { id: "LED1", kind: "led", label: "LED", value: "red", pins: ["A", "K"], notes: "" },
    ],
    nets: [
      { id: "VCC", kind: "power", connections: [
        { component_id: "BAT1", pin: "+" }, { component_id: "R1", pin: "1" }] },
      { id: "N1", kind: "signal", connections: [
        { component_id: "R1", pin: "2" }, { component_id: "LED1", pin: "A" }] },
      { id: "GND", kind: "ground", connections: [
        { component_id: "LED1", pin: "K" }, { component_id: "BAT1", pin: "-" }] },
    ],
    parts_list: [],
    wiring_steps: [],
    cautions: [],
  };

  render(<CircuitResult circuit={sound} />);
  expect(screen.queryByTestId("circuit-netlist-warnings")).toBeNull();
});

it("renders an empty circuit without crashing", () => {
  render(
    <CircuitResult
      circuit={{
        title: "Nothing", summary: "", supply_voltage: "",
        components: [], nets: [], parts_list: [], wiring_steps: [], cautions: [],
      }}
    />,
  );
  expect(screen.getByTestId("circuit-result")).toBeTruthy();
});
