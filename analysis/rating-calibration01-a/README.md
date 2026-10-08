# Rating calibration analytical freeze

Analysis only; no production mutations or application changes.

Run `python simulate.py`, `python supplemental.py`, `python report.py`, then `python test_simulation.py`. Standard Python 3 with Decimal; no third-party dependency or database write is required. Run from this folder or use an absolute script path.

`extract.py` is OPTIONAL authorized read-only production extraction through the installed Supabase CLI. It overwrites this analytical freeze and should not be rerun as part of deterministic tests. It requires an authenticated project session. `extract-readonly.sql` uses BEGIN TRANSACTION READ ONLY / ROLLBACK and contains no mutation RPC.

`dataset.json` is the captured minimal business dataset, containing Player/match UUIDs and ratings, without auth/contact details. Treat raw UUID-bearing artifacts as internal. Report aliases are P01–P25. SQL files prefixed `_` and other function-named SQL files are readable production definition references, NOT migrations; never apply them.

Eight configurations reproduce full retrospective history and separately compute prefix-only forecasts. Stored event UUID/time are not regenerated for comparison. Six draws are kept. A point-share expectation is not a calibrated win probability; Brier/log loss are proxies. Two unplayed Players remain in distribution. The fixed holdout is 41 earlier / 19 later matches, separated by date; it has now been inspected, so future confirmation needs fresh data.

Exact control replay and deterministic artifacts PASS. Negative tests reject event drift, seed drift, engine hash drift and unsupported nonzero adjustments. No new calibration formula is recommended for deployment.
