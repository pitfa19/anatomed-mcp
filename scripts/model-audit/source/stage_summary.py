"""Stage evidence from numbered source collections, imported FBX and shipped assets.

This is an exact-name census, not an anatomical identity or rename resolver.
"""
import argparse
from collections import Counter
import json
from pathlib import Path

from compare_assets import SYSTEMS
from run_inventory import digest

PRIMARY = {
    "1: Skeletal system": "skeleton", "2: Muscular insertions": "insertions",
    "3: Joints": "joints", "4: Muscular system": "muscles",
    "5: Cardiovascular system": "vessels", "6: Lymphoid organs": None,
    "7: Nervous system & Sense organs": "nerves", "8: Visceral systems": "organs",
    "9: Regions of human body": "regions"}


def census_difference(left, right):
    """Compare exact name multisets, preserving duplicates and every suffix."""
    a, b = Counter(left), Counter(right)
    return {"left_count": sum(a.values()), "right_count": sum(b.values()),
        "left_unique_names": len(a), "right_unique_names": len(b),
        "exact_name_multisets_equal": a == b,
        "intersection_count": sum((a & b).values()),
        "left_only_names": sorted((a - b).elements()),
        "right_only_names": sorted((b - a).elements())}


def is_primary_member(obj, name):
    # Require the numbered collection directly below a scene's master collection.
    # A same-named nested/Bonus collection is not primary membership.
    return any(len(path) >= 3 and path[0].startswith("scene:") and path[2] == name
               for path in obj["collection_paths"])


def has_exact_geometry(match):
    return match["mesh_index"] is not None or bool(match["descendant_mesh_node_indices"])


def build_stage_summary(inventory, mapping, fbx, catalog):
    map_rows = {r["source_name"]: r for r in mapping["objects"]}
    assert len(map_rows) == len(inventory["objects"])
    fbx_by_system = {}
    for file in fbx["files"]:
        if file["system"] in SYSTEMS:
            if file["system"] in fbx_by_system:
                raise ValueError("Multiple FBX inventories for system " + file["system"])
            fbx_by_system[file["system"]] = file
    if set(fbx_by_system) != set(SYSTEMS):
        raise ValueError("Expected all eight production-system FBX inventories")
    comparisons = []
    for system in SYSTEMS:
        file = fbx_by_system[system]
        selected = [o["name"] for o in file["objects"] if o["originalCatalogRule"]]
        parts = [p["id"] for p in catalog["parts"] if p["system"] == system]
        comparisons.append({"system": system, "fbx_file": file["file"],
            "rule_source": "originalCatalogRule boolean recorded by supplied FBX inventory",
            "fbx_catalog_rule_names": sorted(selected),
            "catalog_names": sorted(parts), **census_difference(selected, parts)})
    source_collections = {c["name"]: c for c in inventory["collections"]}
    primary = []
    for collection_name, system in PRIMARY.items():
        if collection_name not in source_collections:
            raise ValueError("Missing primary source collection " + collection_name)
        all_rows = [o for o in inventory["objects"] if is_primary_member(o, collection_name)]
        selected = [o for o in all_rows if not o["converter_helper_exclusion"]["excluded"]]
        selected_names = {o["name"] for o in selected}
        evidence = []
        for obj in selected:
            mapped = map_rows[obj["name"]]
            exact = mapped["glb"]["exact"]
            same_system = [n for n in exact if n["system"] == system] if system else []
            evidence.append({"source_name": obj["name"], "type": obj["type"],
                "vertices": obj["evaluated_enabled"].get("vertices"),
                "faces": obj["evaluated_enabled"].get("faces"),
                "geometry_classification": obj["geometry_classification"],
                "exact_glb_nodes_all_systems": exact,
                "has_exact_node_in_intended_system": bool(same_system) if system else None,
                "has_exact_geometry_in_intended_system": any(map(has_exact_geometry, same_system)) if system else None,
                "has_exact_geometry_any_system": any(map(has_exact_geometry, exact)),
                "catalog_exact": mapped["catalog"]["exact"],
                "catalog_normalized_candidates": mapped["catalog"]["normalized_candidates"],
                "interpretation": "exact_name_structural_evidence_only" if any(map(has_exact_geometry, exact)) else
                    "unresolved_name_or_geometry_candidate_not_proven_anatomical_loss"})
        gaps = [r["source_name"] for r in evidence if not r["has_exact_geometry_any_system"]]
        entry = {"collection": collection_name, "intended_system": system,
            "source_recursive_objects": len(all_rows),
            "converter_rule_candidates": len(selected),
            "helper_or_type_excluded_but_retained_in_inventory": len(all_rows) - len(selected),
            "vertex_nonempty_candidates": sum((r["vertices"] or 0) > 0 for r in evidence),
            "surface_nonempty_candidates": sum((r["faces"] or 0) > 0 for r in evidence),
            "exact_node_in_intended_system": sum(r["has_exact_node_in_intended_system"] is True for r in evidence) if system else None,
            "exact_geometry_in_intended_system": sum(r["has_exact_geometry_in_intended_system"] is True for r in evidence) if system else None,
            "exact_geometry_any_system": sum(r["has_exact_geometry_any_system"] for r in evidence),
            "unresolved_exact_geometry_name_count": len(gaps),
            "unresolved_exact_geometry_names": gaps,
            "exact_geometry_names_any_system": [r["source_name"] for r in evidence if r["has_exact_geometry_any_system"]],
            "objects": evidence}
        if system:
            selected_fbx = [o["name"] for o in fbx_by_system[system]["objects"] if o["originalCatalogRule"]]
            entry["source_vs_fbx_original_catalog_rule"] = census_difference(sorted(selected_names), selected_fbx)
        else:
            entry["source_vs_fbx_original_catalog_rule"] = None
            entry["routing_note"] = "No dedicated lymphoid production system. Cross-system exact evidence retained; do not reassign all lymphoid objects to organs."
        primary.append(entry)
    eligible = {o["name"] for o in inventory["objects"] if not o["converter_helper_exclusion"]["excluded"]}
    memberships = Counter(r["source_name"] for entry in primary for r in entry["objects"])
    primary_names = set(memberships)
    catalog_assertions = {"all_eight_exact_name_multisets_equal": all(c["exact_name_multisets_equal"] for c in comparisons),
        "system_comparisons": len(comparisons),
        "fbx_original_catalog_rule_total": sum(c["left_count"] for c in comparisons),
        "catalog_total": sum(c["right_count"] for c in comparisons)}
    return {"schema_version": 1,
        "policy": {"primary_membership": "numbered collection directly under a source scene root, not Bonus/nested name matching",
            "candidate_filter": "same type and terminal auxiliary-suffix rule as supplied vessels/nerves converter, no inventory removal",
            "geometry_evidence": "exact GLB named mesh or exact named container with mesh descendants; structural evidence, not validated anatomical shape identity",
            "surface_nonempty": "enabled polygon faces > 0, distinct from vertices > 0",
            "fbx_catalog_equality": "exact per-system name MULTISET equality using recorded originalCatalogRule; proves catalog selection correspondence, not source anatomical completeness",
            "renames": "source-only names stay unresolved, no fuzzy identity assumptions or automatic loss labels",
            "scope": "all original objects remain in inventory.json; this summary adds a primary-collection stage view"},
        "source_blend_sha256": inventory["blend"]["sha256_before"],
        "primary_collections": primary, "fbx_to_catalog": comparisons,
        "fbx_files": [{"file": f["file"], "system": f["system"], "objects": len(f["objects"]),
            "original_catalog_rule_objects": sum(bool(o["originalCatalogRule"]) for o in f["objects"]),
            "production_system_in_eight": f["system"] in SYSTEMS,
            "catalog_comparison": "included" if f["system"] in SYSTEMS else "not_applicable_no_production_system"} for f in fbx["files"]],
        "primary_membership_counts": {"candidate_memberships": sum(memberships.values()),
            "unique_candidates": len(primary_names), "multiple_primary_memberships": {k: v for k, v in memberships.items() if v > 1},
            "eligible_outside_numbered_primary_collections": len(eligible - primary_names),
            "eligible_outside_numbered_primary_collection_names": sorted(eligible - primary_names)},
        "validation": catalog_assertions}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--fbx-inventory", type=Path, required=True)
    parser.add_argument("--catalog", type=Path, required=True)
    args = parser.parse_args()
    paths = {"inventory": args.source_dir / "inventory.json", "mapping": args.source_dir / "mapping.json",
        "fbx_inventory": args.fbx_inventory, "catalog": args.catalog}
    documents = {key: json.loads(path.read_text()) for key, path in paths.items()}
    result = build_stage_summary(documents["inventory"], documents["mapping"], documents["fbx_inventory"], documents["catalog"])
    result["inputs"] = {key: {"path": str(path.resolve()), "sha256": digest(path)} for key, path in paths.items()}
    for file in result["fbx_files"]:
        path = args.fbx_inventory.parent / file["file"]
        file["sha256"] = digest(path) if path.exists() else None
    (args.source_dir / "stage-summary.json").write_text(json.dumps(result, indent=2, allow_nan=False) + "\n")
    print(json.dumps(result["validation"], indent=2))
    for entry in result["primary_collections"]:
        print(entry["collection"], {key: entry[key] for key in ("converter_rule_candidates", "surface_nonempty_candidates", "exact_geometry_any_system", "unresolved_exact_geometry_name_count")})
    if not result["validation"]["all_eight_exact_name_multisets_equal"]:
        raise SystemExit("FBX/catalog equality failed: inspect preserved name differences")


if __name__ == "__main__":
    main()
