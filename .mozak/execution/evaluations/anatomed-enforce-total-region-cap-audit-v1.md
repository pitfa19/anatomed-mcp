# Independent audit: total region cap packet v1

## Verdict

**Passed with high confidence.** Executor commit `64a69a82d2636a446e517ef332e2dfcf913b4ef9` satisfies all six packet acceptance conditions, all three recorded result gates are independently corroborated, and the evaluator identity is independent from the executor.

- Executor: `fresh-agent-gpt55-001` / `openai` / `jcode-swarm`
- Evaluator: `independent-evaluator-gpt56sol-001` / `openai` / `jcode-swarm`
- Identity comparison: different actor id and evaluation session, shared OpenAI provider, different full identity

## Scope and implementation inspection

The executor commit changes exactly:

1. `src/region.ts`
2. `test/resolver.test.ts`

The implementation changes `MAX_REGION_PARTS` from a focus-only interpretation to a total-region cap. `assembleRegion` now computes `remainingCapacity`, passes at most that capacity to `contextFor`, and retains a defensive `parts.length >= MAX_REGION_PARTS` break before appending context.

The new regression support:

- extracts a deterministic unique part sequence from the checked-in catalog;
- primes a deterministic neighbor map;
- asserts every detail level remains at 60 total parts with 60 focus items;
- asserts regional 40/50/55 focus cases produce totals 60/60/60;
- asserts focus counts 40/50/55 and context counts 20/10/5;
- asserts all focus ids remain in original order.

## Independent command reruns

| Declared check | Exit | Independent observation |
|---|---:|---|
| `npm test -- --run` | 0 | 9 tests, 9 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo |
| `npm run typecheck` | 0 | `tsc -p tsconfig.json --noEmit`, no diagnostics |
| `npm run build` | 0 | Vite 6.4.3, 599 modules transformed, `dist/index.html` produced |
| exact scoped changed-file list plus `git diff --check` | 0 | only `src/region.ts` and `test/resolver.test.ts`; no whitespace errors |

Runtime matched the recorded evidence: Node `v24.11.0`, npm `11.16.0`, and `package-lock.json` SHA-256 `885c93dbe08c4a571db86c4be28807c6102c4a9bb5db15d98cc7e1cba6e590ac`.

The typecheck and scoped-diff stdout/stderr hashes matched the recorded evidence exactly. Test and build stdout hashes differed because those transcripts contain nondeterministic elapsed-time values. Their exit codes, test counts, tool versions, module count, and substantive output matched. All stderr streams were empty.

## Hash verification

| Artifact | Declared SHA-256 | Independently observed | Result |
|---|---|---|---|
| Packet canonical content | `714494692c441cf21e1301305b1b48b028f50f5be190e24e4019aea14cb77f3e` | same | pass |
| Result canonical content | `12e881d65af1cf6c22bba606d96b6880956e2cc1f1467e7610f4e0dcc504c535` | same | pass |
| Commit object content | `03e458adca8a2788a799987e1550031d2d2c80875cb61c53d9ba23a3a4f4df0a` | same | pass |
| Tree object content | `dc2a9165051735a1b6c9e90c7efe01056e6e995ac1492d3577afe695eb30aa61` | same | pass |
| `src/region.ts` blob content | `452fea8d1aeee1e7210b878fb1bf2bf9bfc703893156b235d82c3fbf172da64a` | same | pass |
| `test/resolver.test.ts` blob content | `6416f625176a0f590f7513cc0ef6f71ac1a35badc137e7fe212657f92b4cb926` | same | pass |
| Full-index scoped patch | `036041a73262b14af03ec681562e6e3dd843658976f085a8956706430d80341a` | same | pass |
| Command-evidence file | `079f791c45044ff47997a5588934c3fa3b660a17fa09903a76cf3f08976ec3d7` | same | pass |
| Lockfile | `885c93dbe08c4a571db86c4be28807c6102c4a9bb5db15d98cc7e1cba6e590ac` | same | pass |

All seven packet context item hashes also matched their embedded content.

## Acceptance-condition traceability

| Condition | Observed evidence | Finding |
|---|---|---|
| AC-01 total cap at all detail levels | inspected cap logic; passing every-detail regression | pass |
| AC-02 regional 40/50/55 behavior | inspected exact total/focus/context/order assertions; test rerun passed | pass |
| AC-03 resolver behavior unchanged | all seven pre-existing resolver tests plus two new tests passed | pass |
| AC-04 type correctness | independent typecheck exited 0 | pass |
| AC-05 production build | independent build exited 0 | pass |
| AC-06 scoped changes | exact executor commit and non-control baseline diff contain only the two permitted files; diff check passed | pass |

## Result-gate traceability

| Gate | Independent finding |
|---|---|
| `gate-acceptance-conditions` | all six packet conditions passed |
| `gate-declared-commands` | all four declared checks independently exited 0 |
| `gate-packet-freshness` | baseline is an ancestor; executor/result times are inside `2026-09-01T10:44:00Z..2026-09-08T10:44:00Z`; no successor packet exists |

## Contract validation

A temporary Cargo harness inside the evaluation area assembled the released packet, recorded result, and evaluation into one `ExecutionBundle`, then called production `mozak_core::execution::validate_bundle` with observed revision `35ec3a711522abb33dda3f6a549c83fed9a27b23` and observed time `2026-09-01T11:22:53Z`. The harness was removed after execution.

## Open risks

- The original executor test and build stdout are represented by hashes rather than persisted transcripts, so their exact timing-bearing text cannot be reconstructed. Independent reruns matched every substantive observation.
- The regression uses checked-in catalog entries and a synthetic primed neighbor map rather than production neighbor assets. This is appropriate for deterministic unit coverage of the cap and ordering rules, but it is not a full browser-level workflow test.

Neither risk lowers the packet claim because the requested bounded assembly behavior, regression assertions, typecheck, build, scope, hashes, freshness, and production PF-0006 contract all validate.
