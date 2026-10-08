# 1. Objective

RATING-CALIBRATION01-B — DATA COLLECTION & VALIDATION PLAN. **DATA COLLECTION PLAN READY**. Planning/local validation only. No Rating formula, application, migration, capability or production data change. No stage/commit/push/deploy. Calibration A remains **MORE DATA REQUIRED**; sensitivity 1.2 is an exploratory leading research candidate, NOT a production recommendation. Calibration C is not started.

Authority: Calibration A commit `99eb2837deb1834a4b307ca75243f6a47b21f97a`; report and all analysis files reviewed, plus project state/final reconciliation, Rating source snapshots and relevant Rating/Match migrations/tests. Production exact source outranks historical migration text. `inputs-reviewed.json` inventories the read inputs. Existing research A files remain unchanged.

# 2. Why current evidence is insufficient

60 rated matches, 25 Players but only 23 participants, 240 events; no manual adjustments. Every match is CLUB_RATED/POINTS. Six draws; 25 upsets among 54 decisive matches under prequential favorite classification. No participant has 20 rated matches. Original holdout has 19 matches on 5 dates; 13/19 (68%) on 2026-10-01. The candidate was selected after inspecting eight configurations and the original holdout; it cannot be a new confirmatory dataset.

Paired score-share squared-loss advantage A minus D_S1.2: mean 0.005391, median 0.005041, sample SD 0.005712. Deterministic 4,000-resample historical IID interval [0.002974161112496679, 0.007919913442414694]; date-block interval [0.0036955663019122014, 0.007679719615436731]. Positive retrospective intervals do NOT remove selection bias, dependent Players, uncertain as-of seeds or the five-date limitation. Block CI narrower here is a small-cluster artifact, not proof that dependence helps. Historical 17.14% gain is exploratory.

# 3. Current coverage gaps

Participating Player match counts: min 2, max 19, mean 10.43, median 10. At least 5: 20 Players; at least 10: 12; at least 20: zero. Two Players have no rated match. Near-current expected-share favorite bands 50–55/55–60/60–70/70–80/80+ contain 11/16/15/9/9 matches, including draws. These are score-share bands, NOT win probability calibration buckets.

Prequential team-gap counts: [0,.25):16; [.25,.5):19; [.5,1):12; [1,2):10; [2,6.01):3. Upsets in those bins: 9/10/1/2/3. Largest-gap bin is effectively uninformative; all three being upsets is not a reliable population rate. Need broader naturally occurring schedules, new participants and mature trajectories, not synthetic production matches.

# 4. Effective sample size

Distinct/repeat counts:

| Unit | Observations | Distinct | Repeated groups | Maximum repeats | Beyond-first observations |
|---|---:|---:|---:|---:|---:|
| Teammate pair |120|71|32|8|40.8%|
| Opponent pair |240|139|62|6|42.1%|
| Same quartet |60|58|2|2|3.3%|
| Identical team matchup |60|58|2|2|3.3%|
| UTC played date |60|9|6|16|85.0%|

Kish concentration statistic (sum cluster sizes)^2/sum squared cluster sizes: dates 4.92; holdout dates 2.02; quartets 56.25; teammate pairs 48.98; opponent pairs 104.73. These are effective NUMBERS OF CLUSTERS for each different observation unit, not mutually comparable match ESS estimates. In particular 104.73 opponent-pair units does not turn 60 matches into 105 independent matches.

No reliable single ESS can be estimated from overlapping Player/pair/date dependence at this size. Illustrative date random-intercept assumption rho=.1–.2: design effect 1+rho*(sum m_date^2/n-1); full data size-biased cluster size=12.2 gives ESS about 19–28; holdout size=9.42 gives ESS about 7–10. These are sensitivity scenarios, NOT measured ICC or formal confidence. Player dependence can reduce information further; do not multiply unrelated design effects mechanically. Future planning uses balanced average date size about eight, design effect 1.7–2.4, subject to actual concentration checks.

# 5. Match-count targets

| Checkpoint | Genuinely new eligible matches | Total including locked 60 | New UTC dates | Per core gap bin | Matched-mean mixed/balanced games |
|---|---:|---:|---:|---:|---:|
| Minimum exploratory |160|220|20|16|8|
| Preferred review |240|300|30|25|12|
| Strong evidence review |400|460|50|45|20|

Derive the count from the limiting naturally occurring cell, not an arbitrary round total. Pool historical scarce gap [2,+) into [1,+) for the FOUR primary gap bins: counts16/19/12/13, minimum observed frequency12/60=.20. Retain 2+ as a separate diagnostic; no claim of high-gap fairness from three old matches. Worst-case proportion SE sqrt(.25/n) gives approximate95% half-width .25/.20/.15 at ceil(1.96²*.25/h²)=16/25/43 independent cell observations; round strong cell to45. Primary gap counts therefore suggest80/125/225 new matches at the observed minimum frequency. Expected-share bands minimum9/60=.15 and quotas12/20/30 suggest80/134/200 new games.

Crucially prequential mixed/balanced teams with |mean gap|<=.25 appear only3/60=.05. Quotas8/12/20 imply160/240/400 new games at the observed rate. Take the MAXIMUM of all coverage-derived requirements:160/240/400, total220/300/460. Dates20/30/50 keep average about8 games/date; caps and concentration still need checking. Rare-cell rate from3 observations is uncertain (approximate Wilson95% interval about1.7–13.7%, not a sampling guarantee under dependence), so these are planning estimates, not guarantees: actual checkpoints require the cell counts, and may occur later. Do not manufacture extreme production matchups to satisfy quotas.

Paired-loss cross-check: naively observed effect implies only9 independent games at approximate z=1.96+.84, exposing optimistic post-selection power planning. Use practical10% of control holdout MSE (~.003145 absolute): about26 independent games, or45–63 at design effect1.7–2.4. Coverage dominates that optimistic number. Illustrative independent-match equivalents for160/240/400 are67–94 /100–141 /167–235 IF balanced-block assumptions hold; they do not account fully for overlapping Players or guarantee subgroup power. Broad player/newcomer/doubles diversity and prospective sealing remain mandatory. Other match types cannot replace the CLUB_RATED/POINTS target.

# 6. Player coverage targets

| Target | Minimum | Preferred | Strong |
|---|---:|---:|---:|
| Distinct Players in NEW validation window |25|30|35|
| Players with >=5 cumulative rated matches |24|28|32|
| Players with >=10 cumulative rated matches |18|24|28|
| Players with >=20 cumulative rated matches |8|16|24|
| New first-ever rated cohorts, all reaching 15 |8|12|16|

Counts >=5/10/20 use the full historical ledger; evaluation experience is count BEFORE the current match. For strong review, require the 16 newcomer cohort members to reach >=25 for later-proxy evaluation; this can demand more matches. Targets allocate varied trajectories over the four participation slots per match (320/500/900 new slots) and add mature trajectories absent today. They are coverage constraints, not independently powered Player experiments. At most 10% of all new appearance slots may belong to one Player, and no Player should have >40% of appearances with one partner. Unavailable cohort follow-up must be reported; no survivor-only conclusion.

# 7. Newcomer cohort

Analysis-only provisional: 0–4 prior rated matches; transition 5–19; established >=20 prior rated matches. Production multipliers remain 1.25 before 5, 1.10 before 10 and 1 thereafter; analysis labels do NOT modify them.

Record the original self-declared seed, active min/max/default settings/hash, first-ever rated-match evidence and pre-result seed snapshot. Track first 5/10/15 match cumulative signed and absolute movement, partner/opponent experience, unique partners/opponents, max swing and shadow candidate path. A pre-existing account with first rated play can join; a Player already seen in Calibration A first-five history cannot count as a genuinely new prospective cohort.

Later proxy: median CONTROL shadow Rating after matches 20–25, requiring at least five distinct partners and eight distinct opponents and no unresolved adjustment/seed change. Compare both model paths at match 5/10/15 to the SAME proxy; candidate must not get its own favorable target. Future proxy is a retrospective outcome label only, never used to forecast earlier matches. Also report future point-share forecast error and cohort attrition. This proxy is not true skill and may favor control; cross-check with future performance, not a claim of proven convergence. Without mature follow-up, newcomer non-inferiority is UNKNOWN and strong GO is withheld.

# 8. Rating-gap coverage

Primary CONTROL pre-match bins are [0,.25), [.25,.5), [.5,1), [1,6.01), current counts16/19/12/13. Freeze bin assignment before results. Seek16/25/45 NEW matches in each bin at minimum/preferred/strong checkpoints. Tail [2,6.01) remains separately reported with diagnostic minimum4/6/10 new games; no silent assumption that pooled [1,+) validates the extreme tail. Tail insufficiency or material harm stays an explicit gap and can withhold C entry.

For every cell report count, distinct dates/Players, favorite wins/losses/draws, upset count, expected/actual share, paired score-share error and interval. Do not bucket with final retrospective or candidate Ratings. A cell with fewer than5 upsets cannot establish upset-response behavior; no forced-upset production quota. Expected-share favorite bands50–55/55–60/60–70/70–80/80+ additionally seek12/20/30 new games per band. These overlap gap cells and are NOT additive counts. Win frequencies are descriptive, not calibrated win probabilities.

# 9. Doubles/team coverage

Use each team's as-of pre-rating gap g=|r1-r2|, mean=(r1+r2)/2, and two-player population SD=g/2. Balanced means g<=.5; mixed means g>=1; intermediate .5<g<1 remains separate. Core cells: balanced/balanced; mixed/balanced; mixed/mixed. Seek 16/25/45 NEW matches in EACH core cell, overlapping gap quotas. Current retrospective composition counts are 13/13/9, with 25 intermediate cases; these historical composition diagnostics use stored replay pre-states, whereas future assignments MUST use sealed as-of pre-states. They are not exact prospective class prevalence estimates.

For strong+weak vs medium+medium fairness, additionally require |team means difference|<=.25: seek 8/12/20 matches (current prequential count3) across three or more dates and four different mixed teams. Merely a large teammate gap is not sufficient to call the opposing team medium. Track any-team gap>=1, continuous gap, maximum gap, repeated/unfamiliar partners and repeated opponents. At least 30% of new partner-pair observations should be first-time partnerships under the complete prior ledger. Subgroups overlap; do not count them as independent samples.

# 10. Repeat-pair dependence

Same opponent pair is an unordered cross-team Player pair, four observations per match. Teammate pair is an unordered within-team pair, two per match. Quartet ignores team split; identical matchup canonicalizes both sorted team pairs and side A/B. Include complete prior history when determining familiarity.

Always report ALL eligible matches and a predeclared diversity-controlled subset. Chronological played_at, business match_number, UUID order; accept at most two appearances of an identical matchup and two of the same quartet per validation window, then cap eight accepted matches per UTC date. Outcome-blind greedy selection; do not retrospectively choose whichever subset favors D. Keep excluded analytical rows and reasons. No production record is removed. Strong bucket/Player coverage must also survive this subset or collection continues. Report leave-one-Player-out METRIC exclusions and leave-one-date-out results; they are influence diagnostics, not re-trained independent experiments.

# 11. Required data fields

Existing tables cover match UUID, played_at, match_number, status/type/mode, 4 primary lineup Player/team IDs, scores, seeds/current projection, event before/after/delta/expected/actual, active settings/weights/source definitions. Derive prior count, teammate/opponent/team gaps, canonical pairs/quartets, margin, winner/draw, experience and pool drift. No auth/contact fields required.

Additional immutable LOCAL evidence is needed: prediction_recorded_at before match starts, outcome_known_at, first_seen/approval availability order, exact as-of seed/settings/ledger snapshot and digest, source hash, candidate manifest hash, verified pre-score lineup and UTC date. Engine full rebuild replaces historical pre-states as later matches arrive; today's events are NOT proof of what was known before an old match. Production may retain timestamps/audits, but their presence does not prove a prediction was sealed before the score. No new production columns are proposed.

Use only necessary Player UUIDs and analysis aliases. No profile/auth IDs, email, phone, password/token/session data. A's read-only extractor is a source reference but hardcodes 60-match replay assumptions; it is not a future stream evaluator.

# 12. Data-quality gates

Before every checkpoint: projection mismatch=0; no orphan/duplicate events; exactly 4 distinct primary participants/two per team and 4 active-version events for each eligible doubles match; deterministic timeline and availability order; finite bounded shares/Ratings; score/result consistency; active source/settings/weight hashes match frozen manifest; no unexplained seed mutation; no missing pre-result/as-of evidence. Validate whole applicable projection, not only selected matches.

Manual adjustment count becomes nonzero, active config/weights change or source drift: PAUSE primary validation until an exact source-ledger replay extension is separately reviewed. Do not silently omit adjustments or reset seeds. Baseline and new event precision follow A's exact typmod behavior. Do not apply migrations or invoke rebuild on production. Any failed integrity gate means **BLOCKED** for that rerun, not compensatory tuning.

# 13. Monitoring metrics

Predictive: primary paired squared point-share loss; MSE and relative gain; mean/median paired advantage; date/Player influence and gap/composition strata. Favorite accuracy excludes draws/equal predictions. No legitimate match-win probability model exists, so do NOT promote Brier/log loss proxies to decision metrics.

Stability: mean absolute applied delta, per-Player delta SD, max one-match and five-match swings, rounding/clamp counts, signed pool drift per Player and per appearance, all stratified by PRIOR experience. Convergence: first5/10/15 movement and common-proxy error with attrition. Fairness: composition residuals and future forecasts, partner-gap slope descriptively, familiarity and opponent concentration. Report numerator/denominator and uncertainty; no multiple-testing hunt for favorable subgroups.

# 14. Frozen Model A

Control is current V1.1 exact source `_rebuild_ratings_internal(text,uuid)` MD5 `b3b434e407c1828bbb6dbf2907148104`; own initial seeds, K=.55, sensitivity=.9, floor2/ceiling8, delta cap .35, recency half-life60/floor.35, first5 multiplier1.25/next5 multiplier1.10, then1. Full weights and precision stored in `frozen_candidates.json`. Production algorithm_version remains V1.1; research labels are not new production versions.

# 15. Frozen sensitivity 1.2 candidate

D_S1.2 differs ONLY in expected_sensitivity=1.2. Every other parameter, seed and input-availability rule equals control. Manifest records formula reference/hash, exact common parameters, source commit, baseline match IDs and UTC freeze time. No other candidate is admitted in B. No per-batch retuning; any modification requires a new frozen manifest and new unseen window. Operational A remains unchanged.

# 16. Prospective validation protocol

Exclude locked 60 match IDs and any match whose outcomes were inspected before candidate freeze. Count only genuinely new CLUB_RATED/POINTS games whose pre-start forecast was sealed after freeze and before playing/result availability. A backdated entry of an already played game is exploratory, not prospective evidence. All 60 original games can initialize source history but never count in new evidence totals.

At forecast time, replay EACH model from immutable as-of seeds using only previously available approved source ledger, latest date of that prefix, exact event precision/order. D must not use A's post-match Ratings as its state. Do not include current/future score, final-horizon recency or a later seed correction. Seal predictions and state digests before scores are known; preserve evidence in a local append-only analytical file. Freeze both forecasts for concurrently played games before either result is exposed; do not exploit arbitrary UUID order to leak same-time results. When later rebuilding, distinguish played-time replay order from approval/input-availability order.

If pre-start capture is operationally unavailable, prefix reconstruction may continue as EXPLORATORY only and cannot satisfy prospective gate. Do not fabricate dates or assume caller-provided CSV timestamps prove sealing. The operator must retain independently reviewable snapshots/hashes. This package defines the procedure, not a new production telemetry system.

# 17. Statistical uncertainty method

Compare paired errors on the SAME games. Primary final 95% percentile interval uses 4,000 date-cluster bootstrap resamples, fixed seed 20261008, pooling all matches in sampled date blocks; also show IID interval as optimistic diagnostic and leave-date/Player-out sign stability. New forecasts must be genuinely frozen before outcomes; shared opponent/Player effects remain even with date resampling. Require >=50 new dates for primary strong review; no asymptotic certainty from five dates.

Minimum/preferred checks are descriptive, cannot trigger formal GO. Only the predeclared strong checkpoint makes the primary advancement decision; this avoids repeated early significance claims. One primary model and primary metric. If a strong decision fails, choose continue/reject; any later formal confirmatory look needs a newly declared independent evaluation window/analysis rule before looking, not repeatedly sampling until a CI excludes zero. Non-inferiority subgroup thresholds are practical guardrails, not proven equivalence tests.

# 18. Checkpoints

+160 new/total220: >=20 new dates and minimum coverage; descriptive signal only. +240/total300: >=30 new dates and preferred cohorts/coverage; candidate may be strengthened, never an implementation GO. +400/total460: >=50 new dates, strong quotas and frozen forecast evidence; one primary decision review. Missing rare-cell or cohort maturity postpones review regardless of raw count. Every +25 eligible games update data-completeness/quality only, no tuning or repeated GO tests. No automation is created.

# 19. Decision thresholds

**CONTINUE COLLECTING**: quotas/as-of evidence/cohort maturity insufficient or signal unstable. **CANDIDATE STRENGTHENED**: new paired advantage positive, relative MSE gain>=10%, no demonstrated harm, but strong requirements incomplete. Neither authorizes implementation.

**READY FOR CALIBRATION-C**, only at strong checkpoint with all quality/coverage gates:

- Overall genuinely unseen MSE reduction>=10%, date-bootstrap lower bound of A-D advantage>0; later chronological half gain>=5%; outcome-blind diversity subset gain>=5%.
- Established (>=20 prior matches) mean |applied delta| and per-Player delta SD ratios D/A<=1.10; maximum five-match swing ratio<=1.25. Near-zero denominators must use absolute differences and review, not infinity/automatic PASS.
- Absolute pool drift per Player <=.05, and extra absolute drift compared with A <=.02; report participation-normalized drift and clamp effects.
- Common later-proxy newcomer MAE ratio<=1.10 at 5/10/15; no persistent worse later point-share prediction. Missing mature follow-up => UNKNOWN, cannot pass.
- Each core composition's candidate MSE harm <= BOTH 10% relative and .005 absolute; influence/subset analysis must not reveal a concentrated harmed group. Sparse cohorts mean UNKNOWN.
- No substantiated new gaming incentive/exploit, severe seed/identity issue or unexplained source drift. Human review required; aggregate gain cannot override harm.

These are prespecified practical tolerances balancing 10% useful gain against up to 10% motion/stratum harm and small scale-2–8 drift. They are NOT fitted to make D pass and not externally validated safety limits. **REJECT CANDIDATE** at a sufficiently covered strong review if advantage disappears (gain<=0), uncertainty upper bound<=0, or reproducible material harm/gaming worsens. Positive but sub-threshold/uncertain results continue, not automatic rejection. Confirmed safety issue can pause/reject earlier with documented evidence; no production formula has been changed.

# 20. Anti-gaming monitoring

Flag, do not accuse: one Player's >50% exposure to opponents whose control team mean is >=1 weaker; one partner >40% of appearances; recurring extreme margins beyond expected residual distribution; abrupt intentional-loss-like reversals. Compare opponent/partner distributions, competition context and score-entry correction history. These thresholds trigger review, not bans or proof. Margin farming is already a possible POINTS incentive; D adds no margin multiplier, but may change rewards and needs synthetic/local comparison later. Provisional account/seed behavior is monitored without creating accounts or changing IAM.

# 21. Tooling

`analysis/rating-calibration01-b/`: README; this report companion/data plan; frozen candidates; checkpoint config; coverage_statistics.py; planning_statistics.json; validation_metrics.py; ten-unit-test suite; input inventory. `coverage_statistics.py` reuses A's sealed dataset/prequential outputs, never imports its top-level fixed-60 engine or reruns a tuning grid. `validation_metrics.py` consumes already sealed forecasts plus a separately verified quality summary; it does NOT generate forecasts, enforce backend authority or automatically issue a GO. Quality JSON is research evidence, not a trusted security control.

No production extractor added: existing tables suffice for retrospective fields, but cannot reconstruct missing immutable pre-result evidence. An authorized future local shadow forecaster may reuse an extracted/pure exact engine AFTER its replay/precision/adjustment/as-of contract is reviewed; B does not implement that engine or claim a prospective stream is running. Metrics CLI deliberately rejects old IDs, source/manifest drift, nonfinite values, invalid score shares and unsealed/late forecasts.

# 22. Operational procedure

1. Retain A source freeze and B candidate manifest; record read-only catalog/settings parity before collecting.
2. Before game starts, authorized operator seals lineup, as-of seed/input snapshot, independent A/D forecasts and manifest digest locally. No raw account credentials are collected.
3. After result/normal app approval, read existing tables; preserve outcome availability time and source ledger digest. Never invoke mutation RPC for research.
4. Validate catalog/projection/cardinality/continuity and match integrity. Mark missing evidence exploratory; do not backfill it as prospective.
5. Run paired metrics and coverage summaries at count checkpoints. Maintain all-match and outcome-blind diversity subset outputs and exclusions.
6. Freeze checkpoint artifacts and human decision; keep production A. Only strong prespecified evidence can recommend separate C engineering/audit.

New raw data collection/sessions are NOT started in B. No automation, account creation or production telemetry column is introduced.

# 23. Entry criteria for Calibration C

Strong +400 genuinely new primary matches (460 total), >=50 new dates, all four primary gap bins>=45 on diversity subset, required expected bands, Player/newcomer maturity/core doubles/matched-mean coverage, all integrity/as-of gates, durable >=10% gain and uncertainty/safety tests above. Research source/manifest parity exact, no retuning or original-holdout reuse. Missing direct fairness/convergence evidence prevents an unqualified GO. Entry merely permits separately authorized Calibration C design/engineering review; it does NOT approve a production formula or historical replay.

# 24. Recommendation

**DATA COLLECTION PLAN READY**. Minimum +160; preferred +240; strong +400 new primary matches, contingent on diversity and maturity. Target new-window Player diversity>=25/30/35; newcomers8/12/16, with >=25-game follow-up for strong proxy assessment. First prospective checkpoint +160 with20 new dates,16/core gap bin and8 matched-mean mixed/balanced games. Keep current production formula. No stage/commit/push/deploy; production mutation **NO**. Do not begin Calibration C.
