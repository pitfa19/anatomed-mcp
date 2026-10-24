# Anatomed source and rendering audit, 24 October 2026

Status: complete. Source reconciliation, exhaustive render coverage and report acceptance checks passed. Production anatomy defects listed below remain unfixed.

## Result in plain terms

The main nervous/vascular problem is **a stale catalog paired with newer geometry**, not a failed download. There is also **an omitted lymphoid source collection**. The existing individual organ models are mostly present, while broad system requests are not supported by the current name resolver.

No production source, catalog, model, release, deployment, or hosted storage was changed. Audit scripts and this report are local commits only.

## Review the evidence

Evidence directory on this machine:

```text
/Users/fabijanpitlovic/.jcode/scratch/anatomed-audit-20261024-1846
```

Start with `REPORT.html`, a searchable report with per-object results and three-view screenshots, plus:

- `original-source-inventory.csv`: every original source object, including excluded helpers.
- `catalog-results.csv`: every catalog row in both viewers.
- `exported-node-results.csv`: additional exported scene nodes, including helpers not intended as selectable anatomy.
- `exported-node-accounting.json`: every raw exported node linked to its render record, including nodes whose loader association metadata is absent.
- `audit-results.json`: combined results and provenance.
- `source/stage-summary.json`: exact source-collection, intermediate-file and catalog reconciliation.
- `geometry/source-spatial-reconciliation.json`: explicitly provisional name-and-bounds candidates.
- `render/query-audit-{obsidian,mcp}.json`: display-name and side-query access checks.
- `inputs/manifest.json`: source, local, release and hosted asset checksums.

## Original source and conversion history

Original creator repository: `https://github.com/Z-Anatomy/Models-of-human-anatomy`.

Audited upstream commit: `d71cd657a0fd9fc774261ba403bc0a1e8eccd176`. The model archive is `Z-Anatomy.zip`, containing `Z-Anatomy/Startup.blend`. The archive's Git history has one content revision, `bb293be456f6d2245191f37752d14ec76894740d` from 7 June 2024. This is not a recent upstream model change.

| Input | Pinned revision or SHA-256 |
|---|---|
| anatomed-obsidian production source | `41dab51d127ed016ea02fd83b86b06f158bed16a` |
| anatomed-mcp production source | `bb4b127a49469cc4916c3639dfcf2f001b45d3b0` |
| anatomed-web conversion source | `7bac6bff9666b1fb0db55f22affa91109a3a4f78` |
| Original archive | `e029688545627bd0214b269e1063143abb580aad72b2c2445d6d8a9a0d9da736` |
| Original Startup.blend | `9f08a17ea0115fed80b2a73ecdf0a1bc2ab2f6956f37c593ce23d513ea35afcd` |
| Obsidian release 0.1.7 asset archive | `d4e3662e1d391e8e4ce798fbddcaaa6eba17c6770bc2b0c69ca27609d8a3e9a5` |

Two conversion paths are relevant:

1. `pitfa19/Anatom3d/tools/export_to_glb.py` converts older Unity FBX files, an intermediate three-dimensional model exchange format. All eight current catalog ID multisets exactly match the eligible names in these intermediates.
2. `anatomed-web/tools/export_vessels_nerves_from_blend.py` exports nerves and vessels directly from the original Blender source. Those newer exported names do not consistently match the old catalog.

GLB means a compact binary three-dimensional scene file. All eight hosted GLBs, the catalog and neighbors data match the Obsidian local files byte-for-byte. Every corresponding asset in the released Obsidian download also matches. Packaging and deployment do not explain the observed differences.

## Dataset coverage

Z-Anatomy source: the original editable model archive used as the completeness reference.

- **7,184 objects**, **1,944 collections**, inventoried without discarding helpers or labels.
- 4,569 meshes, 951 curves, 1,660 text objects, three lights and one camera.
- A second in-memory evaluation enabled hidden collections and recovered geometry evaluation for 698 objects. The source file was never saved or modified.
- 3,247 objects match the converter's helper/type exclusions and remain explicitly listed in the inventory.
- 3,923 nonhelper positive-face objects enter conservative geometric reconciliation. This is not a count of independent clinical structures.

Anatomed catalog: the selectable names and identifiers shared by the two applications.

- **3,540 raw catalog rows**, **3,534 selectable rows** after the existing six `.g` group exclusions.
- The two catalogs are byte-identical.
- Every converted file was decoded with the actual three-dimensional loader and mesh decoder. **Zero invalid geometries** were found: finite positions/normals and valid triangle indices throughout.

Actual viewer render audit: the production viewer implementations mounted in a headless browser, with observation-only measurement code.

**Both viewers produced identical catalog outcomes.** Every one of the 3,540 raw catalog rows and 2,397 additional exported nodes was attempted in each viewer: **11,874 render cases and 35,622 screenshots** overall. Every raw scene node, 5,869 per viewer, is linked to a test record. No records, system inventories, screenshots or render attempts are missing. There were zero execution errors.

Results below are **per viewer**, excluding the six catalog group rows already filtered out in production:

| System | Selectable | Clean structural pass | Renders, framing warning | Blank default view |
|---|---:|---:|---:|---:|
| Skeleton | 274 | 222 | 49 | 3 |
| Muscles | 565 | 487 | 67 | 11 |
| Nerves | 502 | 376 | 102 | 24 |
| Vessels | 674 | 526 | 101 | 47 |
| Organs | 118 | 112 | 5 | 1 |
| Joints | 416 | 374 | 42 | 0 |
| Insertions | 728 | 605 | 123 | 0 |
| Regions | 257 | 232 | 20 | 5 |
| **Total** | **3,534** | **2,934** | **509** | **91** |

Of the 91 blank default views, **76 have missing or unusable targets**, while **15 have real geometry visible after rotation**. Therefore 3,443 entries are visible immediately and 3,458 are visible in at least one tested view. Of the 509 framing-warning entries, 49 touch an edge in the default view. The remainder touch an edge only after rotation.

Additional exported-node results include labels, containers and other helpers that are not intended as standalone anatomy. Their failures must not be reported as another 1,500 missing clinical structures per viewer.

A render pass means the intended node exists, has finite nonempty triangle geometry, is isolated without unrelated visible meshes or hidden target fragments, and produces visible pixels. It does not certify clinical anatomy or identical surfaces relative to the source.

An edge-contact warning means the target renders but touches the viewport border. Default-view clipping and clipping after a quarter-turn are recorded separately. The rotated views deliberately retain the original fitted camera size, so rotation-only clipping is not evidence of missing geometry.

## Confirmed findings

### 1. Stale nerve and vessel identifiers

The direct Blender exports preserve all **588 eligible nervous-system object names**, including 582 with faces, and all **676 eligible cardiovascular objects**, all with faces. Those exports are not dropping the eligible primary-collection objects.

However:

- **66 selectable catalog IDs point to nonexistent exported names**: 19 nerves and 47 vessels.
- **153 nonempty exports have no catalog entry**: 104 nerves and 49 vessels.
- These are different populations and must not be added together as a single missing-model count.

Examples:

| Old catalog | Current source/export | Interpretation |
|---|---|---|
| `Cerebellum.l`, `Cerebellum.r` | Detailed cerebellar lobules, vermis pieces and tonsils | Needs an explicit composite mapping, not a one-object alias |
| `Hypothalamus.r` | `Hypothalamus` | Identifier/granularity mismatch |
| `Hyppoglossal nerve (XII).l/r` | `Hypoglossal nerve (XII).l/r` | Spelling mismatch |
| `Ophtalmic nerve.l/r` | `Ophthalmic nerve.l/r` | Spelling mismatch |
| Leading-space ` Temporal pole.l/r` | `Temporal pole.l/r` | Whitespace mismatch |
| No catalog entry | `Cauda equina` and multiple cerebellar subdivisions | Exported but unavailable through the catalog |

The deployed Cerebellum preview reproduces the user-visible failure: legend says one structure loaded, but the canvas is blank. The deployed Liver, Heart, Sciatic nerve and Abdominal aorta previews are nonblank.

### 2. Omitted lymphoid system

The original primary collection `6: Lymphoid organs` contains **163 eligible nonempty objects**. The conversion system lists omit that collection.

Spleen and two thymus lobes already have geometry in the organs export. The other **160 source object names** have no exact exported geometry match and no close intermediate geometry candidate. This is strong collection-level omission evidence, distinct from spelling differences in the nerve/vessel catalog.

### 3. Empty helpers are offered as selectable anatomy

The geometry-only stage identified **76 selectable entries without usable target geometry**:

| System | Selectable rows | Missing or empty target |
|---|---:|---:|
| Skeleton | 274 | 3 |
| Muscles | 565 | 0 |
| Nerves | 502 | 24 |
| Vessels | 674 | 47 |
| Organs | 118 | 1 |
| Joints | 416 | 0 |
| Insertions | 728 | 0 |
| Regions | 257 | 1 |
| **Total** | **3,534** | **76** |

This consists of the 66 stale nerve/vessel identifiers plus ten empty or auxiliary entries. Examples include `Oesophagus-profile`, `Parts of human body`, three skeletal landmark entries and five zero-face nerve entries. These should not be described as ten absent organs.

### 4. Search access and model presence are separate

Both real name resolvers were tested with **10,213 queries each**, covering every selectable row through its English display name, cleaned identifier and, when applicable, a left/right-prefixed display name.

- Generic names often select a default side. Not returning both sides is not automatically a defect.
- All 3,145 side-prefixed probes failed to include their expected catalog ID. Of these, 3,135 were unmatched and ten resolved elsewhere. This is an access limitation of these query forms, not missing geometry.
- Broad requests `organs`, `nervous system` and `vascular system` return no parts in both resolvers and in the deployed service. The tool explicitly targets bounded regions, not whole-body views, so this is product behavior to clarify rather than proof of conversion loss.
- Literal `Kidney.r` does not resolve through the current deployed query path, while `kidney` resolves to `Kidney.r`. An exact-ID viewer payload renders that kidney correctly.
- Ambiguity refusals, duplicate display names, default-side choices and genuinely unmatched requests are classified separately in the evidence.

### 5. Fifteen valid models are invisible from the default direction

These are not absent files or missing identifiers. They have nonempty geometry, exact node matches and visible pixels after a quarter-turn, but zero model pixels in the default view in both applications:

- Lateral femoral intermuscular septum, left and right.
- Lateral intermuscular septum of arm, left and right.
- Medial patellar retinaculum, right.
- Popliteal fascia, left and right.
- Superficial transverse metatarsal ligament, left and right.
- Transverse intermuscular septum of leg, left and right.
- Eminencia conchae, left and right.
- Fossa antihelica, left and right.

The evidence establishes a viewing-direction/material visibility problem. Back-face behavior and initial camera choice should be investigated before changing conversion geometry. Example: right popliteal fascia has 145 triangles and 0 / 3,904 / 11 visible pixels in the three views.

### 6. Other original-source differences are not automatically losses

Conservative reconciliation of 3,923 nonhelper positive-face source objects found:

| Evidence class | Source objects |
|---|---:|
| Exact named exported geometry | 2,694 |
| Single name-and-bounds candidate | 414 |
| Ambiguous name-and-bounds candidates | 3 |
| Bounds-only candidates | 454 |
| No close intermediate candidate | 358 |

The comparison uses same-system world bounds, side compatibility, name-token overlap and a tolerance of 0.3 mm plus 3% of the source object's maximum extent. Candidate matches are not proven anatomical identities. Names such as spelled-out ordinal bones and renamed insertion points explain many apparent differences.

Within the 358 no-close-candidate objects are the 160 lymphoid objects, 119 muscle-system objects largely involving bursae/tendon sheaths, and six visceral-source objects. The six visceral names are `Laryngopharynx`, `Nasopharynx`, `Oropharynx`, `Pleura`, `Mucosa of nasal cavity`, and the right medial basal segmental bronchus (BVII). Review these against possible merged surfaces before treating each as a distinct lost model.

## Verification and limits

- Existing MCP checks: typecheck, nine tests and build pass.
- Existing Obsidian checks: typecheck, release verification, bootstrap verification and build pass. Tampered asset archive rejection passes.
- Audit tooling: **31 JavaScript tests and 19 Python tests pass**, independently rerun by the coordinator.
- Browser: already-installed Chrome Headless Shell 155 with actual WebGL rendering, three 512 by 512 views per object.
- Blender: installed 5.2.3 LTS, source scripts disabled. Visibility-enabled evaluation did not modify the saved file. Font compatibility and an existing esophagus dependency-cycle warning are retained in the source report.
- Positive and negative controls confirmed that a loaded callback or nonblank unrelated canvas cannot count as a pass. An initial audit-only readiness race was fixed before accepted renders.
- The first long orchestration hit the execution environment's ten-minute limit. Completed systems were retained, incomplete systems were rerun in bounded batches, and final verification confirmed every expected record and screenshot exists under the same viewer bundle checksum.
- Live mixed-system preview shows Femur, Femoral artery and Femoral nerve together without a loading overlay or WebGL error. This is an alignment smoke test, not clinical validation.
- Native Obsidian desktop integration and Claude's embedded app host were not driven. Opening those apps needs separate approval. The actual viewer source and live deployed preview were tested instead.
- Runtime code adjusts 122 insertion marker scales in each viewer. This is recorded separately in `geometry/viewer-transform-changes.json`, not assumed to be conversion loss.
- Raw inventory `activeScene`/`unrenderableExportedNodes` fields rely on loader association metadata, which can be absent for cloned objects. They are not authoritative render verdicts. Exact target-node geometry and pixel evidence take precedence, and every raw node is separately linked to a render record in `exported-node-accounting.json`.
- No exhaustive human visual inspection of every screenshot or medical surface-equivalence certification is claimed.

## Recommended repair sequence, not implemented

1. **Reconcile catalog and current nerve/vessel exports together.** Generate catalog IDs from the same export manifest, preserve legacy names through explicit aliases, and add reviewed composites for structures like the cerebellum.
2. **Remove empty helpers from selectable anatomy.** Require nonempty geometry or a documented composite, rather than suffix filtering alone.
3. **Restore the omitted lymphoid collection.** Add it to the export/catalog system list and verify its relationship to spleen and thymus already in organs.
4. **Review the remaining source-only candidates.** Start with organs, bursae/tendon sheaths and accessory structures, distinguishing merged geometry from true omissions.
5. **Clarify name resolution.** Support exact IDs and explicit laterality, and decide whether broad system queries should expand to an overview or give a clear supported-query response.
6. **Fix default-view visibility and camera framing separately.** First address the 15 real models invisible until rotation, then use the default and rotated clipping evidence rather than calling every edge contact a missing model.
7. **Release catalog, neighbors and assets as one versioned set.** Rerun this audit against both local packages and hosted bytes, then verify native-host behavior before publishing.
