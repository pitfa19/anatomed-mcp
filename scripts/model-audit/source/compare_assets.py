"""Compare every original object to literal GLB nodes and catalog records.

Candidate normalization only case-folds and collapses whitespace. It never
removes auxiliary/laterality/numeric suffixes or claims anatomical identity.
"""
import argparse
from collections import Counter, defaultdict
import json
from pathlib import Path
import struct

from run_inventory import digest

SYSTEMS = ("skeleton", "muscles", "nerves", "vessels", "organs", "joints", "insertions", "regions")
# Collection routing is a reporting hint, never an object identity match.
COLLECTION_RULES = {
    "skeleton": ["1: Skeletal system", "Skeletal system"],
    "muscles": ["4: Muscular system", "Muscular system"],
    "nerves": ["7: Nervous system & Sense organs", "Nervous system"],
    "vessels": ["5: Cardiovascular system", "Cardiovascular system"],
    "organs": ["8: Visceral systems", "Visceral systems"],
    "joints": ["3: Joints", "Arthrology"],
    "insertions": ["2: Muscular insertions", "Muscular insertions"],
    "regions": ["9: Regions of human body", "Regions of human body"]}


def normalize(name):
    return " ".join(name.casefold().split())


def read_glb(path):
    raw = path.read_bytes()
    if len(raw) < 20:
        raise ValueError(f"Truncated GLB: {path}")
    magic, version, length = struct.unpack_from("<4sII", raw)
    if magic != b"glTF" or version != 2 or length != len(raw):
        raise ValueError(f"Invalid GLB header: {path}")
    offset, document = 12, None
    while offset < len(raw):
        if offset + 8 > len(raw):
            raise ValueError("Truncated GLB chunk header")
        size, kind = struct.unpack_from("<II", raw, offset)
        offset += 8
        if size % 4 or offset + size > len(raw):
            raise ValueError("Invalid GLB chunk length")
        if kind == 0x4E4F534A:
            if document is not None:
                raise ValueError("Multiple GLB JSON chunks")
            document = json.loads(raw[offset:offset + size].decode("utf-8"))
        offset += size
    if document is None:
        raise ValueError("Missing GLB JSON chunk")
    return document


def descendant_meshes(nodes, index, ancestors=()):
    if index in ancestors:
        raise ValueError("Cycle in GLB node hierarchy")
    if not 0 <= index < len(nodes):
        raise ValueError("Invalid GLB child node index")
    result = []
    for child in nodes[index].get("children", []):
        if not 0 <= child < len(nodes):
            raise ValueError("Invalid GLB child node index")
        if "mesh" in nodes[child]:
            result.append(child)
        result.extend(descendant_meshes(nodes, child, ancestors + (index,)))
    return sorted(set(result))


def index_rows(rows):
    exact, normalized = defaultdict(list), defaultdict(list)
    for row in rows:
        if row["name"] is not None:
            exact[row["name"]].append(row)
            normalized[normalize(row["name"])].append(row)
    return exact, normalized


def lookup(name, indexes):
    exact, normalized = indexes
    return {"exact": exact.get(name, []),
            "normalized_candidates": [r for r in normalized.get(normalize(name), []) if r["name"] != name]}


def system_hints(obj):
    labels = {piece.casefold() for path in obj["collection_paths"] for piece in path}
    return sorted(system for system, words in COLLECTION_RULES.items()
                  if any(word.casefold() in labels for word in words))


def compare(inventory, assets):
    catalog_path = assets / "parts-catalog.json"
    catalog = json.loads(catalog_path.read_text())
    parts = [{"catalog_index": i, "name": p["id"], "system": p["system"],
              "name_en": p.get("name_en"), "side": p.get("side")} for i, p in enumerate(catalog["parts"])]
    nodes, files = [], []
    for system in SYSTEMS:
        path = assets / "glb" / f"{system}.glb"
        doc = read_glb(path)
        current = [{"system": system, "node_index": i, "name": node.get("name"),
                    "mesh_index": node.get("mesh"), "children": node.get("children", []),
                    "descendant_mesh_node_indices": descendant_meshes(doc.get("nodes", []), i)}
                   for i, node in enumerate(doc.get("nodes", []))]
        nodes.extend(current)
        files.append({"system": system, "path": str(path), "sha256": digest(path),
            "nodes": len(current), "mesh_nodes": sum(n["mesh_index"] is not None for n in current),
            "unnamed_nodes": sum(n["name"] is None for n in current), "meshes": len(doc.get("meshes", [])),
            "catalog_parts": sum(p["system"] == system for p in parts)})
    node_indexes, part_indexes = index_rows(nodes), index_rows(parts)
    rows = []
    for obj in inventory["objects"]:
        glb = lookup(obj["name"], node_indexes)
        cat = lookup(obj["name"], part_indexes)
        hints = system_hints(obj)
        match_status = "exact" if glb["exact"] else "normalized_candidates_only" if glb["normalized_candidates"] else "no_name_candidate"
        rows.append({"source_name": obj["name"], "type": obj["type"], "collection_paths": obj["collection_paths"],
            "collection_system_hints": hints, "unknown_unmapped_collections": not bool(hints),
            "helper_exclusion": obj["converter_helper_exclusion"],
            "geometry_classification": obj["geometry_classification"],
            "enabled_vertices": obj["evaluated_enabled"].get("vertices"),
            "enabled_faces": obj["evaluated_enabled"].get("faces"),
            "glb": glb, "catalog": cat, "glb_name_status": match_status,
            "glb_geometry_evidence": "exact_named_mesh" if any(n["mesh_index"] is not None for n in glb["exact"]) else
                "exact_named_container_with_mesh_descendants" if any(n["descendant_mesh_node_indices"] for n in glb["exact"]) else
                "exact_named_node_without_geometry" if glb["exact"] else
                "normalized_candidates_only" if glb["normalized_candidates"] else "no_name_candidate",
            "glb_mesh_name_status": "exact" if any(n["mesh_index"] is not None for n in glb["exact"]) else
                "normalized_candidates_only" if any(n["mesh_index"] is not None for n in glb["normalized_candidates"]) else "no_mesh_name_candidate"})
    source_indexes = index_rows([{"name": o["name"], "type": o["type"]} for o in inventory["objects"]])
    missing = [r for r in rows if r["glb_mesh_name_status"] == "no_mesh_name_candidate"
               and not r["helper_exclusion"]["excluded"] and (r["enabled_vertices"] or 0) > 0]
    missing_geometry = [r for r in missing if r["glb_geometry_evidence"] not in {"exact_named_mesh", "exact_named_container_with_mesh_descendants"}]
    counts = {"source_objects": len(rows), "source_type_counts": dict(Counter(r["type"] for r in rows)),
        "glb_nodes": len(nodes), "glb_mesh_nodes": sum(n["mesh_index"] is not None for n in nodes),
        "catalog_parts": len(parts), "glb_name_status": dict(Counter(r["glb_name_status"] for r in rows)),
        "glb_mesh_name_status": dict(Counter(r["glb_mesh_name_status"] for r in rows)),
        "helper_excluded": sum(r["helper_exclusion"]["excluded"] for r in rows),
        "unknown_collection_mapping": sum(r["unknown_unmapped_collections"] for r in rows),
        "nonhelper_nonempty_without_glb_mesh_name_candidate": len(missing),
        "nonhelper_nonempty_without_named_geometry_evidence": len(missing_geometry),
        "glb_geometry_evidence": dict(Counter(r["glb_geometry_evidence"] for r in rows)),
        "nonhelper_missing_by_collection_hint": dict(Counter(s for r in missing for s in (r["collection_system_hints"] or ["unknown"]))),
        "geometry_classification": inventory["counts"]["geometry_classification"],
        "catalog_name_status": dict(Counter("exact" if r["catalog"]["exact"] else "normalized_candidates_only" if r["catalog"]["normalized_candidates"] else "no_name_candidate" for r in rows))}
    return {"schema_version": 1, "source_blend_sha256": inventory["blend"]["sha256_before"],
        "normalization_policy": "Unicode casefold + whitespace collapse only. All punctuation, laterality, auxiliary and numeric suffixes are retained. Candidates are not verified identity.",
        "collection_system_rules": COLLECTION_RULES,
        "collection_system_rules_warning": "exact named collection routing hints only, not exporter provenance or anatomical identity. Multiple paths can yield multiple systems, so counts by hint overlap. Unknowns retained.",
        "files": files, "catalog": {"path": str(catalog_path), "sha256": digest(catalog_path)},
        "counts": counts, "objects": rows,
        "glb_nodes": [{**n, "source": lookup(n["name"], source_indexes) if n["name"] is not None else None,
                       "catalog": lookup(n["name"], part_indexes) if n["name"] is not None else None} for n in nodes],
        "catalog_parts": [{**p, "source": lookup(p["name"], source_indexes), "glb": lookup(p["name"], node_indexes)} for p in parts],
        "nonhelper_nonempty_without_glb_mesh_name_candidate": missing,
        "nonhelper_nonempty_without_named_geometry_evidence": missing_geometry}


def validate(inventory, mapping):
    objects = inventory["objects"]
    assert len(objects) == inventory["counts"]["objects"] == mapping["counts"]["source_objects"]
    assert len({o["name"] for o in objects}) == len(objects)
    assert {o["name"] for o in objects} == {o["source_name"] for o in mapping["objects"]}
    assert sum(mapping["counts"]["glb_name_status"].values()) == len(objects)
    assert inventory["blend"]["sha256_before"] == inventory["blend"]["sha256_after"]
    assert len(mapping["files"]) == 8
    names = {o["name"] for o in objects}
    for coll in inventory["collections"]:
        assert set(coll["direct_objects"]) <= names
    for obj in objects:
        assert "evaluated_enabled" in obj and "evaluated_original" in obj
        assert obj["parent"] is None or obj["parent"] in names
        ev = obj["evaluated_enabled"]
        if obj["type"] in {"MESH", "CURVE", "SURFACE", "FONT", "META"}:
            assert ev["included_in_view_layer"]
            assert ev.get("is_evaluated") is True or ev["status"] in {"error", "no_mesh_returned"}
        if ev.get("vertices", 0):
            assert ev["bounds"]["local"] and ev["bounds"]["world"]
        for mode in ("evaluated_original", "evaluated_enabled"):
            if obj[mode]["status"] == "error":
                assert obj[mode]["error"]
    return {"status": "passed", "source_objects": len(objects), "glb_files": 8,
            "checks": ["source count and unique names", "complete mapping coverage", "match category conservation", "source checksum unchanged", "collection object references", "parent references", "geometry extraction statuses", "enabled layer inclusion", "nonempty bounding boxes"]}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--inventory", type=Path, required=True)
    p.add_argument("--assets", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    args = p.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    inv = json.loads(args.inventory.read_text())
    mapping = compare(inv, args.assets)
    checks = validate(inv, mapping)
    for filename, data in (("mapping.json", mapping), ("summary.json", {"counts": mapping["counts"], "files": mapping["files"]}), ("validation.json", checks)):
        (args.output / filename).write_text(json.dumps(data, indent=2, allow_nan=False) + "\n")
    print(json.dumps(mapping["counts"], indent=2))
    print(json.dumps(checks))


if __name__ == "__main__":
    main()
