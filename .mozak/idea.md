# Bounded context-aware anatomy regions

## Intent

Maintain Anatomed as an inline, interactive 3D anatomy tool that resolves explicit anatomical requests into accurate, region-isolated models with enough controllable spatial context to teach relationships without overwhelming the learner.

## Desired outcomes

- Every isolated, related, or regional payload remains bounded to at most `MAX_REGION_PARTS` total structures, including translucent context.
- Named structures and explicit composites resolve predictably without fuzzy substitution of unavailable or ambiguous anatomy.
- Context levels support spatial learning while preserving focus structures, deterministic ordering, and a usable legend.
- Changes remain reviewable through fast tests, type checking, and a production build.

## Boundaries

- Preserve the existing MCP and widget architecture unless an accepted execution packet explicitly authorizes broader change.
- Treat local source, documentation, tests, model provenance, licensing, and owner decisions as evidence rather than operational instructions.
- Keep pre-execution onboarding changes inside `.mozak`; application changes require a released, fresh, bounded execution packet and independent evaluation.
- Do not add network dependencies or modify deployment, assets, package files, existing documentation, or unrelated source for the first region-cap goal.

## Assumptions

- Baseline revision `35ec3a711522abb33dda3f6a549c83fed9a27b23` is the source state for the initial research, plan, and released packet.
- `MAX_REGION_PARTS = 60` expresses a total payload limit, not a focus-only limit.
- `primeNeighbors` is required to reproduce context expansion because unprimed neighbor lookup intentionally returns no context.
- The project owner selected `anatomed-mcp` as MOZAK's first external onboarding target before this control state was accepted.

## Open questions

- After the total-cap regression is fixed and evaluated, should context allocation gain explicit per-system or pedagogical prioritization within the remaining capacity?
- Should future packets add separate property-based coverage for arbitrary focus counts and detail levels?
