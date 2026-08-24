/**
 * Draws the geometry from `src/circuit/layout.ts`.
 *
 * Deliberately thin: every decision about *where* something goes lives in the
 * layout module, which is pure and can be checked without a renderer
 * (`npm run diagram:check`). This file only turns numbers into SVG, so a
 * layout bug is reproducible in node rather than only on a device.
 *
 * The canvas scales to the container's width and keeps its aspect ratio, so the
 * diagram is as wide as the screen and as tall as it needs to be. It is tall —
 * a ten-component circuit runs past a screen height — which is the tradeoff the
 * rail-and-ladder layout makes deliberately: vertical space is the thing a
 * phone has, and the page already scrolls.
 */
import { useState } from "react";
import { LayoutChangeEvent, StyleSheet, View } from "react-native";
import Svg, { Circle, G, Line, Rect, Text as SvgText } from "react-native-svg";

import type { CircuitLayout, LaidOutPin } from "@/src/circuit/layout";
import { colors, fonts } from "@/src/theme";
import { Net } from "@/src/types";

const WIRE_COLOR: Record<Net["kind"], string> = {
  power: colors.warning,
  ground: colors.onSurfaceTertiary,
  signal: colors.brandTertiary,
};

const WIRE_WIDTH = 1.5;
const RAIL_WIDTH = 2;
const PIN_RADIUS = 2;
const JUNCTION_RADIUS = 2.6;

/** Pin labels sit inside the box, clear of the edge they attach to. */
function pinLabelProps(pin: LaidOutPin) {
  switch (pin.side) {
    case "left":
      return { x: pin.x + 5, y: pin.y - 4, anchor: "start" as const };
    case "right":
      return { x: pin.x - 5, y: pin.y - 4, anchor: "end" as const };
    case "top":
      return { x: pin.x, y: pin.y + 11, anchor: "middle" as const };
    default:
      return { x: pin.x, y: pin.y - 5, anchor: "middle" as const };
  }
}

/**
 * `layout` is passed in rather than computed here so the caller — which also
 * wants `layout.warnings` — runs `layoutCircuit` once, under its own `useMemo`.
 */
export function CircuitDiagram({ layout }: { layout: CircuitLayout }) {
  const [containerWidth, setContainerWidth] = useState(0);

  const onLayout = (e: LayoutChangeEvent) => setContainerWidth(e.nativeEvent.layout.width);

  // Until the container reports a width there is nothing to scale to. Reserving
  // the right height up front stops the page jumping when it arrives.
  const scale = containerWidth > 0 ? containerWidth / layout.width : 0;
  const renderedHeight = scale > 0 ? layout.height * scale : 200;

  return (
    <View style={styles.frame} onLayout={onLayout} testID="circuit-diagram">
      {scale > 0 && (
        <Svg
          width={containerWidth}
          height={renderedHeight}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
        >
          {/* Wires first, boxes over them: a box is opaque, so anything routed
              underneath one would read as connecting to it. The layout module
              guarantees nothing is routed under a box — this order is what
              makes a regression there visible rather than silently plausible. */}
          <G>
            {layout.rails.map((rail) => (
              <G key={`rail-${rail.netId}`}>
                <Line
                  x1={rail.x1}
                  y1={rail.y}
                  x2={rail.x2}
                  y2={rail.y}
                  stroke={WIRE_COLOR[rail.kind]}
                  strokeWidth={RAIL_WIDTH}
                />
                <SvgText
                  x={4}
                  y={rail.y - 6}
                  fill={WIRE_COLOR[rail.kind]}
                  fontFamily={fonts.mono}
                  fontSize={10}
                >
                  {rail.netId}
                </SvgText>
              </G>
            ))}

            {layout.nets.map((net) => {
              const color = WIRE_COLOR[net.kind];
              return (
                <G key={`net-${net.netId}`}>
                  {net.segments.map(([x1, y1, x2, y2], i) => (
                    <Line
                      key={i}
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={color}
                      strokeWidth={WIRE_WIDTH}
                      strokeLinecap="round"
                    />
                  ))}
                  {net.junctions.map((j, i) => (
                    // A solder dot. Its absence at a crossing is what says the
                    // two wires do not connect — the schematic convention this
                    // whole drawing leans on.
                    <Circle key={i} cx={j.x} cy={j.y} r={JUNCTION_RADIUS} fill={color} />
                  ))}
                  {/* Rails carry their name on the rail itself, so only signal
                      trunks are labelled here. */}
                  {net.kind === "signal" && net.segments.length > 0 && (
                    <SvgText
                      x={net.segments[0][0]}
                      y={net.segments[0][1] - 5}
                      fill={color}
                      fontFamily={fonts.mono}
                      fontSize={8}
                      textAnchor="middle"
                    >
                      {net.netId}
                    </SvgText>
                  )}
                </G>
              );
            })}
          </G>

          <G>
            {layout.components.map((component) => (
              <G key={component.id}>
                <Rect
                  x={component.x}
                  y={component.y}
                  width={component.width}
                  height={component.height}
                  rx={6}
                  fill={colors.surfaceSecondary}
                  stroke={colors.border}
                  strokeWidth={1}
                />
                <SvgText
                  x={component.x + component.width / 2}
                  y={component.y + component.height / 2 - 2}
                  fill={colors.onSurface}
                  fontFamily={fonts.sansBold}
                  fontSize={12}
                  textAnchor="middle"
                >
                  {component.id}
                </SvgText>
                <SvgText
                  x={component.x + component.width / 2}
                  y={component.y + component.height / 2 + 11}
                  fill={colors.onSurfaceTertiary}
                  fontFamily={fonts.sans}
                  fontSize={9}
                  textAnchor="middle"
                >
                  {[component.label, component.value].filter(Boolean).join(" · ")}
                </SvgText>

                {component.pins.map((pin) => {
                  const label = pinLabelProps(pin);
                  return (
                    <G key={pin.pin}>
                      <Circle
                        cx={pin.x}
                        cy={pin.y}
                        r={PIN_RADIUS}
                        // An unconnected pin is drawn in the error colour rather
                        // than omitted: a pin the netlist forgot is exactly what
                        // someone debugging their build needs to spot.
                        fill={pin.netId ? colors.onSurface : colors.error}
                      />
                      <SvgText
                        x={label.x}
                        y={label.y}
                        fill={colors.onSurfaceTertiary}
                        fontFamily={fonts.mono}
                        fontSize={8}
                        textAnchor={label.anchor}
                      >
                        {pin.pin}
                      </SvgText>
                    </G>
                  );
                })}
              </G>
            ))}
          </G>
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    overflow: "hidden",
  },
});
