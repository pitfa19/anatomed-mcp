"""Blender background-only inventory. Never saves or exports the source scene."""
import argparse
import collections
import hashlib
import json
from pathlib import Path
import re
import sys
import traceback

import bpy
import numpy as np

GEOMETRY_TYPES = {"MESH", "CURVE", "SURFACE", "FONT", "META"}
AUX = re.compile(r"\.(i|j|g|s|t)$")


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def matrix(value):
    return [list(row) for row in value]


def bounds(points, world):
    if len(points) == 0:
        return {"local": None, "world": None}
    points = np.asarray(points, dtype=np.float64).reshape((-1, 3))
    m = np.asarray(world, dtype=np.float64)
    transformed = points @ m[:3, :3].T + m[:3, 3]
    return {"local": {"min": points.min(axis=0).tolist(), "max": points.max(axis=0).tolist()},
            "world": {"min": transformed.min(axis=0).tolist(), "max": transformed.max(axis=0).tolist()}}


def mesh_stats(mesh, world):
    coords = np.empty(len(mesh.vertices) * 3, dtype=np.float32)
    mesh.vertices.foreach_get("co", coords)
    return {"vertices": len(mesh.vertices), "edges": len(mesh.edges), "faces": len(mesh.polygons),
            "bounds": bounds(coords.reshape((-1, 3)), world)}


def evaluated(obj, depsgraph, included):
    if obj.type not in GEOMETRY_TYPES:
        return {"status": "not_geometry_type", "included_in_view_layer": included}
    ev = None
    try:
        ev = obj.evaluated_get(depsgraph)
        if not ev.is_evaluated:
            return {"status": "unavailable_in_depsgraph", "included_in_view_layer": included,
                    "is_evaluated": False,
                    "reason": "evaluated_get returned original object, not an evaluated dependency-graph object"}
        mesh = ev.to_mesh()
        if mesh is None:
            return {"status": "no_mesh_returned", "included_in_view_layer": included}
        result = mesh_stats(mesh, ev.matrix_world)
        result.update(status="nonempty" if result["vertices"] else "empty_evaluation",
                      included_in_view_layer=included, is_evaluated=ev.is_evaluated,
                      matrix_world=matrix(ev.matrix_world))
        return result
    except Exception as exc:
        return {"status": "error", "included_in_view_layer": included,
                "error_type": type(exc).__name__, "error": str(exc), "traceback": traceback.format_exc()}
    finally:
        if ev is not None and ev.is_evaluated:
            ev.to_mesh_clear()


def layer_tree(layer, prefix=()):
    path = prefix + (layer.name,)
    yield {"path": list(path), "collection": layer.collection.name, "exclude": layer.exclude,
           "hide_viewport": layer.hide_viewport, "holdout": layer.holdout,
           "indirect_only": layer.indirect_only}
    for child in layer.children:
        yield from layer_tree(child, path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("blend")
    parser.add_argument("output")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    before = sha256(args.blend)
    bpy.ops.wm.open_mainfile(filepath=str(Path(args.blend).resolve()), load_ui=False)
    objects = sorted(list(bpy.data.objects), key=lambda o: o.name)
    scenes = list(bpy.data.scenes)
    paths = collections.defaultdict(list)
    collection_paths = collections.defaultdict(list)

    def walk(coll, path):
        path = path + (coll.name,)
        collection_paths[coll.name].append(list(path))
        for obj in coll.objects:
            paths[obj.name].append(list(path))
        for child in coll.children:
            walk(child, path)

    for scene in scenes:
        walk(scene.collection, ("scene:" + scene.name,))
    # Include unlinked collection trees too. Shared child paths remain distinct.
    child_names = {c.name for parent in bpy.data.collections for c in parent.children}
    for coll in bpy.data.collections:
        if coll.name not in collection_paths and coll.name not in child_names:
            walk(coll, ("unlinked",))
    for coll in bpy.data.collections:
        if coll.name not in collection_paths:
            walk(coll, ("unlinked",))
    inventory = {"schema_version": 1, "blend": {"path": str(Path(args.blend).resolve()),
        "sha256_before": before, "file_version": list(bpy.data.version)},
        "blender": {"version": bpy.app.version_string, "build_hash": bpy.app.build_hash.decode()},
        "evaluation_policy": {"original": "original active scene and active view layer, unchanged visibility",
            "enabled": "new temporary scene links every original object directly, clears object hide_viewport/hide_set and hide_render in memory only; original modifiers and curve resolutions unchanged",
            "bounds": "vertex-coordinate extrema in local and world space; curve base bounds are control points, not a surface",
            "limitations": ["evaluated geometry is viewport evaluation, not render evaluation", "collection instances are not expanded into additional inventory objects", "new scene has copied frame and unit settings but not all scene-specific driver context"]},
        "original_active_scene": bpy.context.scene.name, "original_active_view_layer": bpy.context.view_layer.name,
        "scenes": [{"name": s.name, "frame": s.frame_current, "unit_scale": s.unit_settings.scale_length,
            "view_layers": [{"name": v.name, "collections": list(layer_tree(v.layer_collection))} for v in s.view_layers]} for s in scenes],
        "scene_root_collections": [{"scene": s.name, "name": s.collection.name,
            "children": [c.name for c in s.collection.children],
            "direct_objects": [o.name for o in s.collection.objects],
            "recursive_object_count": len(s.collection.all_objects),
            "hide_viewport": s.collection.hide_viewport, "hide_render": s.collection.hide_render} for s in scenes],
        "collections": [{"name": c.name, "paths": collection_paths[c.name],
            "children": [x.name for x in c.children], "direct_objects": [x.name for x in c.objects],
            "recursive_object_count": len(c.all_objects), "hide_viewport": c.hide_viewport,
            "hide_render": c.hide_render, "hide_select": c.hide_select} for c in bpy.data.collections],
        "objects": []}
    dg = bpy.context.evaluated_depsgraph_get()
    active_names = set(bpy.context.view_layer.objects.keys())
    for index, obj in enumerate(objects):
        suffix = AUX.search(obj.name)
        row = {"name": obj.name, "type": obj.type, "data_name": obj.data.name if obj.data else None,
            "library": obj.library.filepath if obj.library else None, "users": obj.users,
            "parent": obj.parent.name if obj.parent else None, "children": [x.name for x in obj.children],
            "collections": [c.name for c in obj.users_collection], "collection_paths": paths[obj.name],
            "scene_membership": [s.name for s in scenes if obj.name in s.objects],
            "matrix_world": matrix(obj.matrix_world), "matrix_local": matrix(obj.matrix_local),
            "matrix_parent_inverse": matrix(obj.matrix_parent_inverse),
            "location": list(obj.location), "scale": list(obj.scale), "rotation_mode": obj.rotation_mode,
            "instance_type": obj.instance_type, "instance_collection": obj.instance_collection.name if obj.instance_collection else None,
            "hidden": {"hide_viewport": obj.hide_viewport, "hide_render": obj.hide_render,
                "hide_select": obj.hide_select, "active_layer_hide_get": obj.hide_get() if obj.name in active_names else None,
                "active_layer_visible_get": obj.visible_get() if obj.name in active_names else False},
            "modifiers": [{"name": m.name, "type": m.type, "show_viewport": m.show_viewport, "show_render": m.show_render} for m in obj.modifiers],
            "converter_helper_exclusion": {"excluded": bool(suffix) or obj.type not in {"MESH", "CURVE"},
                "suffix": suffix.group(1) if suffix else None,
                "reasons": (["auxiliary_suffix_" + suffix.group(1)] if suffix else []) + (["type_not_mesh_or_curve"] if obj.type not in {"MESH", "CURVE"} else [])}}
        if obj.type == "MESH":
            row["base"] = {"kind": "mesh", **mesh_stats(obj.data, obj.matrix_world)}
        elif obj.type in {"CURVE", "SURFACE", "FONT"}:
            cu = obj.data
            points = [list(p.co[:3]) for s in cu.splines for p in s.points]
            points += [list(p.co) for s in cu.splines for p in s.bezier_points]
            row["base"] = {"kind": "curve_control_points", "vertices": None, "faces": None,
                "control_points": len(points), "bounds": bounds(points, obj.matrix_world)}
            row["curve"] = {k: getattr(cu, k, None) for k in ("dimensions", "resolution_u", "resolution_v",
                "render_resolution_u", "render_resolution_v", "bevel_depth", "bevel_resolution", "bevel_mode",
                "extrude", "offset", "fill_mode", "use_fill_caps", "bevel_factor_start", "bevel_factor_end")}
            row["curve"].update(bevel_object=cu.bevel_object.name if cu.bevel_object else None,
                taper_object=cu.taper_object.name if cu.taper_object else None,
                splines=[{"type": s.type, "points": len(s.points), "bezier_points": len(s.bezier_points),
                    "use_cyclic_u": s.use_cyclic_u, "resolution_u": s.resolution_u} for s in cu.splines])
            if obj.type == "FONT":
                try:
                    row["curve"]["text"] = cu.body
                except UnicodeDecodeError as exc:
                    row["curve"]["text"] = None
                    row["curve"]["text_read_error"] = {"type": type(exc).__name__, "error": str(exc)}
        else:
            row["base"] = {"kind": "non_mesh", "vertices": None, "faces": None}
        row["evaluated_original"] = evaluated(obj, dg, obj.name in active_names)
        inventory["objects"].append(row)
        if index % 500 == 0:
            print(f"ORIGINAL {index}/{len(objects)}", flush=True)
    original_scene = bpy.context.scene
    audit = bpy.data.scenes.new("__SOURCE_AUDIT_TEMPORARY__")
    audit.frame_set(original_scene.frame_current)
    audit.unit_settings.system = original_scene.unit_settings.system
    audit.unit_settings.scale_length = original_scene.unit_settings.scale_length
    for obj in objects:
        audit.collection.objects.link(obj)
        obj.hide_viewport = False
        obj.hide_render = False
    bpy.context.window.scene = audit
    for obj in objects:
        obj.hide_set(False)
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    for index, (obj, row) in enumerate(zip(objects, inventory["objects"])):
        enabled = evaluated(obj, dg, obj.name in bpy.context.view_layer.objects)
        row["evaluated_enabled"] = enabled
        old = row["evaluated_original"]
        if enabled["status"] == "nonempty":
            classification = "geometry_recovered_by_visibility" if old.get("vertices", 0) == 0 else "nonempty"
        elif enabled["status"] == "empty_evaluation":
            if row["base"].get("vertices") == 0 and not row["modifiers"]:
                classification = "empty_base_mesh_and_empty_enabled_evaluation"
            elif row["base"].get("control_points") == 0 and obj.type != "FONT":
                classification = "no_curve_control_points_and_empty_enabled_evaluation"
            else:
                classification = "empty_enabled_evaluation_not_proven_empty_source"
        else:
            classification = enabled["status"]
        row["geometry_classification"] = classification
        if index % 500 == 0:
            print(f"ENABLED {index}/{len(objects)}", flush=True)
    inventory["blend"]["sha256_after"] = sha256(args.blend)
    assert before == inventory["blend"]["sha256_after"], "Source file changed"
    inventory["counts"] = {"objects": len(objects), "collections": len(inventory["collections"]),
        "types": dict(collections.Counter(o["type"] for o in inventory["objects"])),
        "geometry_classification": dict(collections.Counter(o["geometry_classification"] for o in inventory["objects"])),
        "helper_excluded": sum(o["converter_helper_exclusion"]["excluded"] for o in inventory["objects"]),
        "scene_root_collections": len(scenes),
        "original_unavailable_in_depsgraph": sum(o["evaluated_original"]["status"] == "unavailable_in_depsgraph" for o in inventory["objects"]),
        "text_read_errors": sum("text_read_error" in o.get("curve", {}) for o in inventory["objects"]),
        "geometry_errors": {mode: sum(o[mode]["status"] == "error" for o in inventory["objects"]) for mode in ("evaluated_original", "evaluated_enabled")},
        "geometry_totals": {mode: {field: sum(o[mode].get(field) or 0 for o in inventory["objects"]) for field in ("vertices", "faces")} for mode in ("base", "evaluated_original", "evaluated_enabled")}}
    Path(args.output).write_text(json.dumps(inventory, indent=2, allow_nan=False) + "\n")
    print(json.dumps(inventory["counts"], indent=2), flush=True)


if __name__ == "__main__":
    main()
