"""Prepared opt-in B1 P3 reconciliation. No sealed forecasts synthesized."""
import json
from pathlib import Path
import subprocess
import tempfile
from reconcile_adjustments import analyze, locked_inputs, stamp

ROOT = Path(__file__).resolve().parent


def extract(cli):
    if not cli:
        raise ValueError('SUPABASE_CLI_REQUIRED')
    outputs = ROOT/'outputs'; outputs.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='read-only-', dir=outputs) as folder:
        query = Path(folder)/'extract.sql'
        query.write_bytes((ROOT/'extract-readonly.sql').read_bytes())
        proc = subprocess.run([cli, 'db', 'query', '--linked', '--project-ref',
                               'bflwaqlvnesuqoyikxar', '--output', 'json', '--file', str(query)],
                              capture_output=True, text=True, encoding='utf8', timeout=120)
        if proc.returncode:
            raise ValueError('READ_ONLY_EXTRACTION_FAILED:'+str(proc.returncode))
        obj = json.loads(proc.stdout)['rows'][0]['dataset']
        return json.loads(obj) if isinstance(obj, str) else obj


def run(cli, cfg, frozen, data=None, offline=False):
    from checkpoint_core import aggregate, blank, evaluate
    locked, baseline = locked_inputs(ROOT.parent/'rating-calibration01-b/frozen_candidates.json',
                                     ROOT.parent/'rating-calibration01-a/dataset.json')
    if frozen != locked:
        raise ValueError('MANIFEST_DISAGREEMENT')
    if data is None:
        data = extract(cli)
    interventions = analyze(data, frozen, baseline)
    if interventions['status'] == 'BLOCKED':
        return dict(status='BLOCKED — DATA QUALITY', quality_errors=interventions['errors'],
                    calibration_c_eligible=None, manual_adjustments=interventions, offline_fixture=offline)
    # Strictly observation-only: current rebuilt states never substitute for sealed A/D forecasts.
    active = next(s for s in data['settings'] if s['is_active'])['algorithm_version']
    events = [e for e in data['events'] if e['algorithm_version'] == active]
    matches = data['matches']; context = []
    for player in data['players']:
        personal_ids = {l['match_id'] for l in data['lineups'] if l['player_id'] == player['id']}
        dates = [m['played_at'] for m in matches if m['id'] in personal_ids]
        context.append(dict(player, cumulative_matches=len(personal_ids),
                            first_rated_at=min(dates, key=stamp) if dates else None))
    adapted = dict(players=context, lineups=data['lineups'], events=events)
    baseline_ids = set(frozen['baseline_match_ids']); cutoff = stamp(frozen['frozen_at'])
    observed_matches = [m for m in matches if stamp(m['played_at']) > cutoff and m['id'] not in baseline_ids]
    primary = [m for m in observed_matches if m['match_type'] == 'CLUB_RATED' and m['score_mode'] == 'POINTS']
    observed = aggregate(adapted, primary, cfg, frozen)
    clean_ids = {m['match_id'] for m in interventions['matches'] if m['category'] == 'CLEAN'}
    clean = aggregate(adapted, [m for m in primary if m['id'] in clean_ids], cfg, frozen)
    verified = blank(cfg)
    result = evaluate(verified, observed, cfg, False, False)
    return dict(result, quality_errors=[], cutoff=frozen['frozen_at'], captured_at=data['captured_at'],
                observed=observed, verified=verified, observed_clean=clean,
                observed_rated_after_cutoff=len(observed_matches), total_rated_matches=len(matches),
                manual_adjustments=interventions, offline_fixture=offline,
                metrics='UNAVAILABLE — no sealed intervention-aware A/D forecast evidence; retrospective replay is reconciliation only',
                warnings=interventions['warnings']+['Intervention-aware sealed evidence ingestion is not implemented in this preparation; C eligibility remains NO without it.'],
                retrospective_coverage_is_not_prospective=True)
