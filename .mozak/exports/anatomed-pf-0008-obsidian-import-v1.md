# Project release: anatomed-mcp-pf-0008-20260901-v1

- Project: **anatomed-mcp** (`anatomed-mcp`)
- Generated at (accepted input): `2026-09-01T11:31:49Z`
- Accepted state SHA-256: `fad9a7910e7934b9c4e8d17246de4fa7825447b7d6752142812c89ef51cbe964`
- Truth scopes: `project_local` is authoritative only here; `cross_project_inference` is reusable inference, not another project's truth.

## Accepted findings

### Total anatomy region cap is enforced (`finding-region-total-cap-implemented`)

Executor commit 64a69a82 enforces the 60-part total focus-plus-context cap with deterministic near-limit regression coverage, and the independent evaluation passed all six acceptance conditions.

- Truth scope: `project_local`
- Supersedes: none
- Provenance:
  - [prov-bundle](repo:.mozak/execution/bundles/anatomed-enforce-total-region-cap-bundle-v1.json) at `json:$` (SHA-256 `1c84ef9003b0602de8571129e708b945388f7eeb65195306e1bbfd3c25e1b772`)

### Timing-bearing command evidence needs semantic corroboration (`finding-timing-transcripts-semantically-corroborated`)

Recorded transcript hashes remain immutable original evidence, while independent reruns corroborate timing-sensitive test and build claims through explicit semantic observations rather than false byte-equality claims.

- Truth scope: `project_local`
- Supersedes: none
- Provenance:
  - [prov-friction-timing](repo:.mozak/friction/anatomed-pf-0008-contract-friction-v1.json) at `json:$.items[0]` (SHA-256 `42b4116c0362d9ceae48c47932fae2061b99bd403e5ddcad2dbc687b5d0167be`)

## Decisions

### Accept semantic observations plus independent reruns (`decision-accept-semantic-command-corroboration`)

Timing-bearing transcript hash variance is accepted only with exact original evidence preservation, explicit semantic observations, and independent reruns.

- Truth scope: `project_local`
- Supersedes: none
- Provenance:
  - [prov-friction-decision](repo:.mozak/friction/anatomed-pf-0008-contract-friction-v1.json) at `json:$.items[0].decision` (SHA-256 `42b4116c0362d9ceae48c47932fae2061b99bd403e5ddcad2dbc687b5d0167be`)

### Onboard Anatomed within control-artifact boundaries (`decision-owner-selected-anatomed`)

The owner selected Anatomed before onboarding, with pre-execution ownership limited to .mozak and application changes limited to the released executor packet.

- Truth scope: `project_local`
- Supersedes: none
- Provenance:
  - [prov-plan](repo:.mozak/planning/goal-dag-v5.json) at `json:$` (SHA-256 `254c73ba6eff16dfb3fcaf845cf37fea4f5da1f3e0f240b49dc6c618f9b3ac6f`)

## Reusable patterns

### Validate packet, result, and evaluation as one production bundle (`pattern-execution-bundle-closure`)

A self-contained PF-0006 bundle closes execution truth only after packet freshness, result receipt, complete evidence mapping, and evaluator independence validate together.

- Truth scope: `cross_project_inference`
- Supersedes: none
- Provenance:
  - [prov-bundle-pattern](repo:.mozak/execution/bundles/anatomed-enforce-total-region-cap-bundle-v1.json) at `json:$` (SHA-256 `1c84ef9003b0602de8571129e708b945388f7eeb65195306e1bbfd3c25e1b772`)

### Close planning with an exact successor DAG (`pattern-versioned-goal-closure`)

Record completed implementation, execution, and evaluation goals in a consecutive plan version with explicit per-goal supersession and unchanged dependency provenance.

- Truth scope: `cross_project_inference`
- Supersedes: none
- Provenance:
  - [prov-dag-pattern](repo:.mozak/planning/goal-dag-v5.json) at `json:$` (SHA-256 `254c73ba6eff16dfb3fcaf845cf37fea4f5da1f3e0f240b49dc6c618f9b3ac6f`)

## Open gaps

### Portable external-project harness discovery (`gap-portable-external-project-discovery`)

The integration harness currently assumes Anatomed is a sibling checkout. Configurable or packaged fixture discovery remains deferred and the release makes no broader portability claim.

- Truth scope: `project_local`
- Supersedes: none
- Provenance:
  - [prov-friction-portability](repo:.mozak/friction/anatomed-pf-0008-contract-friction-v1.json) at `json:$.items[1]` (SHA-256 `42b4116c0362d9ceae48c47932fae2061b99bd403e5ddcad2dbc687b5d0167be`)

## Implementation state

### MOZAK onboarding control state (`implementation-pf0008-control-state`)

Audited research, accepted inputs, successor goal DAG, execution bundle, friction dispositions, and accepted release state are recorded.

- Truth scope: `project_local`
- State: `completed`
- Supersedes: none
- Provenance:
  - [prov-dag-state](repo:.mozak/planning/goal-dag-v5.json) at `json:$` (SHA-256 `254c73ba6eff16dfb3fcaf845cf37fea4f5da1f3e0f240b49dc6c618f9b3ac6f`)
  - [prov-inputs](repo:.mozak/planning/accepted-inputs.json) at `json:$` (SHA-256 `0365f46cb40bd11620df34ec5d3d6b3a37ee1c08330d8122f321ef1fcd59dc48`)
  - [prov-research](repo:.mozak/research/runs/run-anatomed-region-cap-20260901/run.json) at `json:$` (SHA-256 `1889f43834142d90bfc688eae5b9e738d2eeb6b5b59133407c1dae861f5d5402`)

### Anatomed region assembly (`implementation-region-cap`)

The bounded executor change is committed and its packet, result, and independent evaluation pass the production PF-0006 bundle contract.

- Truth scope: `project_local`
- State: `implemented_and_independently_evaluated`
- Supersedes: none
- Provenance:
  - [prov-evaluation](repo:.mozak/execution/evaluations/anatomed-enforce-total-region-cap-evaluation-v1.json) at `json:$` (SHA-256 `eb7418143f37dbe6c4a1c8814b147654309b0b044468acc6d4352a03cef43a1d`)
  - [prov-result](repo:.mozak/execution/results/anatomed-enforce-total-region-cap-result-v1.json) at `json:$` (SHA-256 `8e48633f5d24a4ddc5b502b5de2b4f1057741f5de6ac77f6b5e5a9c33ab255a6`)
