# 1. Objective

RATING-CALIBRATION01-B1 — one-command read-only checkpoint monitoring. Implementation/local gate tests complete; **final operational status: BLOCKED** because current production contains25 manual adjustments and frozen B requires a reviewed replay extension before primary validation. No Rating/backend behavior change, no retuning and no Calibration C.

# 2. Frozen baseline

A research commit99eb2837deb1834a4b307ca75243f6a47b21f97a; B protocol commit5e4e23b1c4bd2ecf143ef46c6687bf795e73c370. Read both reports, A/B analytical artifacts and contracts plus AGENTS. Existing files remain byte-identical. checkpoint_protocol_lock.json pins existing config, candidate manifest and validation helper SHA256. A sensitivity0.9, D1.2; no search or retuning. Parameters, quotas and definitions read from locked config/manifest, never copied into monitor thresholds.

# 3. Data source

Existing Supabase CLI db query to B&B PICK project bflwaqlvnesuqoyikxar. Detail rows: positive-weight APPROVED matches strictly after cutoff; only match/lineup/Player UUIDs, scores and relevant events. Historical rows are not exported; aggregate queries provide global projection/integrity, baseline presence, first-ever rated date and cumulative experience. Primary evidence remains CLUB_RATED/POINTS; other post-cutoff rated types are reported separately in observed total.

# 4. Read-only contract

Transaction REPEATABLE READ READ ONLY, SET LOCAL UTC, catalog/data SELECT, ROLLBACK. No business RPC, rebuild invocation, SQL write, migration, Edge, auth-table access or git action. One capture provides a consistent view. CLI errors/timeouts fail closed, never fallback to old cached dataset. Default command writes only local aggregate snapshots under ignored checkpoints/; no raw auth/contact data exported. The CLI does not obtain/extract credentials; it uses existing installed authentication.

# 5. Cutoff

Immutable2026-10-08T07:36:51.561032Z and the60 historical match UUIDs in frozen manifest. played_at equal cutoff is excluded; baseline IDs are always excluded even if timestamps are edited later. All60 source rated IDs must still be present; missing baseline inventory blocks. Old holdout and synthetic data cannot count as new live evidence. Offline fixtures are explicitly synthetic and prohibited in online mode. Future played_at beyond capture time blocks.

# 6. Quality gate

Global projection mismatch, orphan/duplicate active events, rated event cardinality, finite values, score/result consistency, active settings/weights/source hash and baseline inventory checked before any checkpoint computation. Python also validates selected match identities, four distinct participants/two per team, event mapping, actual share, deterministic chronological order and within-selected-player pre/post continuity. Precision tolerance derives from frozen numeric scales. Manual adjustments must remain zero per B's explicit supported replay boundary; nonzero is not inherently corrupt data, but requires a reviewed extension.

Latest live read-only evidence2026-10-08T08:31:01.533918Z (earlier08:21 capture had16 adjustments, total rated60 and baseline present60): source MD5b3b434e407c1828bbb6dbf2907148104 unchanged; projection/cardinality/duplicate/orphan/nonfinite/result errors0; **manual adjustments25**. Workflow returns **CHECKPOINT STATUS: BLOCKED — DATA QUALITY** and withholds eligibility. It does not delete, ignore or rewrite adjustments to obtain PASS. No progress/eligibility computed on this failed quality gate.

# 7. Core counters

Observed post-cutoff primary data is distinguished from VERIFIED prospective evidence. Source events are retrospective after full replay, so observed pre-ratings cannot masquerade as sealed pre-result states. Verified counts drive checkpoint gates. Both observed and verified sections report new matches, UTC days, unique Players and prospective >=5/10/20 counts. Gate >=5/10/20 counts retain B's CUMULATIVE semantics; this deliberate distinction prevents silently changing B when B1 requests prospective counters.

Newcomer first-ever source date must be after cutoff and present as the earliest selected game, then track first/5/10/15/25. Gates require B cohort counts all reaching15, and Strong also25 for mature follow-up. Counts alone do not establish convergence or skill truth.

# 8. Rating-gap coverage

Four bins from config.gap_edges, lower inclusive/upper exclusive; all four individually compared with each level's per_gap_bucket. Minimum16, Preferred25, Strong45. Display current/target/remaining/PASS or NOT YET. Strong also requires the same coverage on deterministic diversity subset. Tail2+ and expected-share bands retain B diagnostic quotas; no independent win-probability claim.

# 9. Doubles coverage

Frozen composition cutoffs define balanced/balanced, mixed/balanced and mixed/mixed; intermediate compositions remain separate. Per-core-group quotas16/25/45, each independently required. No redefining groups to inflate coverage. For verified coverage use sealed CONTROL pre-state; retrospective source coverage is labeled observational.

# 10. Matched-mean coverage

Mixed/balanced plus absolute team mean gap<=config matched-team threshold. Prominent output alongside historical3/60 reference. Minimum8, Preferred12, Strong20 required. Deficit highlighted first in actionable missing summary.

# 11. Repeat dependence

Canonical unordered teammate pairs, cross-team opponent pairs, quartets and identical team matchups. Report distinct/repeated counts, beyond-first observations, max frequency and top shares. Player appearance, per-Player partner concentration and date-share limits load from B config. Other pair/quartet concentration is informational, not an invented rejection threshold. Diversity subset uses deterministic chronological business-number/UUID order, cap2 per matchup/quartet and8 per UTC date from config. Outcome-blind selection never deletes production matches.

# 12. Frozen A/D metrics

Optional --evidence bundle uses B's sealed forecast validator and respective A/D pre-state maps. Validate source match/score/lineup parity, frozen manifest digest, pre-start/result chronology, finite bounded states, prefix/seed digests and expected-share expression using each model's own supplied state. No production A post-state is reused as D input and no engine or grid is implemented.

With valid evidence, paired score-share MSE/advantage/date bootstrap and later-half metrics are calculated; below Strong labeled INSUFFICIENT FOR DECISION. Without evidence, metrics are UNAVAILABLE and verified coverage zero. Stability/pool require independently reviewed shadow deltas/projections and remain explicitly unavailable from ordinary production A events; monitor never invents them. As-of timestamps/digests and caller attestations alone cannot prove genuine sealing or correct shadow replay. Operator must preserve independently reviewable source snapshots. This is a monitor, not a replacement for a reviewed shadow forecasting engine.

# 13. Checkpoint status logic

PRE-MINIMUM; MINIMUM REACHED; PREFERRED REACHED; STRONG REACHED; STRONG COUNT REACHED / COVERAGE INCOMPLETE; BLOCKED — DATA QUALITY. All applicable coverage/experience/protocol gates must pass, not merely count. Target levels160/240/400 new,220/300/460 total,20/30/50 days,25/30/35 Players,8/12/16 mature newcomers are read from B config. Each gate records current/target/remaining/status. Failed extraction/integrity returns nonzero exit and no eligibility.

# 14. Calibration C eligibility

No automatic candidate approval. Requires Strong coverage, quality PASS, immutable protocol/no-retuning, sealed prospective evidence and retained B decision review. Missing performance/fairness/stability review is UNKNOWN and eligibility NO. Primary MSE improvement/interval/later-half thresholds are also checked against actual supplied paired predictions. Other B safety thresholds require separately reviewed shadow evidence; explicit external review is not labeled machine verification. Synthetic Strong YES is an offline status-engine test only. Even a future real YES permits analysis entry, never D deployment.

# 15. CLI usage

```text
python analysis/rating-calibration01-b/monitor_checkpoint.py
python analysis/rating-calibration01-b/monitor_checkpoint.py --offline --input analysis/rating-calibration01-b/monitor_fixtures/exact-minimum.json --json analysis/rating-calibration01-b/checkpoints/examples/minimum.json --markdown analysis/rating-calibration01-b/checkpoints/examples/minimum.md
```

Options --supabase, --evidence, --json, --markdown, --snapshot, --offline/--input. Local input requires offline label. Existing non-snapshot source/protocol files cannot be overwritten by output flags. Read-only extraction errors contain sanitized failure status, no credential/stdout dump.

# 16. Output formats

Console plus default checkpoints/latest-checkpoint.json and .md. Optional UTC-dated snapshots. A scoped checkpoints/.gitignore ignores generated reports/query temp files while retaining itself; no repository-wide ignore change. Generated examples are local, not intended for commit. Normal reports show missing counts and each level's full gate table; blocked reports show quality cause and suppress eligibility.

# 17. Offline fixtures

Eight clearly synthetic aggregate-contract JSON fixtures: zero-new, pre-minimum, exact-minimum, count-coverage-incomplete, preferred, strong, strong-one-doubles-missing, data-quality-failure. These exercise status contracts, not production prediction evidence. Tests additionally construct raw four-player datasets and sealed/late forecast cases through real validation/aggregation. No account/credential creation.

# 18. Tests

30 focused B1 tests PASS: cutoff equality/old IDs, match/day/Player counts, newcomer first/progress, gap edges, doubles/matched means, Minimum/Preferred/Strong, count-only failures, eligibility withholding, data quality/nonfinite/source drift, no-retuning hash failure, late forecast/no-look-ahead, immutable A/D, remaining deficits, determinism, read-only SQL and fixture mode isolation. Calibration B10 tests and Calibration A exact reproducibility also rerun. Python AST, UTF-8 without BOM/U+FFFD, whitespace and git diff checks required before handoff.

# 19. Operational procedure

Run one command using existing CLI session. Quality must pass before counters/gates. Review observed versus verified split and hardest deficits. Supply genuine pre-result evidence only when a separately reviewed local shadow forecaster/operational capture exists. Do not fabricate retrospective evidence. At count checkpoints inspect all coverage and external safety review. Do not optimize candidate or start C from a mere match target. Current adjustments25 block primary validation under frozen B; review a separate extension/protocol decision before any future unblocking, preserving all legitimate history.

# 20. Safety

Production mutation NO. No formula, player Rating, match result, event, permissions/RLS, migration, Edge, frontend, account or capability change. No stage/commit/push. Existing A/B baseline files preserved. New code isolated to research monitoring; backup of locked B retained outside repository. No unrelated frontend suites needed.

# 21. Deployment/commit plan

Preparation only. Intended source: monitor_checkpoint.py, checkpoint_core.py, checkpoint_readonly.sql, checkpoint_protocol_lock.json, MONITOR-README.md, build_monitor_fixtures.py, test_checkpoint_monitor.py, eight fixture JSONs, scoped checkpoints/.gitignore and this report. No generated snapshot staged. Commit/deploy not performed; live monitoring operationally blocked pending25-adjustment protocol review. A/B tests continue using their frozen historical datasets, not rewritten production.

# 22. Final status

**BLOCKED** — production now has25 manual adjustments versus frozen baseline0, triggering the explicitly required B pause. Read-only extraction and fail-closed monitor behavior PASS; local implementation and fixture gates PASS. No Calibration C eligibility reported from the blocked live capture. Do not begin Calibration C, remove/ignore adjustments, retune or mutate production.

## B1+B2 baseline closeout clarification

The BLOCKED operational finding above is the initial B1 strict-mode snapshot, retained as history. B2 now supplies a reviewed explicit --adjustment-protocol P3 path; legitimate post-cutoff adjustments reconcile as exogenous events rather than a blanket corruption finding. Strict/default behavior remains unchanged. Baseline A/B manual adjustments=0 and frozen parameters remain immutable. Operational monitoring with valid interventions uses P3. Sealed intervention-aware forecast ingestion is NOT IMPLEMENTED; observed coverage is not verified prospective evidence. State remains DATA COLLECTION IN PROGRESS, not Calibration C.
