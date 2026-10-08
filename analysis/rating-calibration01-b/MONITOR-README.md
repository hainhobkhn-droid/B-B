# B1 checkpoint monitor

Single-command read-only extraction, quality validation, aggregation, gate evaluation and local console/JSON/Markdown output:

```text
python analysis/rating-calibration01-b/monitor_checkpoint.py
```

Requires the existing authenticated Supabase CLI (`--supabase` can select its executable). Uses B&B PICK project bflwaqlvnesuqoyikxar. The CLI query is BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY / SET LOCAL UTC / SELECT / ROLLBACK. It never calls a mutation RPC, performs a migration, reads auth tables or runs git. Extraction failures block; no cached/gross/legacy fallback.

Frozen config, candidate manifest and existing validation helper are checked against checkpoint_protocol_lock.json, which records B commit 5e4e23b1c4bd2ecf143ef46c6687bf795e73c370. No cutoff update, threshold duplication or parameter search. Detail rows only cover played_at > frozen cutoff; historical input is aggregated only for global integrity, baseline presence, cumulative experience and first-ever rated date. Players represented by UUID only, no profile/contact/auth data.

## Outputs and offline fixtures

Default: checkpoints/latest-checkpoint.json and latest-checkpoint.md, local only. checkpoints/.gitignore ignores all generated snapshots/temporary query files except itself. --json and --markdown choose output paths; --snapshot additionally saves UTC-dated copies. No automatic commit.

```text
python analysis/rating-calibration01-b/monitor_checkpoint.py --offline --input analysis/rating-calibration01-b/monitor_fixtures/exact-minimum.json --json analysis/rating-calibration01-b/checkpoints/examples/minimum.json --markdown analysis/rating-calibration01-b/checkpoints/examples/minimum.md
```

Eight fixture files are aggregate-contract SYNTHETIC tests. They are rejected without --offline and every output is labeled NOT PRODUCTION EVIDENCE. Tests additionally validate a raw four-player fixture through extraction-schema validation/aggregation; no fixture credentials or real identities are present.

## Prospective evidence is a separate requirement

Source after-cutoff events are retrospective because the engine fully replays history. Monitor distinguishes observed primary CLUB_RATED/POINTS counts/coverage from verified prospective evidence used by gates. No evidence => no verified coverage, no D metrics and no Calibration C eligibility. Cumulative >=5/10/20 gates remain B semantics; prospective >=5/10/20 counters are additional diagnostics.

Optional --evidence accepts a locally sealed JSON bundle: rows use B validation_metrics CSV field names; each also includes sealed_pre_ratings and sealed_d_pre_ratings maps keyed by the four lineup Player UUIDs, source_prefix_sha256 and seed_snapshot_sha256. quality uses B's quality schema plus no_retuning_verified=true. Manifest SHA must match frozen_candidates.json. Forecast timestamps must precede played_at/outcome availability; scores/lineups must match current source; expected values must match the frozen sensitivity and respective model's own supplied pre-state. This recomputes only the expected-share expression, not engine replays. Neither model is initialized from the other's post-state.

Digest/timestamp/boolean attestations do not independently prove pre-result sealing, initial-seed availability or correct prefix replay. Operator must retain reviewable immutable snapshots. This tool does not implement a shadow forecaster or certify its replay. decision_review.independently_reviewed plus every configured threshold key explicitly true records external B performance/fairness/stability review; absent review remains UNKNOWN. C eligibility is stricter than count-only, and never an approval to deploy D.

## Strict-mode historical finding and B2 extension

Live read-only check on 2026-10-08 found25 manual adjustments, versus frozen A/B baseline0. Projection mismatch0, source hash unchanged, orphan/duplicate/cardinality/nonfinite/result errors0. Frozen B explicitly pauses validation if adjustments become nonzero until a reviewed replay extension exists. Monitor correctly emits BLOCKED — DATA QUALITY withholds eligibility. These records are not claimed corrupt, and must not be deleted/ignored. No protocol/backend changes made to force PASS.

## Tests

```text
python analysis/rating-calibration01-b/test_checkpoint_monitor.py
python analysis/rating-calibration01-b/test_validation_metrics.py
```

Thirty B1 tests cover eight offline statuses, raw aggregation, cutoff/old IDs, dates/Players/newcomers, bucket boundaries, doubles/matched means, quality/manifest drift, no retuning, sealed/late forecast evidence, remaining deficits, determinism and read-only SQL. Synthetic Strong YES is explicitly simulated, never live.

## Canonical operational command after B2

While legitimate post-cutoff adjustments exist, use the explicit P3 extension:

```text
python analysis/rating-calibration01-b/monitor_checkpoint.py --adjustment-protocol P3
```

P3 is opt-in, never implicit. It performs complete control replay before accounting for interventions. Valid post-cutoff adjustments produce ACCOUNTED EXOGENOUS EVENTS warnings; pre-cutoff inconsistency, malformed/nonfinite events, unsupported semantics, ordering/continuity or projection failures still block. Primary protocol applies identical requested interventions/order to each model's own clamped state; clean-participant subset is sensitivity analysis. See the B2 report and analysis/rating-calibration01-b2/protocol.json.

The default command retains frozen strict behavior and blocks adjustments without this extension. Baseline manual adjustments=0 remains the historical freeze fact; current runtime count is not a baseline rewrite.

**Sealed forecast ingestion with interventions is NOT IMPLEMENTED.** P3 rejects --evidence rather than silently accepting the legacy evidence contract. Retrospective replay is not prospective validation. Observed counts/coverage can continue; verified evidence counters remain zero without a reviewed ingestion implementation. Operational state: DATA COLLECTION IN PROGRESS. No Calibration C, candidate approval or Rating formula change.
