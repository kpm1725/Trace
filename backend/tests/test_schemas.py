"""Structured-output schemas.

The API rejects a schema whose objects omit `additionalProperties: false` or
leave a property out of `required`, and it does so at request time — which means
a malformed schema here surfaces as a 400 on a paid user's first tap rather than
at import. These walk the schemas so the failure lands in CI instead.

`test_circuit_schema_matches_renderer_contract` is the one that matters
long-term: it pins the field names the diagram renderer reads, so removing or
renaming one fails here rather than rendering a blank canvas.
"""
import pytest

from schemas import CIRCUIT_SCHEMA, COMPONENT_KINDS, DIAGNOSIS_SCHEMA


def walk_objects(schema, path="root"):
    """Yield (path, subschema) for every object-typed node in a JSON Schema."""
    if not isinstance(schema, dict):
        return
    if schema.get("type") == "object":
        yield path, schema
    for key, value in schema.get("properties", {}).items():
        yield from walk_objects(value, f"{path}.{key}")
    if "items" in schema:
        yield from walk_objects(schema["items"], f"{path}[]")


@pytest.mark.parametrize("name,schema", [
    ("CIRCUIT_SCHEMA", CIRCUIT_SCHEMA),
    ("DIAGNOSIS_SCHEMA", DIAGNOSIS_SCHEMA),
])
def test_every_object_is_closed_and_fully_required(name, schema):
    for path, node in walk_objects(schema, name):
        assert node.get("additionalProperties") is False, \
            f"{path} must set additionalProperties: false"
        props = set(node.get("properties", {}))
        required = set(node.get("required", []))
        assert props == required, (
            f"{path}: every property must be required. "
            f"missing from required: {sorted(props - required)}; "
            f"required but undefined: {sorted(required - props)}"
        )


@pytest.mark.parametrize("name,schema", [
    ("CIRCUIT_SCHEMA", CIRCUIT_SCHEMA),
    ("DIAGNOSIS_SCHEMA", DIAGNOSIS_SCHEMA),
])
def test_every_field_is_described(name, schema):
    """A field with no description is a field the model has to guess at."""
    for path, node in walk_objects(schema, name):
        for key, prop in node.get("properties", {}).items():
            assert prop.get("description") or prop.get("enum"), \
                f"{path}.{key} needs a description or an enum"


def test_circuit_schema_matches_renderer_contract():
    """Field names the diagram renderer reads. Renaming one breaks the canvas."""
    assert set(CIRCUIT_SCHEMA["required"]) == {
        "title", "summary", "supply_voltage", "components",
        "nets", "parts_list", "wiring_steps", "cautions",
    }
    component = CIRCUIT_SCHEMA["properties"]["components"]["items"]
    assert set(component["required"]) == {"id", "kind", "label", "value", "pins", "notes"}
    assert component["properties"]["kind"]["enum"] is COMPONENT_KINDS

    net = CIRCUIT_SCHEMA["properties"]["nets"]["items"]
    assert set(net["required"]) == {"id", "kind", "connections"}
    assert set(net["properties"]["kind"]["enum"]) == {"power", "ground", "signal"}

    pin_ref = net["properties"]["connections"]["items"]
    assert set(pin_ref["required"]) == {"component_id", "pin"}


def test_component_kinds_include_a_fallback():
    """A part outside the glyph table must still be representable.

    Without "other" the model has to force an unusual part into a wrong kind,
    which draws the wrong symbol — worse than drawing a generic box.
    """
    assert "other" in COMPONENT_KINDS
    assert len(set(COMPONENT_KINDS)) == len(COMPONENT_KINDS), "duplicate kind"


def test_diagnosis_confidence_is_constrained():
    """Free-text confidence would arrive as 'fairly high' and 'probably'."""
    cause = DIAGNOSIS_SCHEMA["properties"]["likely_causes"]["items"]
    assert set(cause["properties"]["confidence"]["enum"]) == {"high", "medium", "low"}
    assert set(DIAGNOSIS_SCHEMA["properties"]["image_quality"]["enum"]) == \
        {"clear", "usable", "poor"}


def test_diagnosis_requires_an_uncertainty_note():
    """The product promise is that Claude does not assert certainty it lacks.

    `cannot_tell_from_photo` being required is the mechanism: the model cannot
    return a diagnosis without also stating what the photo could not settle.
    """
    assert "cannot_tell_from_photo" in DIAGNOSIS_SCHEMA["required"]
    assert DIAGNOSIS_SCHEMA["properties"]["cannot_tell_from_photo"]["type"] == "array"
