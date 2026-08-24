"""Claude API client and prompts.

Every model call in Trace goes through this module. Routes stay thin: they
authorise, meter, and persist — the prompt text, the model id, the schema, and
the response parsing live here, so changing a prompt never means touching a
route.

Two calls, both on `claude-sonnet-5` (same model Scribe runs):

  `diagnose_photo`   — vision. Board photo plus a symptom, in; a ranked
                       diagnosis, out.
  `generate_circuit` — text. A plain-English description, in; a netlist,
                       parts list and wiring steps, out.

Both use structured outputs (`output_config.format`), which is the one place
this file deliberately departs from Scribe. Scribe asks for JSON in the prompt
and parses whatever comes back, which is fine when the payload is prose that
happens to be structured. Here the payload drives a renderer: a missing `nets`
key is a blank screen, not a cosmetic problem. `output_config` makes the API
enforce the schema instead of the prompt asking nicely.
"""
import json
import logging
import os
from typing import Any, Dict, Optional

import anthropic

from schemas import CIRCUIT_SCHEMA, DIAGNOSIS_SCHEMA

log = logging.getLogger("trace")

# Sonnet 5 — matches Scribe's `claude-sonnet-5`, and the vision and structured
# output paths below are both supported on it. Named once here so a model change
# is a one-line change.
MODEL = "claude-sonnet-5"

# Claude accepts these image types. The client resizes and re-encodes before
# upload (see frontend/app/debug.tsx) — the API's per-image ceiling is ~5MB of
# base64, and an unresized modern phone photo clears that on its own.
SUPPORTED_MEDIA_TYPES = ("image/jpeg", "image/png", "image/gif", "image/webp")

client = anthropic.AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])


class AIError(Exception):
    """A model call failed or returned something unusable.

    Routes translate this to a 502. It exists so a caller can tell an upstream
    failure apart from a bug in this module's own parsing.
    """


def extract_text_block(resp) -> str:
    """Pull the text out of a response, skipping any non-text blocks.

    Anthropic responses can carry ThinkingBlock objects ahead of the TextBlock,
    and `resp.content[0].text` throws the moment one appears. Trace does not
    currently enable extended thinking, so today this always finds the first
    block — the guard is here because the failure it prevents shows up only
    after someone turns thinking on, by which time the crash looks unrelated to
    the change that caused it. Scribe carries the identical helper.

    If thinking is ever enabled on Sonnet 5, the parameter is
    `thinking={"type": "adaptive"}` — the older `budget_tokens` form is rejected
    with a 400 on this model.
    """
    if not resp.content:
        return ""
    for block in resp.content:
        if getattr(block, "type", None) == "text":
            return block.text
    return ""


def _parse_structured(resp) -> Dict[str, Any]:
    """Read the JSON body of a structured-output response.

    `output_config.format` guarantees the text block parses and matches the
    schema, so this raises rather than repairing: a JSONDecodeError here means
    the response was truncated by `max_tokens`, which is a real failure and not
    something to paper over with a partial object.
    """
    text = extract_text_block(resp)
    if not text:
        raise AIError("Model returned no text content")
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        log.error("Structured output did not parse (stop_reason=%s): %s",
                  getattr(resp, "stop_reason", None), text[:500])
        raise AIError(f"Model returned malformed JSON: {e}") from e


DIAGNOSE_SYSTEM_PROMPT = """You are an experienced electronics bench technician helping a hobbyist debug a circuit from a photograph and a description of the symptom.

You are looking at a still image. Be precise about the difference between what you can see and what you are inferring:

- Read the photo first. Identify the components, the power path, and the wiring you can actually make out. Say when a region is blurred, cropped, or hidden under a wire.
- Rank causes by how well they explain THIS symptom on THIS board, not by how common they are in general.
- A photo cannot show continuity, a cold solder joint, a blown component, or whether a part is genuine. Never present an inference about those as an observation.
- Set `confidence` honestly per cause. "high" means the photo alone is close to conclusive — a backwards electrolytic, an LED with no series resistor, a jumper in the wrong row. Most causes on most photos are "medium" or "low", and saying so is more useful than false certainty.
- `cannot_tell_from_photo` must list the real limits of this specific image. It is the honest counterpart to the ranking, not boilerplate.
- `how_to_check` must be one concrete action with a multimeter, a visual check, or a substitution — something the user can do in under a minute.
- Raise `cautions` for anything that could hurt the user or destroy a part: mains voltage, a shorted supply, reversed polarity on an electrolytic, a LiPo without protection.

Write for someone who can follow a schematic but does not have your instincts. Short sentences. No preamble."""


GENERATE_SYSTEM_PROMPT = """You are an electronics educator who designs small, correct, buildable hobby circuits.

Given a plain-English description, produce a complete circuit as structured data: components, the netlist connecting them, a parts list, and ordered wiring steps.

- Choose standard, currently purchasable parts and common E12 values. Prefer a 1k resistor over a 987R one.
- The netlist is the source of truth. Every pin that is electrically joined must appear on the same net, and every component pin must appear on exactly one net. A part whose pins are not on any net is a part the builder will leave unconnected.
- Name power and ground nets `VCC` and `GND` and mark their `kind`, so the renderer can draw them as rails rather than as ordinary wires.
- Use real pin names for ICs, in datasheet order — a 555 has GND, TRIG, OUT, RESET, CTRL, THRES, DISCH, VCC. Do not invent a pinout; if you are unsure of a part's pinout, choose a part you are sure of.
- Include current-limiting resistors, decoupling capacitors, and flyback diodes where the design needs them. A circuit that works on paper but destroys an LED is not a correct answer.
- `wiring_steps` build the circuit in an order that a person can actually follow on a breadboard: power rails first, then the IC, then the parts around it.
- Raise `cautions` for anything that could hurt the user or destroy a part.

If the request is ambiguous, choose the most common interpretation, build that, and say what you assumed in `summary`. Do not ask a question back — the user cannot reply to this response."""


async def diagnose_photo(
    image_base64: str,
    media_type: str,
    symptom: str,
    context: Optional[str] = None,
) -> Dict[str, Any]:
    """Diagnose a circuit from a photo and a described symptom.

    `image_base64` is the raw base64 payload with no `data:` URL prefix.
    Returns an object matching DIAGNOSIS_SCHEMA.
    """
    if media_type not in SUPPORTED_MEDIA_TYPES:
        raise AIError(f"Unsupported image type {media_type!r}")

    user_text = f"Symptom: {symptom.strip()}"
    if context and context.strip():
        user_text += f"\n\nWhat I've already tried / other context:\n{context.strip()}"
    user_text += "\n\nDiagnose this board."

    try:
        resp = await client.messages.create(
            model=MODEL,
            max_tokens=4096,
            system=DIAGNOSE_SYSTEM_PROMPT,
            messages=[{
                "role": "user",
                # Image before text: the model reads the board, then the
                # question about it.
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": image_base64,
                        },
                    },
                    {"type": "text", "text": user_text},
                ],
            }],
            output_config={"format": {"type": "json_schema", "schema": DIAGNOSIS_SCHEMA}},
        )
    except anthropic.APIError as e:
        raise AIError(str(e)) from e

    data = _parse_structured(resp)
    data["likely_causes"].sort(key=lambda c: c["rank"])
    return data


async def generate_circuit(description: str) -> Dict[str, Any]:
    """Generate a circuit from a plain-English description.

    Returns an object matching CIRCUIT_SCHEMA — components, netlist, parts list
    and wiring steps. No image is generated: the renderer draws the netlist.
    """
    try:
        resp = await client.messages.create(
            model=MODEL,
            max_tokens=8192,
            system=GENERATE_SYSTEM_PROMPT,
            messages=[{
                "role": "user",
                "content": f"Design this circuit:\n\n{description.strip()}",
            }],
            output_config={"format": {"type": "json_schema", "schema": CIRCUIT_SCHEMA}},
        )
    except anthropic.APIError as e:
        raise AIError(str(e)) from e

    data = _parse_structured(resp)
    data["wiring_steps"].sort(key=lambda s: s["step"])
    return data
