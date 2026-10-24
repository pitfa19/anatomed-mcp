# Standalone display-name and laterality query audit

```sh
node scripts/model-audit/viewer/query-audit.mjs
node --test scripts/model-audit/viewer/query-audit.test.mjs
```

Uses each repository's actual `buildRegion` and `cleanName`, bundled only in memory using the existing Obsidian esbuild installation. It never rebuilds or writes browser bundles, restarts a server, renders models, or changes production files.

Output defaults to `/Users/fabijanpitlovic/.jcode/scratch/anatomed-audit-20261024-1846/render`:

- `query-audit-obsidian.json` and `query-audit-mcp.json`: all individual query evidence and source hashes.
- `query-audit-obsidian-summary.json` and `query-audit-mcp-summary.json`: compact counts by query variant and outcome, plus three system-query probes.

Optional arguments: `--output DIR`, `--obsidian REPO_ROOT`, `--mcp REPO_ROOT`.

All non-`.g` catalog rows are selectable inputs, without deduplication. Each row tests the verbatim English name, cleaned ID display, and a side-prefixed cleaned English display name when `side` is defined. ID display cleaning applies the actual `cleanName`, strips a terminal `.l` or `.r`, then applies `cleanName` again. Expected IDs are always kept byte-for-byte, including duplicate and laterality suffixes. Equivalent generated queries remain separate so each catalog row's accessibility can be measured.

Outcomes distinguish exact expected-ID containment (singleton or group expansion), explicit ambiguity/unavailability declines, unmatched queries, opposite-side counterpart selection under an unspecified side, explicit wrong-side responses, duplicate-name rows, other mismatches, and contradictory query/catalog-side metadata. Side evidence prefers payload/catalog metadata and falls back to unambiguous left/right words in a returned English name. Contradictory left/right words within one generated query are flagged separately.

These are **coverage counts, not defect counts**. Choosing the default counterpart for an unqualified bilateral name can be legitimate. Returning a different row sharing the same name can be legitimate. Ambiguous queries may be intentionally declined. An expected ID beginning `Right ...` with catalog side `l` can generate a contradictory query, which is a catalog-label conflict rather than proof that the resolver ignored a requested side.

Broad queries `organs`, `nervous system`, and `vascular system` are tested separately without an expected singleton ID. An unmatched broad-system request may be consistent with the bounded-region product policy.

Tests exercise classification invariants and suffix identity. Execution of the script additionally exercises both actual repository implementations over the full selectable catalogs. It does not establish browser rendering or semantic anatomical correctness.
