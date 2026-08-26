/**
 * The diagnosis view.
 *
 * The product promise is that Trace doesn't assert certainty it lacks. The
 * schema makes `cannot_tell_from_photo` required; this makes sure the view
 * actually renders it, since a required field nobody displays is not a promise
 * kept.
 */
import { render, screen } from "@testing-library/react-native";

import { DiagnosisResult } from "@/src/components/DiagnosisResult";
import type { Diagnosis } from "@/src/types";

const base: Diagnosis = {
  observation: "A 555 on a half-size breadboard, LED in the bottom rail.",
  image_quality: "clear",
  likely_causes: [
    {
      rank: 1,
      cause: "LED is in backwards",
      reasoning: "The flat edge faces the supply rail.",
      confidence: "medium",
      how_to_check: "Turn the LED around and retest.",
      fix_steps: ["Pull the LED", "Reseat with the flat edge to ground"],
    },
    {
      rank: 2,
      cause: "Missing series resistor",
      reasoning: "No resistor visible between pin 3 and the LED.",
      confidence: "low",
      how_to_check: "Measure resistance from pin 3 to the anode.",
      fix_steps: ["Add a 470R resistor in series"],
    },
  ],
  cannot_tell_from_photo: [
    "Whether the jumper under the IC actually makes contact",
    "Whether the battery is still good",
  ],
  next_measurement: "Measure across the LED with the supply on.",
  cautions: [],
};

it("always shows what the photo could not settle", () => {
  render(<DiagnosisResult diagnosis={base} />);
  expect(screen.getByTestId("diagnosis-limits")).toBeTruthy();
  expect(screen.getByText(/Whether the battery is still good/)).toBeTruthy();
});

it("leads with the next measurement, not the reasoning", () => {
  render(<DiagnosisResult diagnosis={base} />);
  expect(screen.getByTestId("diagnosis-next-measurement")).toBeTruthy();
  expect(screen.getByText("Measure across the LED with the supply on.")).toBeTruthy();
});

it("renders every ranked cause", () => {
  render(<DiagnosisResult diagnosis={base} />);
  expect(screen.getByTestId("cause-1")).toBeTruthy();
  expect(screen.getByTestId("cause-2")).toBeTruthy();
});

it("expands the top cause and leaves the rest collapsed", () => {
  render(<DiagnosisResult diagnosis={base} />);
  // Rank 1's detail is visible on arrival...
  expect(screen.getByText("The flat edge faces the supply rail.")).toBeTruthy();
  // ...rank 2's is a tap away.
  expect(screen.queryByText("No resistor visible between pin 3 and the LED.")).toBeNull();
});

it("renders confidence as words rather than a raw enum", () => {
  render(<DiagnosisResult diagnosis={base} />);
  expect(screen.getByText("Possible")).toBeTruthy(); // medium
  expect(screen.getByText("Long shot")).toBeTruthy(); // low
});

it("surfaces safety cautions", () => {
  render(
    <DiagnosisResult
      diagnosis={{ ...base, cautions: ["That electrolytic is in backwards — it can vent."] }}
    />,
  );
  expect(screen.getByTestId("diagnosis-cautions")).toBeTruthy();
});

it("warns when the photo is too poor to lean on", () => {
  render(<DiagnosisResult diagnosis={{ ...base, image_quality: "poor" }} />);
  expect(screen.getByTestId("diagnosis-quality")).toBeTruthy();
});

it("shows no quality warning for a clear photo", () => {
  render(<DiagnosisResult diagnosis={base} />);
  expect(screen.queryByTestId("diagnosis-quality")).toBeNull();
});

it("renders without crashing when the model returns no causes", () => {
  render(<DiagnosisResult diagnosis={{ ...base, likely_causes: [] }} />);
  expect(screen.getByTestId("diagnosis-result")).toBeTruthy();
  expect(screen.queryByText(/^Likely causes/)).toBeNull();
});
