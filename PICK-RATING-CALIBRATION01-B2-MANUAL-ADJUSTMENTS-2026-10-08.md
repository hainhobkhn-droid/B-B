# 1. Objective

RATING-CALIBRATION01-B2 — analysis/protocol preparation only. Incorporate legitimate exogenous interventions without rewriting A/B, tuning D or representing rebuilt states as pre-result forecasts. No application/backend deployment.

# 2. Frozen baseline

Frozen cutoff2026-10-08T07:36:51.561032Z; Model A sensitivity0.9, D1.2. Baseline60 Rated matches,25 Players,240 match events,0 adjustments remains immutable. Existing B configuration/manifest/validator and A dataset hashes are checked. Initial seeds and baseline match/lineup inventory are compared with the live snapshot. No original artifact is overwritten.

# 3. Adjustment inventory

Read-only repeatable-read production capture2026-10-08T08:35:57.519896Z. Exactly25 source adjustments and25 active-version derived events.20 unique Players;5 Players with two adjustments each. All25 source rows have correction_of_adjustment_id=NULL: supported MANUAL_ADDITIVE_ADJUSTMENT, not initial seed correction. No purpose such as skill repair is inferred from unrestricted reason text. No free-text reasons, actor identities, names, emails or raw audit payload extracted.

Local outputs/latest-reconciliation.json retains full adjustment/event identifiers, Player identifiers, effective/recorded timestamps, requested/before/applied/after values, replay order, safe contract type and placement. Generated snapshot is ignored; rerun extraction rather than commit raw production records. This report uses analytic aliases and abbreviated IDs below; all25 included.

| Adjustment prefix | Player alias | Effective UTC | Recorded UTC | Before | Requested | After |
|---|---|---|---|---:|---:|---:|
| 2f769398 | P06 | 2026-10-08T08:04:00+00:00 | 2026-10-08T08:12:40.120394+00:00 | 5.586 | 2 | 7.586 |
| f8b787c7 | P06 | 2026-10-08T08:12:00+00:00 | 2026-10-08T08:13:20.51213+00:00 | 7.586 | -4 | 3.586 |
| 5e64a11b | P11 | 2026-10-08T08:13:00+00:00 | 2026-10-08T08:14:18.886835+00:00 | 4.706 | -1 | 3.706 |
| 542c3d01 | P13 | 2026-10-08T08:14:00+00:00 | 2026-10-08T08:15:03.319766+00:00 | 2.443 | 1 | 3.443 |
| 71f793dd | P16 | 2026-10-08T08:14:00+00:00 | 2026-10-08T08:15:42.376743+00:00 | 3.339 | -0.4 | 2.939 |
| 24bef572 | P07 | 2026-10-08T08:15:00+00:00 | 2026-10-08T08:16:40.905913+00:00 | 3.486 | -1 | 2.486 |
| 824ea079 | P14 | 2026-10-08T08:16:00+00:00 | 2026-10-08T08:17:01.835544+00:00 | 4.017 | -0.5 | 3.517 |
| 8f066add | P19 | 2026-10-08T08:16:00+00:00 | 2026-10-08T08:17:33.531132+00:00 | 4.588 | -0.5 | 4.088 |
| 840619d5 | P04 | 2026-10-08T08:17:00+00:00 | 2026-10-08T08:17:51.458356+00:00 | 4.484 | -0.5 | 3.984 |
| 897876ea | P02 | 2026-10-08T08:17:00+00:00 | 2026-10-08T08:18:09.546957+00:00 | 3.949 | -1 | 2.949 |
| 37df37ed | P15 | 2026-10-08T08:18:00+00:00 | 2026-10-08T08:19:12.73839+00:00 | 4.947 | -2.4 | 2.547 |
| 6ef10661 | P08 | 2026-10-08T08:19:00+00:00 | 2026-10-08T08:19:45.372458+00:00 | 4.058 | -0.5 | 3.558 |
| c36b1cf4 | P03 | 2026-10-08T08:19:00+00:00 | 2026-10-08T08:20:14.27922+00:00 | 4.496 | -0.5 | 3.996 |
| ceef96b2 | P09 | 2026-10-08T08:20:00+00:00 | 2026-10-08T08:20:42.51853+00:00 | 4.151 | -0.5 | 3.651 |
| 2b5072ff | P05 | 2026-10-08T08:20:00+00:00 | 2026-10-08T08:21:00.81955+00:00 | 4.538 | -0.5 | 4.038 |
| 91434660 | P18 | 2026-10-08T08:20:00+00:00 | 2026-10-08T08:21:41.865412+00:00 | 3.990 | -1.5 | 2.490 |
| 205d85ed | P10 | 2026-10-08T08:21:00+00:00 | 2026-10-08T08:22:22.68077+00:00 | 3.585 | -1.5 | 2.085 |
| ef0d5024 | P12 | 2026-10-08T08:22:00+00:00 | 2026-10-08T08:22:58.648507+00:00 | 2.704 | 1 | 3.704 |
| 9abd1196 | P20 | 2026-10-08T08:22:00+00:00 | 2026-10-08T08:23:26.129486+00:00 | 3.204 | -0.5 | 2.704 |
| b71a6e24 | P03 | 2026-10-08T08:23:00+00:00 | 2026-10-08T08:24:55.937864+00:00 | 3.996 | -0.5 | 3.496 |
| ffa55eb5 | P19 | 2026-10-08T08:24:00+00:00 | 2026-10-08T08:25:47.025195+00:00 | 4.088 | -0.29 | 3.798 |
| 83ae4aa0 | P01 | 2026-10-08T08:25:00+00:00 | 2026-10-08T08:26:31.430928+00:00 | 3.894 | -0.3 | 3.594 |
| 8945679b | P05 | 2026-10-08T08:26:00+00:00 | 2026-10-08T08:27:15.932104+00:00 | 4.038 | -0.14 | 3.898 |
| 476a3a39 | P20 | 2026-10-08T08:27:00+00:00 | 2026-10-08T08:28:12.31754+00:00 | 2.704 | 0.5 | 3.204 |
| eddbc057 | P17 | 2026-10-08T08:28:00+00:00 | 2026-10-08T08:29:05.152527+00:00 | 4.120 | -0.51 | 3.610 |

Latest opt-in production monitor capture2026-10-08T08:46:13.775211Z observed **31 adjustments**, all post-cutoff (pre0),20 Players,11 repeatedly adjusted Players. Six additional rows appeared after the initial25-row capture; this task did not create them. Latest requested/applied absolute magnitude26.16; min0.14/max4/median0.5. No reversal rows. Latest exact control compares2789 values with mismatch0. Latest manual pool projection drift-11.960; combined A-11.707 / D-11.727 (engine A+0.253 / D+0.233). Prospective/clean/affected/newcomers remain0. Source snapshots are timestamped rather than assuming production remains static. Initial25-row dataset and its deterministic replay evidence are retained separately; outputs/latest-monitor-reconciliation.json holds the final31-row inventory.

# 4. Timeline classification

By effective_at: PRE-CUTOFF0 / POST-CUTOFF25. By created_at: PRE-CUTOFF0 / POST-CUTOFF25. Effective range08:04–08:28Z, recorded range08:12:40.120394–08:29:05.152527Z on2026-10-08. All are later than freeze. No baseline extraction inconsistency detected. Future pre-cutoff effective events or pre-cutoff recorded events absent from baseline block strict validation, even if legitimate backdated business corrections. They are not automatically corrupt.

# 5. Player impact

20 adjusted Players,5 adjusted more than once. Requested absolute magnitude23.04, min0.14/max4/median0.5. Applied absolute magnitude23.040, min0.140/max4.000/median0.500. All25 interventions have NO_PROSPECTIVE_MATCH placement because no new matches exist. All are after the latest existing Rated match2026-10-02T03:39Z; this is distinct from claiming AFTER_LATEST_PROSPECTIVE when that set is empty. No adjusted Player currently has zero historical Rated matches.

# 6. Prospective match impact

New Rated matches0, CLEAN0, ADJUSTED-STATE0, SAME-DAY/ORDER-SENSITIVE0. No current prospective sample loss can estimate future P2 costs. For future matches, classify participant exposure using full authoritative ordering; same-day UTC is a separate diagnostic flag, not an invented exclusion threshold. Keep exact timestamp ties and recorded-after-match flags. A same-time adjustment follows the match. Historical rebuilt rating_before is labeled retrospective; actual pre-result state is UNKNOWN without sealed as-of evidence.

# 7. Methodological risks

Manual intervention can encode human skill/outcome information. Identical intervention does not make it random or remove confounding. Effective_at determines current full rebuild; created_at determines earliest information availability. Never insert a later-recorded/backdated event into an earlier sealed forecast. Later rebuilds can revise prior ratings through recency or late source data. Reconstructing today's projection is not proving what a client saw before a historical result. Strict prediction rows need immutable source-prefix/seed/intervention availability evidence, matching both models. Protocol choice is outcome-blind; no A/D performance comparison is used to choose P3.

# 8. Protocol P1

Production-state replay: same requested source amount, effective timeline and order in both models. Clamp to each model's own bounds and apply native numeric rounding. Applied delta may differ because model states differ; forcing equal applied deltas would violate production semantics. Retains representative data and operational context; human-information bias remains. Match forecast evaluation must respect recorded availability, not merely final effective ordering.

# 9. Protocol P2

Exclude a match when any participant has a preceding post-cutoff manual adjustment under authoritative ordering. Maintain excluded IDs/reasons, never delete production rows. Useful sensitivity analysis but not primary: selection bias, lost coverage and poor operational representativeness. CLEAN means no direct prior participant adjustment; indirect exposure via previous opponents/partners can remain. Do not describe this subset as a causal counterfactual with no intervention. Coverage of clean subset reported separately; no new numeric clean quota invented.

# 10. Protocol P3

Primary conditional prediction comparison uses P1; report P2 clean-participant sensitivity alongside it. Preserve full trajectories; do not remove earlier affected match updates from model history simply because those rows are excluded from a sensitivity metric. The independent models keep their own seeds and evolving ratings; never substitute A states for D. Controls pass current production, exact ordering is known and source supports additive events; therefore P3 is technically supportable.

# 11. Selected protocol

**P3**, preparation lock in protocol.json. Reason: known additive/clamped semantics, immutable ledger, deterministic ordering and exact A reproduction with all25 events. This does not select D, approve production changes or certify prospective evidence. A/B remain frozen; B2 is a separately named extension. Revalidate each capture. Unresolvable ordering, missing/malformed event, unsupported version, seed/baseline drift or replay mismatch blocks the extension.

# 12. Model fairness

Identical source intervention tuple is (adjustment_id, Player, effective_at, replay_order, requested_amount). Compare tuple lists exactly for A/D. Corrections are append-only inverse source amounts at the original effective time with later replay_order. Clamp can make correction non-inverse in realized ratings; never assume cancellation or replace it with an absolute target. Current25 are original adjustments. Initial Rating correction RPC changes seed/current only before history; it is not an adjustment. Seed changes require as-of seed review and cannot silently rewrite frozen baseline.

# 13. Newcomer handling

Known prospective newcomers manually intervened before match15:0. For future first-ever post-cutoff cohorts, tag intervention before thresholds5/10/15 separately; retain prediction metrics if captured honestly. Censor natural convergence at first effective intervention or earlier known intervention availability, conservatively whichever invalidates the trajectory first. The unadjusted prefix can be described, never count manual movement as engine learning. Also exclude natural later proxy spanning intervention/seed change; cohort attrition and missing clean follow-up remain explicit. Coverage participation and natural-convergence eligibility are different counts. No forced new threshold or automatic waiver of B newcomer safety gate.

# 14. Stability handling

Match-engine delta/volatility excludes all manual events. Report administrative requested/applied movement separately. Post-intervention match-only stability can be reported conditionally, stratified by exposure. Do not combine trajectory jumps with K/sensitivity volatility or claim a clean natural-convergence rate. Current snapshot only validates reconstruction; no prospective paired stability result exists.

# 15. Rating pool decomposition

Full-history retrospective A: engine drift+0.253; administrative projection drift-14.040; combined-13.787. D: engine+0.233; administrative-14.040; combined-13.807. Administrative raw-derived versus projection rounding drift0.000 in both current models. These are accounting checks, not post-freeze forecasting evidence or selection metrics. Prospective engine drift currently0 (no new matches), prospective administrative projection drift-14.040. Identity combined=engine+administrative projection is required; explicitly report requested amount versus clamped/applied and projection rounding.

# 16. Replay/order rules

Production engine MD5b3b434e407c1828bbb6dbf2907148104 unchanged. production-contract.json records exact catalog hashes/types captured read-only. Existing Calibration A SQL snapshots provide source; normalized definition parity verified for rebuild/record/correct/initial-correction. Order: event_time ascending; MATCH before ADJUSTMENT; match_number ascending NULLS LAST; replay_order ascending NULLS LAST; event UUID ascending. Effective time is used for adjustment. Stable replay_order required. Each match computes all four deltas from pre-state before applying updates; adjustment does not increment match experience.

Match stored ratings numeric(6,3), shares/delta numeric(8,5), ROUND_HALF_UP. Adjustment event numeric fields unconstrained; players projection rounds to3 decimals. Preserve raw adjustment after and projected next state separately. Recency uses latest Rated match date of the current snapshot, matching full engine rebuild; it is not a prospective forecast algorithm.

A control:2765 fields compared (240 match events x11 +25 adjustment events x4 +25 projections), mismatch0. No ordering ambiguity observed. Model D replay is frozen sensitivity1.2 only; no search. A/D requested interventions identical. Deterministic local replay passes. Do not use derived event created_at as immutable business order; rebuild regenerates it.

# 17. B1 quality-gate change

Prepared opt-in `--adjustment-protocol P3` runs complete read-only extraction/reconciliation first. Valid post-cutoff events return ACCOUNTED EXOGENOUS EVENTS warning, not blanket adjustment-count corruption. Pre-cutoff inconsistency, nonfinite/malformed source, unsupported semantics, missing/duplicate events, baseline drift, ordering or control projection failure still block. The legacy default remains fail-closed until operator explicitly selects this extension. Existing B frozen validator/config/manifest remain unchanged.

B1 false-block is resolved for this prepared P3 path. It aggregates observed full and clean coverage, while VERIFIED counters remain zero without intervention-aware sealed forecasts. Existing `--evidence` is rejected in the P3 path: its contract does not yet bind the intervention ledger/as-of model state, so it cannot silently bypass frozen B's zero-adjustment assertion. Strict sealed forecast ingestion is a future reviewed implementation, not claimed complete here. This conservative limitation blocks evidence-based checkpoint/C entry, not legitimate operational adjustment accounting.

# 18. Fixtures/tests

Ten committed synthetic offline scenarios: none, before first, between, repeated same Player, multiple Players, newcomer, same timestamp, unexpected pre-cutoff, nonfinite, identical A/D intervention.25 focused B2 tests plus4 B1-extension tests cover source/settings/manifest drift, duplicates, late recording, rounding/clamp, correction semantics, deterministic order, blocked pre-cutoff and no fabricated C eligibility. Calibration A reproducibility PASS; B10/10, B1 30/30, B2 25/25 and extension4/4 PASS. Python AST/UTF-8/no BOM/no U+FFFD, trailing whitespace and git diff checks PASS. Frozen hashes unchanged. No live mutation test.

# 19. Monitoring output

MANUAL ADJUSTMENT INTERVENTIONS includes post-cutoff count, adjusted Players, clean/affected matches, manually intervened newcomers, protocol, pool decomposition and warnings. Full JSON retains local detailed inventory and match map; Markdown/console include summary. Generated snapshots remain ignored. Latest prepared P3 monitor verified PRE-MINIMUM, verified matches0, C NO, accounted31 adjustments (initial capture25). Blocked source quality suppresses eligibility.

# 20. Calibration C implications

Manual adjustments alone neither qualify nor disqualify C. Strong+all frozen coverage+quality+frozen integrity+valid adjustment protocol still required. Current verified sample0 means C NO. Clean-subset insufficiency or disagreement leaves intervention-sensitive fairness/natural-convergence claims UNKNOWN and requires more naturally occurring clean/diverse data plus review; do not invent an exposure percentage or loosen B gates. Strong metrics requiring unadjusted newcomer proxy cannot be waved through because adjusted predictions look good. No C analysis started.

# 21. Operational procedure

Run `python analysis/rating-calibration01-b/monitor_checkpoint.py --adjustment-protocol P3`. Uses existing linked Supabase CLI read-only transaction, no business RPC calls. Inspect account/replay warnings and observed-versus-verified counters. Default legacy command still blocks unsupported adjustments as before.

For offline reconciliation: `python analysis/rating-calibration01-b2/reconcile_adjustments.py --input <local-read-only-dataset.json>`. Input must use extract-readonly.sql schema, not aggregate count attestations. Full live source captured in memory by extension; do not commit production snapshots. Review effective AND recorded availability before any strict forecasting extension. On source/continuity/order failure stop; never delete interventions or edit A/B to get PASS.

# 22. Final status

**ADJUSTMENT PROTOCOL READY** — P3 protocol and opt-in accounting preparation, not deployment, not prospective metrics readiness. Both initial25 and final31 contract-compatible post-freeze interventions reconcile exactly; baseline unchanged. No corruption allegation. Strict intervention-aware sealed evidence ingestion is explicitly unavailable, so no checkpoint or C approval is inferred. Production mutation NO; stage/commit/push/deploy NO. No backend/frontend application or migration changes. Do not start Calibration C.

## B1+B2 version-control closeout gates

Fresh read-only capture 2026-10-08T08:54:18.581959+00:00: adjustments31, pre-cutoff0/post-cutoff31, adjusted Players20, prospective matches0; control fields2789, mismatches0. A reproducibility PASS; B10/10, B1 30/30, B2 25/25 and extension4/4 PASS. Eight B1 CLI fixtures and deterministic outputs/replay PASS. Frozen/no-retuning/no-look-ahead/chronological and negative-event gates PASS. Python AST/UTF-8/no BOM/no U+FFFD/trailing whitespace and sensitive-content review PASS. Generated production/checkpoint snapshots remain ignored.

This separate closeout authorizes version control of the reviewed preparation artifacts. The no-stage/commit statement in section22 describes the earlier B2 preparation phase. No production DB/Rating/Edge/migration/frontend asset change is authorized or included. B1 strict/default PASS (safe block); P3 PASS (PRE-MINIMUM, intervention warning, C NO). Sealed forecast ingestion with interventions is NOT IMPLEMENTED. Next state DATA COLLECTION IN PROGRESS; next technical requirement intervention-aware sealed forecast ingestion before adjusted-state prospective performance claims.

### B1 — 17 files

- `PICK-RATING-CALIBRATION01-B1-CHECKPOINT-MONITOR-2026-10-08.md`
- `analysis/rating-calibration01-b/MONITOR-README.md`
- `analysis/rating-calibration01-b/build_monitor_fixtures.py`
- `analysis/rating-calibration01-b/checkpoint_core.py`
- `analysis/rating-calibration01-b/checkpoint_protocol_lock.json`
- `analysis/rating-calibration01-b/checkpoint_readonly.sql`
- `analysis/rating-calibration01-b/checkpoints/.gitignore`
- `analysis/rating-calibration01-b/monitor_checkpoint.py`
- `analysis/rating-calibration01-b/monitor_fixtures/count-coverage-incomplete.json`
- `analysis/rating-calibration01-b/monitor_fixtures/data-quality-failure.json`
- `analysis/rating-calibration01-b/monitor_fixtures/exact-minimum.json`
- `analysis/rating-calibration01-b/monitor_fixtures/pre-minimum.json`
- `analysis/rating-calibration01-b/monitor_fixtures/preferred.json`
- `analysis/rating-calibration01-b/monitor_fixtures/strong-one-doubles-missing.json`
- `analysis/rating-calibration01-b/monitor_fixtures/strong.json`
- `analysis/rating-calibration01-b/monitor_fixtures/zero-new.json`
- `analysis/rating-calibration01-b/test_checkpoint_monitor.py`

### B2 — 19 files

- `PICK-RATING-CALIBRATION01-B2-MANUAL-ADJUSTMENTS-2026-10-08.md`
- `analysis/rating-calibration01-b2/extract-readonly.sql`
- `analysis/rating-calibration01-b2/fixtures/01-no-adjustments.json`
- `analysis/rating-calibration01-b2/fixtures/02-before-first.json`
- `analysis/rating-calibration01-b2/fixtures/03-between.json`
- `analysis/rating-calibration01-b2/fixtures/04-multiple-same-player.json`
- `analysis/rating-calibration01-b2/fixtures/05-multiple-players.json`
- `analysis/rating-calibration01-b2/fixtures/06-newcomer.json`
- `analysis/rating-calibration01-b2/fixtures/07-same-timestamp.json`
- `analysis/rating-calibration01-b2/fixtures/08-pre-cutoff.json`
- `analysis/rating-calibration01-b2/fixtures/09-nonfinite.json`
- `analysis/rating-calibration01-b2/fixtures/10-identical-interventions.json`
- `analysis/rating-calibration01-b2/monitor_extension.py`
- `analysis/rating-calibration01-b2/outputs/.gitignore`
- `analysis/rating-calibration01-b2/production-contract.json`
- `analysis/rating-calibration01-b2/protocol.json`
- `analysis/rating-calibration01-b2/reconcile_adjustments.py`
- `analysis/rating-calibration01-b2/test_adjustments.py`
- `analysis/rating-calibration01-b2/test_monitor_extension.py`

Exact allowed commit scope:36 files; no generated snapshots, handoff, audit-output.txt or supabase/.temp. Frontend asset hashes must remain identical before/after Pages build. Commit SHA, push and Pages completion are reported separately after execution.
