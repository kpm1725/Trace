"""JSON Schemas for every structured response Claude returns.

These are the contract between the model and the client renderer, so they live
in one file rather than inline at each call site: the diagram renderer in
`frontend/src/circuit/` is written against `CIRCUIT_SCHEMA` exactly, and a field
added here without a matching renderer change is the failure mode this file
exists to make visible.

Every schema sets `additionalProperties: False` and lists every property in
`required` — both are required by the API's structured-output validator, and
together they mean the client never has to guard for a missing key.
"""

# Kinds the renderer knows how to draw. Anything outside this list would arrive
# as an unrenderable node, so the model is constrained to the set rather than
# being trusted to invent sensible ones. Extend here and in the renderer's glyph
# table together.
COMPONENT_KINDS = [
    "resistor", "capacitor", "polarized_capacitor", "inductor",
    "diode", "led", "zener", "transistor_npn", "transistor_pnp", "mosfet_n", "mosfet_p",
    "ic", "switch", "button", "potentiometer", "photoresistor",
    "battery", "power_supply", "ground", "motor", "speaker", "crystal",
    "header", "wire_junction", "other",
]

CIRCUIT_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string", "description": "Short name for the circuit."},
        "summary": {
            "type": "string",
            "description": "Two or three sentences on what the circuit does and how it works.",
        },
        "supply_voltage": {
            "type": "string",
            "description": "Nominal supply, e.g. '9V' or '5V'. Empty string if not applicable.",
        },
        "components": {
            "type": "array",
            "description": "Every component in the circuit. `id` is referenced by connections.",
            "items": {
                "type": "object",
                "properties": {
                    "id": {
                        "type": "string",
                        "description": "Reference designator, unique within the circuit, e.g. 'R1', 'U1', 'LED1'.",
                    },
                    "kind": {"type": "string", "enum": COMPONENT_KINDS},
                    "label": {"type": "string", "description": "Human-readable name, e.g. '555 timer'."},
                    "value": {
                        "type": "string",
                        "description": "Component value with units, e.g. '10k', '100nF', '1N4148'. Empty if not applicable.",
                    },
                    "pins": {
                        "type": "array",
                        "description": (
                            "Named pins in datasheet order. Two-terminal parts use "
                            "['1','2'] or ['A','K'] for polarized ones; an IC uses its "
                            "real pin names, e.g. ['GND','TRIG','OUT',...]."
                        ),
                        "items": {"type": "string"},
                    },
                    "notes": {
                        "type": "string",
                        "description": "Anything the builder must know about this part. Empty if none.",
                    },
                },
                "required": ["id", "kind", "label", "value", "pins", "notes"],
                "additionalProperties": False,
            },
        },
        "nets": {
            "type": "array",
            "description": (
                "Electrical nodes. Every pin that is wired together shares one net. "
                "This is the netlist the renderer lays out — it is the circuit's "
                "actual topology, independent of any drawing."
            ),
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string", "description": "Net name, e.g. 'VCC', 'GND', 'N1'."},
                    "kind": {
                        "type": "string",
                        "enum": ["power", "ground", "signal"],
                        "description": "Lets the renderer draw rails and grounds conventionally.",
                    },
                    "connections": {
                        "type": "array",
                        "description": "Every pin on this net. Two or more entries.",
                        "items": {
                            "type": "object",
                            "properties": {
                                "component_id": {
                                    "type": "string",
                                    "description": "The `id` of a component in `components`.",
                                },
                                "pin": {
                                    "type": "string",
                                    "description": "One of that component's `pins`, named exactly as listed there.",
                                },
                            },
                            "required": ["component_id", "pin"],
                            "additionalProperties": False,
                        },
                    },
                },
                "required": ["id", "kind", "connections"],
                "additionalProperties": False,
            },
        },
        "parts_list": {
            "type": "array",
            "description": "Shopping list, aggregated by part rather than by designator.",
            "items": {
                "type": "object",
                "properties": {
                    "part": {"type": "string", "description": "e.g. '10k resistor', 'NE555 timer IC'."},
                    "quantity": {
                        "type": "integer",
                        "minimum": 1,
                        "description": "How many to buy — the number of designators this line covers.",
                    },
                    "designators": {
                        "type": "array",
                        "description": "Which component ids this line covers, e.g. ['R1','R2'].",
                        "items": {"type": "string"},
                    },
                    "note": {
                        "type": "string",
                        "description": "Substitutions or tolerance guidance. Empty if none.",
                    },
                },
                "required": ["part", "quantity", "designators", "note"],
                "additionalProperties": False,
            },
        },
        "wiring_steps": {
            "type": "array",
            "description": "Ordered build instructions, one action per step.",
            "items": {
                "type": "object",
                "properties": {
                    "step": {
                        "type": "integer",
                        "minimum": 1,
                        "description": "1-based position in the build order.",
                    },
                    "instruction": {
                        "type": "string",
                        "description": "One action, phrased so it can be followed without reading ahead.",
                    },
                    "involves": {
                        "type": "array",
                        "description": "Component ids this step touches, so the renderer can highlight them.",
                        "items": {"type": "string"},
                    },
                },
                "required": ["step", "instruction", "involves"],
                "additionalProperties": False,
            },
        },
        "cautions": {
            "type": "array",
            "description": (
                "Safety and damage warnings — reversed polarity, missing current "
                "limiting, mains voltage. Empty array when there are genuinely none."
            ),
            "items": {"type": "string"},
        },
    },
    "required": [
        "title", "summary", "supply_voltage", "components",
        "nets", "parts_list", "wiring_steps", "cautions",
    ],
    "additionalProperties": False,
}


DIAGNOSIS_SCHEMA = {
    "type": "object",
    "properties": {
        "observation": {
            "type": "string",
            "description": (
                "What is actually visible in the photo. Written from the image "
                "only — this is the model's read of the board, which the user can "
                "check before trusting anything below it."
            ),
        },
        "image_quality": {
            "type": "string",
            "enum": ["clear", "usable", "poor"],
            "description": (
                "How well the board could be read. 'poor' tells the client to "
                "suggest a better photo instead of leading with the diagnosis."
            ),
        },
        "likely_causes": {
            "type": "array",
            "description": "Ranked most to least likely. At most five.",
            "items": {
                "type": "object",
                "properties": {
                    "rank": {
                        "type": "integer",
                        "minimum": 1,
                        "description": "1 is the most likely cause. Ranks are consecutive and unique.",
                    },
                    "cause": {"type": "string", "description": "One sentence naming the fault."},
                    "reasoning": {
                        "type": "string",
                        "description": "Why this fits the photo and the reported symptom.",
                    },
                    "confidence": {
                        "type": "string",
                        "enum": ["high", "medium", "low"],
                        "description": (
                            "Honest confidence in THIS cause. A photo rarely shows "
                            "continuity or component health, so 'high' should be rare."
                        ),
                    },
                    "how_to_check": {
                        "type": "string",
                        "description": "The single measurement or test that confirms or rules this out.",
                    },
                    "fix_steps": {
                        "type": "array",
                        "description": "What to do if the check confirms it.",
                        "items": {"type": "string"},
                    },
                },
                "required": ["rank", "cause", "reasoning", "confidence", "how_to_check", "fix_steps"],
                "additionalProperties": False,
            },
        },
        "cannot_tell_from_photo": {
            "type": "array",
            "description": (
                "What the image genuinely cannot settle — solder joint quality, a "
                "blown component, wire continuity under the board. Never empty for "
                "a real photo; this is the uncertainty note, not a disclaimer."
            ),
            "items": {"type": "string"},
        },
        "next_measurement": {
            "type": "string",
            "description": "The one thing to measure first, chosen to split the ranked causes fastest.",
        },
        "cautions": {
            "type": "array",
            "description": "Safety or damage warnings visible in the photo. Empty array if none.",
            "items": {"type": "string"},
        },
    },
    "required": [
        "observation", "image_quality", "likely_causes",
        "cannot_tell_from_photo", "next_measurement", "cautions",
    ],
    "additionalProperties": False,
}
