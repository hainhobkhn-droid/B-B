# 1. Objective

RATING-CALIBRATION01-A: analysis/design/simulation only. Recommendation: **MORE DATA REQUIRED**, confidence **LOW** for changing the model; confidence HIGH for reproducing this frozen numerical history. No production writes, source behavior changes, migrations, stage, commit, push or deploy.

# 2. Frozen production baseline

Repo baseline `8b03910d52da57506f9c3b0c6a83ef52712d44bc`. Read project state, final reconciliation, C1/C9 source evidence, AGENTS and the versioned production source catalog. Production snapshot takes precedence over historical migrations. Fresh read-only capture: 2026-10-08T04:18:40.148658+00:00, session timezone UTC. 25 Players (2 INACTIVE), 60 approved positive-weight matches, 240 events, zero adjustments. All 60 are CLUB_RATED / POINTS. Six draws. Match dates: {'2026-09-03': 16, '2026-09-10': 10, '2026-09-14': 1, '2026-09-17': 14, '2026-09-18': 2, '2026-09-19': 2, '2026-09-24': 1, '2026-10-01': 13, '2026-10-02': 1}.

Production function MD5:

| function | md5 |
| --- | --- |
| _approve_match_internal | f453af5f5da1bbf3618be571a8b25ffb |
| _get_active_rating_version | d2f0aeada41cdf2ec0746324ba266957 |
| _rebuild_ratings_internal | b3b434e407c1828bbb6dbf2907148104 |

These match the versioned authoritative baseline. Dataset contains UUIDs and Rating/business fields, no account/contact/password/auth data. Aliases P01â€“P25 are sorted UUID labels, not names. Raw analytical data is local and must be reviewed before any future publication. Existing unrelated local files are preserved.

# 3. Current formula

Authoritative sources: `supabase/source-snapshots/2026-10-08/production-catalog.json`, exact functions `_rebuild_ratings_internal`, `_approve_match_internal`, `_get_active_rating_version`, `record_rating_adjustment`, `correct_rating_adjustment`, `set_player_initial_rating_before_history` and `handle_new_member_signup`. Readable copies of these definitions accompany this analysis; they are reference copies, not migrations.

Active V1.1 settings: initial default 4; floor 2; ceiling 8; K .55; expected_sensitivity .9; provisional_matches 5; stable_matches 10; recency half-life 60 days; recency floor .35; per-match delta cap .35. Weights: TOURNAMENT 1, LEAGUE .95, CLUB_RATED .9, FRIENDLY_RATED .6, SELF_REPORTED .4 (historical-only approval), TRAINING 0. Current historical sample exercises only weight .9.

For a doubles match, take the exact mean of each team's two current Ratings BEFORE updating anyone: T_A=(r_A1+r_A2)/2, T_B=(r_B1+r_B2)/2. For player i on team t:

```text
E_t = 1 / (1 + exp((T_opponent - T_t) / .9))
POINTS: A_t = score_t / (score_A + score_B)
RESULT: A_t = 1 for win, 0 for loss, .5 for draw
D_max = latest played_at::date among APPROVED positive-weight matches
w_recency = max(.35, .5 ** (max(0, D_max - played_at::date) / 60))
p_i = 1.25 if prior same-version MATCH events < 5
      1.10 if prior same-version MATCH events < 10
      1.00 otherwise
g_i = A_t - E_t
delta_i = clamp(g_i * .55 * match_weight * w_recency * p_i, -.35, .35)
r_after_unrounded = clamp(r_before + delta_i, 2, 8)
```

No separate upset multiplier or extra margin multiplier exists. Upsets affect A-E; POINTS already uses score margin through share. Winners can lose Rating if their point share is below expected; losers can gain if above expected. This is intentional source behavior, not a winner-sign integrity error.

PostgreSQL numeric typmods matter: players initial/current and event before/after/team/opponent are numeric(6,3); event expected/actual/gap/delta numeric(8,5); weights/recency/provisional numeric(6,3). Calculation uses unrounded numeric intermediate values. Each event column rounds independently on INSERT; player projection is copied from event rating_after (3 decimals), NOT rating_before plus stored 5-decimal delta. A half-.001 team mean is not rounded before computing E. Simulation uses Decimal, half-away-from-zero column rounding; all stored fields matched exactly. Numeric precision does not imply bit-identical unpersisted transcendental intermediates.

Replay holds advisory transaction lock 726184501, resets every player to their own initial_rating, deletes derived events for the requested version, and replays APPROVED matches with weight>0 plus the complete source adjustment ledger. Ordering: event_time ASC, MATCH before ADJUSTMENT, match_number ASC NULLS LAST, adjustment replay_order ASC NULLS LAST, UUID ASC. All four player events are calculated before projection updates. Same date alone is not a tie; timestamp, business number and UUID resolve ordering. Event UUID/created_at are regenerated and are not mathematical replay identity.

Approval updates match status then invokes full rebuild in the same transaction, then Fund generation/audit; there is no separate incremental Rating formula. Backdated approvals/config changes can recompute the whole history. Recency refers to latest rated date, not wall clock, and adding a later match can retroactively alter older effects. Production date casts depend on session timezone; extraction UTC reproduces all persisted fields here. Another session timezone near midnight is a portability risk, not changed by this package.

Initial Rating: each Player's seed is the starting baseline, not a universal reset to settings.initial_rating. Self-signup parses raw_user_meta_data.initial_rating, falls back to active settings.initial_rating, validates active min/max and inserts the same seed into initial/current; ADMIN provisioning uses the same trigger. These workflows remain untouched. ADMIN pre-history correction guards existing history, sets initial/current together and audits; it is not a historical correction. Manual adjustments are signed append-only source rows ordered by effective_at/replay_order, clamp to bounds, and produce derived adjustment events. Correction appends negative original amount at the original effective time with later replay order and rebuilds; inverse amounts are not guaranteed algebraic inversion when clamps/intervening adjustments apply. This dataset has no adjustment rows, so these branches are source-audited, not historically calibrated.

# 4. Dataset quality

PASS: 60 matches each have exactly four distinct primary participants, two per team; 240 unique (match_id,player_id) events; no source/event cardinality mismatch; no orphan participant/event keys; numeric fields finite; scores nonnegative with positive total; sequence deterministic; player pre/post continuity and final projections match. All 11 stored numerical event fields were compared (2,640 values), plus 25 final Ratings: 2,665 exact comparisons, mismatch 0. Draws are recorded separately from wins/losses. No bad-data compensation by tuning.

Limit: historical seeds, score legitimacy and actual real-world playing strength are not independently validated by reproducing the database. Stored ordering may not equal actual finish order of concurrently played matches.

# 5. Rating distribution

| min | max | mean | median | sd | p10 | p25 | p75 | p90 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2.368000 | 5.586000 | 3.930800 | 4.017000 | 0.746473 | 2.904000 | 3.486000 | 4.484000 | 4.658800 |

Half-point histogram: {'2.0-2.5': 2, '2.5-3.0': 1, '3.0-3.5': 4, '3.5-4.0': 4, '4.0-4.5': 9, '4.5-5.0': 4, '5.5-6.0': 1}. Seven Players are within .1 of their own initial Rating; this includes unplayed Players (2). Experience groups: 0â€“5: 6 Players; 6â€“10: 8; 11â€“20: 11; 21+: 0. Highest count is 19. Concentration is descriptive, not proof of faulty calibration. No floor/ceiling runaway is established by observed 2.368â€“5.586 range.

# 6. Player trajectories

`player_trajectories.csv` contains every Player's initial/current, count, W/L/draws, mean absolute applied delta, largest signed gain/loss, delta SD, last-5/10 net change, trajectory range and sign changes. For fewer than 5/10 events these trends use all available events; they are not equal-duration comparisons. Volatility is SD of applied match deltas, not uncertainty in true skill. Mean |delta| first-five events 0.099278; after ten prior events 0.079600; these groups differ in players, opponents and dates, so this does not isolate K. Largest absolute event 0.350. Oscillation/sign reversals can reflect schedule and point shares. No independent stable-skill target exists to measure actual convergence time; no defensible claim of runaway/slow convergence from count<=19.

# 7. Predictive calibration

For POINTS, E is expected POINT SHARE, not a derived match-win probability. Primary metric is share MSE. Win Brier/log loss are explicitly labeled PROXIES using E as if a win probability; they must not select a production win-probability model. Draw proxy outcome=.5; favorite accuracy excludes draws and exactly equal teams. Archived retrospective pre-states: share MSE 0.065887; Brier proxy 0.245988; log loss proxy 0.788024; decisive favorite accuracy 51.85%. Leakage-aware prequential share MSE 0.062453; accuracy 53.70%.

`calibration_buckets.csv` reports 50â€“55/55â€“60/60â€“70/70â€“80/80+ expected-share favorite buckets, excluding draws/equal predictions. They are exploratory win frequency comparisons, NOT validated win probability calibration. Small, dependent cells preclude a reliable calibration-error conclusion. Do not treat a large residual as evidence of an exploit without context.

# 8. Rating-gap analysis

`gap_buckets.csv`: absolute team gaps [0,.25), [.25,.5), [.5,1), [1,2), [2,6.01). User example 25-point bins are inappropriate to the 2â€“8 scale. Per-bin count, mean favorite expected share, decisive favorite win rate and mean applied delta are exported. Empty/small bins cannot justify increasing upset rewards. Sign and size of A-E already encode over/underperformance; a result-only win model needs a separate empirical link.

# 9. Score-margin analysis

All historical matches use point share; no untreated result-only comparison exists. A descriptive strict-later-time Player pairing analysis finds 217 successive performance-residual pairs, correlation 0.207; repeats within players/matches are dependent. This is not causal, not an independent effective sample of 217, and not proof that margin improves future win prediction. Raw score format/pace, opponents, partner effects and seeds confound it. Model E is NOT run: no sufficient evidence for an additional bounded margin factor. Current bounded share already rewards point-share performance; adding another margin multiplier risks double counting and score farming.

# 10. Doubles/team fairness

34/60 matches have at least one within-team pre-rating gap >=1; largest gap 4.277. 32 repeated partner groups, maximum 8 matches per pair. Mean model treats [6,2] and [4,4] identically in expected share. Both teammates receive same raw performance gap, but individual experience multipliers can differ. Therefore individual causal contribution is unidentifiable from team scores alone. More varied partnerships and independent skill evidence are needed before calling mean aggregation unfair.

Design comparison only: weighted mean .6*strong+.4*weak implies strongest dominance; .4*strong+.6*weak implies weakest dominance; mean minus lambda*partner_gap implies an imbalance penalty; individual-contribution model needs identifiable latent player effects with connectivity/regularization. None is adopted or tuned on 60 matches. Equal means can have different real strength, but the sample cannot determine a reliable direction. Synthetic balanced_mixed tests document the current symmetry.

# 11. New-player convergence

No Player exceeds 19 rated matches; two are unplayed. Incorrect seeds can affect opponents through E and fixed match scores, especially repeated partners. C models increase early movement, but match cap limits acceleration; mixed experience multipliers also break zero-sum. Over/underseeded synthetic players have directional corrective behavior under stipulated repeated scores, not independently known skill or a measured time-to-stability. Larger K improves correction speed at a volatility cost. No IAM seed workflow change is recommended.

# 12. Candidate models

A control; B same formula K .35/.75; C provisional (1.5,5), (1.5,10), (2,5); D sensitivity .6/1.2. E not justified. All preserve weights, recency, caps, bounds, seed baseline and column rounding. Eight total configurations including control. No thousands-of-combinations search, no candidate supplied production post-states as inputs.

# 13. Parameter grid

| model | k | s | provisional | n_provisional |
| --- | --- | --- | --- | --- |
| A | 0.550000 | 0.900000 | 1.250000 | 5 |
| B_K0.35 | 0.350000 | 0.900000 | 1.250000 | 5 |
| B_K0.75 | 0.750000 | 0.900000 | 1.250000 | 5 |
| C_P1.5_N5 | 0.550000 | 0.900000 | 1.500000 | 5 |
| C_P1.5_N10 | 0.550000 | 0.900000 | 1.500000 | 10 |
| C_P2_N5 | 0.550000 | 0.900000 | 2 | 5 |
| D_S0.6 | 0.550000 | 0.600000 | 1.250000 | 5 |
| D_S1.2 | 0.550000 | 1.200000 | 1.250000 | 5 |

Selection criteria before recommendation: seek >=10% relative honest holdout point-share MSE improvement, no major stability/pool penalty, plausible newcomer/fairness improvement, and confirmation on NEW independent data. The numerical threshold is a decision heuristic, not statistical significance, and this historical exploratory exercise cannot validate it prospectively.

# 14. Control replay validation

PASS, mismatch=0. `control-validation.json` records 2,665 exact persisted comparisons. Numeric values, not regenerated UUID/timestamps, define replay equivalence. If any mismatch occurs the runner aborts BEFORE candidate comparison. Dataset requires zero adjustments; it fails explicitly rather than silently skipping them.

# 15. Historical simulation

Every candidate starts from all 25 own initial seeds and sequentially replays 60 matches. `candidate_events.csv`: 1,920 events. `candidate_player_ratings.csv`: 200 final ratings. `candidate_summary.csv` reports full replay, honest-online proxies, distribution, drift, volatility and rounding drift. Historical recency uses the final dataset date to reproduce production; retrospective metrics are explicitly in-sample/full-horizon, not deploy-time forecasts.

# 16. Holdout/walk-forward results

First 41 matches through 2026-09-17 form design/training; last 19 from 2026-09-18 form chronological evaluation. Split does not cut a day. For each forecast, rebuild only prior matches with latest date of that prefix; compute next expected share before incorporating its score. No final-horizon recency is used in prequential predictions. Same-time within-batch outcomes are assumed available in authoritative business order; deployment-time availability is unknown. Seeds are current historical seeds, without immutable as-of signup snapshots; seed availability can therefore not be certified as historically causal. Models are fixed before choosing the best training score; the holdout has now been inspected and is NOT reusable as a fresh confirmatory set.

| model | train_share_mse | holdout_share_mse | online_share_mse | mean_abs_delta |
| --- | --- | --- | --- | --- |
| A | 0.076823 | 0.031445 | 0.062453 | 0.089854 |
| B_K0.35 | 0.086808 | 0.036752 | 0.070957 | 0.061363 |
| B_K0.75 | 0.071718 | 0.028557 | 0.058050 | 0.114138 |
| C_P1.5_N5 | 0.073702 | 0.030261 | 0.059946 | 0.096158 |
| C_P1.5_N10 | 0.073184 | 0.029069 | 0.059214 | 0.103025 |
| C_P2_N5 | 0.071496 | 0.028362 | 0.057837 | 0.107579 |
| D_S0.6 | 0.096086 | 0.042925 | 0.079252 | 0.105133 |
| D_S1.2 | 0.064873 | 0.026055 | 0.052580 | 0.080488 |

Training-selected exploratory leader D_S1.2: holdout improvement 17.14%. No significance claim: only 19 matches over few dates with shared participants. A chronology/seed or match selection effect can exceed this difference. External future evaluation required.

# 17. Stability/inflation analysis

Initial pool 98.017; control final 98.270; drift +0.253, mean drift +0.01012. Do not compare the pool to 25*4: initial seeds differ.

| model | rating_sum | drift | sd | min | max | rounding_drift |
| --- | --- | --- | --- | --- | --- | --- |
| A | 98.270000 | 0.253000 | 0.746473 | 2.368000 | 5.586000 | 0.003038 |
| B_K0.35 | 98.226000 | 0.209000 | 0.822767 | 2.311000 | 6.207000 | -0.000481 |
| B_K0.75 | 98.330000 | 0.313000 | 0.707699 | 2.341000 | 5.225000 | 0.002577 |
| C_P1.5_N5 | 98.399000 | 0.382000 | 0.734738 | 2.352000 | 5.472000 | 0.001175 |
| C_P1.5_N10 | 98.507000 | 0.490000 | 0.722454 | 2.354000 | 5.407000 | -0.002079 |
| C_P2_N5 | 98.644000 | 0.627000 | 0.723471 | 2.326000 | 5.299000 | 0.000507 |
| D_S0.6 | 98.351000 | 0.334000 | 0.686138 | 2.421000 | 5.303000 | -0.002622 |
| D_S1.2 | 98.250000 | 0.233000 | 0.790818 | 2.341000 | 5.827000 | 0.000722 |

Equal teammate multipliers without caps/clamps imply raw complementary team gaps cancel. Unequal experience factors, independent caps, Rating bounds and 3-decimal projection rounding can break conservation. The engine is mathematically non-conserved; no source comment establishes a target deliberate inflation rate. Observed small drift is not proof of accidental runaway. Rounding drift is accumulated per-player round(after)-unrounded_after; path feedback is separate. B/C accelerate movement; C_P2_N5 has larger pool drift. D_S1.2 slightly reduces drift here, not a guaranteed invariant.

# 18. Synthetic edge cases

`synthetic_scenarios.csv`: 10 scenarios Ã— 8 models Ã— 4 checkpoints (matches 1,5,10,20), 320 rows. Equal; strong/weak; upset; balanced/mixed; overseed; underseed; established/provisional; repeated favorite wins; repeated underdog wins; rematches. All fixed CLUB_RATED weight .9, recency=1; final seed/count assumptions encoded in script. Repeated fixed scores are stress tests, not realistic independent draws. Caps/bounds prevent unbounded single-event jumps. No synthetic result is production evidence.

# 19. Anti-gaming analysis

Point-share farming already incentivizes larger winning margins; no added margin factor. Repeated weaker opponents are not guaranteed gains: positive delta requires share above expectation. Partner selection and provisional high-K teammates can redistribute exposure/pool drift. Seed/account manipulation is primarily an identity/eligibility concern; this task changes neither. Intentional losses can reduce Rating, and selective opposition can bias sparse observations. Strongest/weakest weighting can worsen partner gaming without identifiable individual contributions. Higher C multipliers increase early-account leverage; marginal backtest gain does not override that risk.

# 20. Candidate comparison

D_S1.2 is the descriptive leader; share MSE improves both training and inspected holdout, while pool drift is slightly lower. Higher K and provisional also improve this history, but increase movement/drift. Evidence covers one match type, six draws, no adjustments and limited experience. No robust independent claim of improved doubles fairness, established-player stability or true-skill convergence.

# 21. Recommended model

**MORE DATA REQUIRED**. Retain production A operationally. D_S1.2 is a research lead, NOT a selected deployment candidate. Do not reinterpret this recommendation as a calibration implementation approval.

# 22. Confidence/limitations

Exact frozen replay HIGH confidence; changing calibration LOW confidence. Small non-independent sample, repeated participants/partners, no skill ground truth, current seeds may not be as-of seeds, retrospective recency leakage avoided only in prefix forecast branch, win-probability semantics absent, ties and score formats matter. Stable players >20 matches absent. Manual adjustments/other weights not empirically exercised. Existing final-reconciliation documented residuals remain separate unless evidence shows a Rating impact.

# 23. Implementation implications

No implementation in this package. Any next model requires explicit version/replay policy, definition of score-share vs win-probability target, precision/rounding contract, seed-as-of evidence, chronology/recency semantics, preservation of adjustments/corrections and current authorization including ADMIN-only Initial Rating. No historical rewrite, frontend/backend deployment or migration is proposed here.

# 24. Next phase recommendation

Collect a prospective evaluation window with immutable pre-match seeds/state, authoritative ordering/approval-time and score format; keep a fixed candidate and primary share-MSE metric before seeing outcomes. Seek wider partnerships and >20-match established players, date-group evaluation and dependency-aware uncertainty; increase data rather than searching many more parameters. Re-run control validation on each new freeze. Preserve production unchanged.

Final status: **MORE DATA REQUIRED**. Production mutation **NO**. Stage/commit/push/deploy **NO**.

Verification evidence: final production read-only check 2026-10-08T04:25:18Z: projection mismatch 0; projection MD5 `14ccd4ca817758c3de810cee37436e9a`, event MD5 `9c4c8fd471f19c35721ea6c1b0d40fcc` unchanged. Authoritative-folder simulation tests PASS, including four fail-closed negative cases, deterministic output, Python AST, row counts and UUID traceability. All new text files UTF-8 without BOM or U+FFFD; new-file whitespace checked separately because untracked files are not covered by git diff --check. No application files changed.
