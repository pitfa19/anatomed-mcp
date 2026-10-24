# Original Z-Anatomy source inventory

This is audit tooling, not a production exporter. It opens the original blend in background Blender, disables source auto-execution, never saves the scene, and writes only scratch artifacts. All `bpy.data.objects` are inventoried, including helpers, unlinked objects, and objects outside the eight production systems.

## Run

From the repository root, substitute absolute paths for the four input/output locations:

```bash
python3 -B scripts/model-audit/source/run_inventory.py \
  --upstream /absolute/scratch/upstream \
  --output /absolute/.jcode/scratch/audit/source \
  --converter /absolute/scratch/anatomed-web/tools/export_vessels_nerves_from_blend.py \
  --blender /opt/homebrew/bin/blender
python3 -B scripts/model-audit/source/compare_assets.py \
  --inventory /absolute/.jcode/scratch/audit/source/inventory.json \
  --assets /absolute/anatomed-obsidian/assets \
  --output /absolute/.jcode/scratch/audit/source
python3 -B -m unittest discover -s scripts/model-audit/source -v
```

The runner requires its output under `.jcode/scratch/`. It extracts the archive there, rejects path traversal members, and checks both archive and blend SHA-256 after execution. No downloads, installation, GUI, network calls, or production asset writes are involved. Background Blender may report compatibility or dependency-cycle warnings, preserved in `blender.log`.

## Version 1 output schema

- `provenance.json`: upstream and converter Git revisions, archive SHA-256 and member CRC32/sizes, original extracted blend SHA-256, converter SHA-256, exact Blender command.
- `inventory.json`: Blender/file versions, source checksum before/after, original active scene/layer, scenes and recursive layer-collection visibility, scene root collections separately from collection datablocks, every collection's recursive paths and direct object names, every object and totals.
  - Object records preserve exact `name`, `type`, data/library names, parent/children, all collection paths and scene membership, original hidden flags, transforms, instance references, modifier flags, curve parameters and splines.
  - `base` mesh counts and local/world vertex bounds. Curves have **null** mesh vertices/faces, explicit control-point count and control-point bounds. Control points are not surface vertices.
  - `evaluated_original` and `evaluated_enabled`: status, vertices/edges/polygon-faces, local/world bounds, evaluated world matrix and view-layer inclusion. Faces are Blender polygons, not triangulated GLB primitive counts.
  - Failed conversion carries an explicit exception type, message and traceback. Unsupported object types are `not_geometry_type`, not silently empty. FONT text that cannot be decoded by the selected Blender is null with `text_read_error`, not evidence by itself that the original source was malformed.
  - `geometry_classification` distinguishes recovered hidden geometry, nonempty geometry, proven empty base meshes, and still-empty evaluations whose source emptiness is **not established**.
- `mapping.json`: exactly one row per source object, all eight files' hashes and counts, catalog hash, literal GLB JSON node index/name/mesh references, catalog indexes, and bidirectional name matches. Duplicate names are arrays, never overwritten.
  - `exact` is literal equality. `normalized_candidates` applies only Unicode case-folding and whitespace collapse and excludes exact matches. Punctuation, `.l`, `.r`, `.001`, and every auxiliary suffix remain intact. Neither candidate matching nor string equality establishes anatomical/geometric identity.
  - Collection-to-system explicit-name rules are disclosed routing **hints**, not historical exporter behavior. No matching rule means unknown/unmapped. Multiple collection paths can yield multiple hints, so per-hint counts overlap. These rows remain in the inventory and comparison.
  - `glb_name_status` includes transform-only nodes. `glb_mesh_name_status` specifically requires a mesh-bearing node. `glb_geometry_evidence` separately recognizes exact named containers with mesh-bearing descendants from the literal GLB graph. This prevents falsely calling `Liver` absent because its own node has no mesh. Descendant evidence is structural and does not establish geometry identity or exclude label-only descendants.
  - The broad `nonhelper_nonempty_without_glb_mesh_name_candidate` list is a direct-mesh-name investigation queue. The narrower `nonhelper_nonempty_without_named_geometry_evidence` excludes exact named containers with mesh descendants. Neither list proves missing anatomy, because exporter renaming and profiles/edge-only helpers remain possible. Every source object is retained regardless.
- `summary.json`: conserved source, node, catalog and name-status counts plus per-file counts.
- `validation.json`: cross-artifact assertions for completeness, referential integrity, visibility inclusion, geometry statuses, bounds, hashes and eight-file coverage.
- `blender.log`: original source compatibility/dependency warnings and progress.

## Hidden geometry and evaluation semantics

The first pass records the unchanged active view layer and its original evaluations. If `evaluated_get()` returns the original object (`is_evaluated=False`), the result is explicitly `unavailable_in_depsgraph`, not purported evaluated geometry or an empty source. The second pass links **every original object** directly into a fresh temporary scene, clears object viewport/render/eye hiding, activates that scene, and updates Blender's dependency graph. This bypasses excluded or hidden collection trees, including objects not in the original active scene. Original collection membership and visibility are captured before this in-memory change. The temporary scene is never saved.

Empty original evaluation does not prove empty source geometry. Empty enabled evaluation also does not prove source emptiness for nonempty controls, modifiers, profiles or unresolved dependency errors. Base mesh zero plus enabled zero without modifiers is reported separately. Modifiers' own viewport flags, source bevel settings, and source resolution settings remain unchanged. This is viewport evaluation, not a reconstruction of the converter's low-resolution settings or a render. Collection instances are recorded but not expanded into extra object records. Scene-specific drivers can differ in a new scene, which is disclosed in the JSON policy. Dependency warnings must be considered when interpreting affected objects.

## Auxiliary suffix evidence

`converter_helper_exclusion` exactly mirrors the supplied vessels/nerves converter's type and terminal suffix filter, but is applied as a descriptive label to every object, **never as an inventory filter**:

- Terminal `.i` and `.j`: described by `export_vessels_nerves_from_blend.py` as helper/group/leader-line meshes.
- Terminal `.g`, `.s`, `.t`: described by that converter as label text.
- The archived `Z-Anatomy/__init__.py` independently creates `.t` font labels and `.j` line meshes around lines 532 and 565, and handles `.g` group labels around line 829. It also recognizes `.st`; this is not in the supplied converter's terminal suffix filter and is not silently added to it.
- `.l` and `.r` laterality and numeric duplicate suffixes are always preserved. A `.j.001` name is not classified by the converter's terminal `.j` rule. The actual object type is recorded, so the converter's broad suffix prose is not mistaken for a verified type assertion.

Other helpers with names such as `*-profile` are not guessed into exclusions. They remain explicit source rows and may appear in the missing-name list. That list is an investigation queue, not a claim that every row should be shipped.

## Tests

Standard-library tests cover valid and malformed GLB JSON chunks, exact versus normalized duplicate candidates, suffix preservation, unknown collection routing, unnamed descendant meshes, cyclic/invalid node graphs, dependency-graph fallback rejection, and explicit conversion exceptions. The evaluation-function tests use mock objects and do not substitute for the real-source run. Real-source validation is separate from these synthetic tests and includes both source checksums, all 7,184 source records (for the pinned run), and all eight actual GLB inputs.
