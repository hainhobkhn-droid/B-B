# Calibration B — collection and validation plan

Planning only. No data collection automation, prediction engine, production extraction/write, migration or formula change. Calibration A remains MORE DATA REQUIRED. Authoritative plan: ../../PICK-RATING-CALIBRATION01-B-2026-10-08.md.

Targets: +160 / +240 / +400 truly new pre-result-sealed primary games (totals220/300/460), with20/30/50 new UTC dates and all coverage gates. The rare matched-mean mixed/balanced cell (3/60 historical games) dominates counts. Counts alone cannot authorize implementation.

Frozen candidates: A sensitivity .9 and exploratory D sensitivity1.2; everything else identical. frozen_candidates.json records exact source/config/commit/freeze time. No adaptive tuning on incoming results. checkpoint_config.json records practical guardrails and quotas, not certified power guarantees.

## Reproduce current diagnostics (standard Python 3 only)

```text
python coverage_statistics.py --output planning_statistics.json
python -m unittest discover -p "test_*.py"
```

Default A inputs are ../rating-calibration01-a. Optional --baseline points to another locked A folder. coverage_statistics consumes archived outputs, never imports the top-level A engine or reruns a grid. planning_statistics.json is deterministic, including seeded historical bootstrap. Historical positive intervals are exploratory/post-selection and do not validate the candidate.

## Future sealed-forecast metrics

```text
python validation_metrics.py --forecasts sealed_forecasts.csv --quality-json verified_quality.json
```

CSV columns: match_id, match_type, score_mode, played_at, prediction_recorded_at, outcome_known_at, manifest_sha256, expected_a, expected_d, actual_share, score_a, score_b, forecast_source. Use timezone-aware ISO timestamps. forecast_source must equal sealed_pre_result. Candidate inputs/predictions must come from independent model-specific prefix replays, sealed before the game/result; this metrics script DOES NOT calculate or certify engine predictions.

Quality JSON: formula_md5, manifest_sha256 (SHA256 of exact manifest bytes), as_of_seeds_verified=true, forecasts_sealed_before_outcome=true; projection_mismatch, orphan_events, duplicate_events, cardinality_errors, ordering_errors, nonfinite_values, result_errors all0. It must be backed by separately verified read-only catalog/data checks and immutable local source snapshots. User-supplied booleans/CSV timestamps are not proof of a secure or genuinely prospective forecast. No auth credentials belong in analytical files.

The CLI fails closed on missing quality/as-of evidence, old or duplicate match IDs, source/parameter/manifest drift, invalid shares/scores or late/unsealed predictions. It prints descriptive metrics only, never automatic GO. Fairness, newcomer maturity, diversity subset and influence review are manual gates defined in the plan; they are not implemented by this small metrics utility.

A future reviewed local shadow forecaster is an operational prerequisite for true prospective capture. Existing reconstructed events cannot substitute for missing pre-result snapshots. Do not count retrospective/backdated outcomes as new validation. No production telemetry schema changes are proposed.
