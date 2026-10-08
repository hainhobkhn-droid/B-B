"""Local retrospective reconciliation only. Never forecasts, tunes, or writes to DB."""
import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone, date
from decimal import Decimal, ROUND_HALF_UP
import hashlib
import json
from pathlib import Path
import statistics

ROOT = Path(__file__).resolve().parent


def stamp(value):
    result = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if result.tzinfo is None:
        raise ValueError('TIMEZONE_REQUIRED')
    return result.astimezone(timezone.utc)


def dec(value):
    result = Decimal(str(value))
    if not result.is_finite():
        raise ValueError('NONFINITE')
    return result


def quant(value, scale=3):
    return value.quantize(Decimal(10) ** -scale, rounding=ROUND_HALF_UP)


def timeline_key(kind, row):
    if kind == 'MATCH':
        return (stamp(row['played_at']), 1, row.get('match_number') is None,
                row.get('match_number') or 0, 0, row['id'])
    return (stamp(row['effective_at']), 2, True, 0, row['replay_order'], row['id'])


def replay(data, frozen, model='A'):
    """Faithful full snapshot rebuild, NOT historical pre-result availability."""
    cfg = frozen['common_parameters']
    ratings = {p['id']: dec(p['initial_rating']) for p in data['players']}
    initial = sum(ratings.values()); counts = Counter(); engine_drift = Decimal(0)
    admin_raw = Decimal(0); admin_projection = Decimal(0)
    ls = defaultdict(list)
    for row in data['lineups']:
        ls[row['match_id']].append(row)
    timeline = [('MATCH', m) for m in data['matches']]
    timeline += [('ADJUSTMENT', a) for a in data['adjustments']]
    timeline.sort(key=lambda x: timeline_key(*x))
    latest = max((date.fromisoformat(m['played_date']) for m in data['matches']), default=None)
    events = []; adjustments = []; interventions = []
    lower, upper = dec(cfg['min_rating']), dec(cfg['max_rating'])
    for kind, row in timeline:
        if kind == 'ADJUSTMENT':
            p = row['player_id']; before = ratings[p]; amount = dec(row['amount'])
            after = max(lower, min(upper, before + amount))
            adjustments.append(dict(adjustment_id=row['id'], player_id=p,
                                    rating_before=before, requested_amount=amount,
                                    applied_delta=after-before, rating_after=after))
            # Derived adjustment numeric is unconstrained; players projection is numeric(6,3).
            ratings[p] = quant(after, cfg['rating_scale'])
            admin_raw += after-before; admin_projection += ratings[p]-before
            interventions.append((row['id'], p, row['effective_at'], row['replay_order'], str(amount)))
            continue
        teams = {t: sorted(l['player_id'] for l in ls[row['id']] if l['team'] == t) for t in 'AB'}
        means = {t: sum(ratings[p] for p in teams[t])/2 for t in 'AB'}
        expected = 1 / (1 + ((means['B']-means['A']) /
                   dec(frozen['candidates'][model]['expected_sensitivity'])).exp())
        sa, sb = dec(row['team_a_score']), dec(row['team_b_score'])
        actual = sa/(sa+sb) if row['score_mode'] == 'POINTS' else Decimal(1 if sa > sb else 0 if sa < sb else '.5')
        age = (latest-date.fromisoformat(row['played_date'])).days
        recency = max(dec(cfg['recency_floor']), dec('.5') ** (Decimal(age)/dec(cfg['recency_half_life_days'])))
        updates = {}
        for team in 'AB':
            for p in teams[team]:
                exp = expected if team == 'A' else 1-expected
                act = actual if team == 'A' else 1-actual
                mult = dec(cfg['provisional_factor'] if counts[p] < cfg['provisional_matches'] else
                           cfg['transition_factor'] if counts[p] < cfg['stable_matches'] else cfg['established_factor'])
                weight = dec(cfg['match_weights'][row['match_type']]); gap = act-exp
                delta = gap*dec(cfg['k_factor'])*weight*recency*mult
                delta = max(-dec(cfg['rating_delta_cap']), min(dec(cfg['rating_delta_cap']), delta))
                after = quant(max(lower, min(upper, ratings[p]+delta)), cfg['rating_scale'])
                fields = dict(rating_before=ratings[p], team_rating=quant(means[team]),
                              opponent_team_rating=quant(means['B' if team == 'A' else 'A']),
                              expected_share=quant(exp, 5), actual_share=quant(act, 5),
                              performance_gap=quant(gap, 5), match_weight=quant(weight),
                              recency_weight=quant(recency), provisional_factor=quant(mult),
                              rating_delta=quant(delta, 5), rating_after=after)
                events.append(dict(match_id=row['id'], player_id=p, **fields))
                updates[p] = after; counts[p] += 1; engine_drift += after-ratings[p]
        ratings.update(updates)
    return dict(ratings=ratings, events=events, adjustment_events=adjustments,
                interventions=interventions, engine_drift=engine_drift,
                adjustment_raw_drift=admin_raw, adjustment_projection_drift=admin_projection,
                adjustment_rounding_drift=admin_projection-admin_raw,
                combined_drift=sum(ratings.values())-initial)


def validate_inputs(data, frozen, baseline):
    errors = []
    if data['function_hashes']['_rebuild_ratings_internal'] != frozen['production_definition_md5']:
        errors.append('ENGINE_SOURCE_DRIFT')
    active = [s for s in data['settings'] if s['is_active']]
    if len(active) != 1:
        return errors+['ACTIVE_SETTINGS_INVALID']
    cfg = frozen['common_parameters']; settings = active[0]
    for k in ['initial_rating', 'min_rating', 'max_rating', 'k_factor', 'provisional_matches',
              'stable_matches', 'recency_half_life_days', 'recency_floor', 'rating_delta_cap']:
        if dec(settings[k]) != dec(cfg[k]):
            errors.append('SETTINGS_DRIFT:'+k)
    if dec(settings['expected_sensitivity']) != dec(frozen['candidates']['A']['expected_sensitivity']):
        errors.append('CONTROL_DRIFT')
    if {w['match_type']: w['weight'] for w in data['weights']} != cfg['match_weights']:
        errors.append('WEIGHT_DRIFT')
    players = {p['id']: p for p in data['players']}
    if len(players) != len(data['players']):
        errors.append('DUPLICATE_PLAYER')
    for p in players.values():
        for key in ['initial_rating', 'current_rating']:
            if not dec(cfg['min_rating']) <= dec(p[key]) <= dec(cfg['max_rating']):
                errors.append('PLAYER_RANGE')
    for p in baseline['players']:
        if p['id'] not in players or dec(players[p['id']]['initial_rating']) != dec(p['initial_rating']):
            errors.append('FROZEN_SEED_DRIFT')
    current_matches = {m['id']: m for m in data['matches']}
    if len(current_matches) != len(data['matches']):
        errors.append('DUPLICATE_MATCH')
    for m in baseline['matches']:
        if current_matches.get(m['id']) != m:
            errors.append('BASELINE_MATCH_DRIFT')
    version = settings['algorithm_version']; cutoff = stamp(frozen['frozen_at'])
    seen = set(); orders = set(); adjustments = {a['id']: a for a in data['adjustments']}
    for a in data['adjustments']:
        if a['id'] in seen or a['replay_order'] in orders:
            errors.append('DUPLICATE_ADJUSTMENT_OR_ORDER')
        seen.add(a['id']); orders.add(a['replay_order'])
        if stamp(a['effective_at']) <= cutoff or stamp(a['created_at']) <= cutoff:
            errors.append('PRE_CUTOFF_ADJUSTMENT_BASELINE_INCONSISTENCY')
        if stamp(a['created_at']) > stamp(data['captured_at']) or stamp(a['effective_at']) > stamp(data['captured_at']):
            errors.append('FUTURE_ADJUSTMENT')
        if a['player_id'] not in players or type(a['replay_order']) is not int or a['replay_order'] <= 0 or dec(a['amount']) == 0:
            errors.append('MALFORMED_ADJUSTMENT')
        # Correction RPC does not fill request_algorithm_version; null is supported there.
        if a.get('request_algorithm_version') not in [None, version]:
            errors.append('UNSUPPORTED_ADJUSTMENT_VERSION')
        original_id = a.get('correction_of_adjustment_id')
        if original_id:
            original = adjustments.get(original_id)
            if not original or original['player_id'] != a['player_id'] or original['effective_at'] != a['effective_at'] or dec(original['amount']) != -dec(a['amount']) or original['replay_order'] >= a['replay_order']:
                errors.append('MALFORMED_CORRECTION')
    lineups = defaultdict(list)
    for l in data['lineups']:
        lineups[l['match_id']].append(l)
        if l['player_id'] not in players or l['match_id'] not in current_matches:
            errors.append('ORPHAN_LINEUP')
    for m in data['matches']:
        stamp(m['played_at'])
        if stamp(m['played_at']) > stamp(data['captured_at']):
            errors.append('FUTURE_MATCH')
        if len(lineups[m['id']]) != 4 or Counter(l['team'] for l in lineups[m['id']]) != {'A': 2, 'B': 2} or len({l['player_id'] for l in lineups[m['id']]}) != 4:
            errors.append('LINEUP_CARDINALITY')
        sa, sb = m['team_a_score'], m['team_b_score']
        if type(sa) is not int or type(sb) is not int or min(sa, sb) < 0 or m['score_mode'] not in ['POINTS', 'RESULT'] or (m['score_mode'] == 'POINTS' and sa+sb == 0):
            errors.append('MATCH_RESULT_INVALID')
    # Baseline lineup changes can alter all historical states even with unchanged matches.
    ids = set(frozen['baseline_match_ids'])
    canonical = lambda rows: sorted((l['match_id'], l['team'], l['player_id']) for l in rows if l['match_id'] in ids)
    if canonical(data['lineups']) != canonical(baseline['lineups']):
        errors.append('BASELINE_LINEUP_DRIFT')
    return sorted(set(errors))


def compare(rebuilt, data):
    errors = []; checked = 0
    for collection, key in [('events', 'match_id'), ('adjustment_events', 'adjustment_id')]:
        active = next(s for s in data['settings'] if s['is_active'])['algorithm_version']
        rows = [e for e in data[collection] if e['algorithm_version'] == active]
        source = {(e[key], e['player_id']): e for e in rows}
        if len(source) != len(rows):
            errors.append('DUPLICATE_'+collection)
        expected = {(e[key], e['player_id']) for e in rebuilt[collection]}
        if set(source) != expected:
            errors.append('ORPHAN_OR_CARDINALITY_'+collection)
        for e in rebuilt[collection]:
            orig = source.get((e[key], e['player_id']), {})
            for field, value in e.items():
                if field in [key, 'player_id']:
                    continue
                checked += 1
                if field not in orig or dec(orig[field]) != value:
                    errors.append('REPLAY_MISMATCH:'+collection+':'+e[key]+':'+field)
    for p in data['players']:
        checked += 1
        if rebuilt['ratings'][p['id']] != dec(p['current_rating']):
            errors.append('PROJECTION_MISMATCH:'+p['id'])
    return sorted(set(errors)), checked


def analyze(data, frozen, baseline):
    try:
        data = dict(data, adjustments=sorted(data['adjustments'], key=lambda x: timeline_key('ADJUSTMENT', x)))
        errors = validate_inputs(data, frozen, baseline)
        if errors:
            return dict(status='BLOCKED', errors=errors, protocol='BLOCKED')
        a = replay(data, frozen, 'A'); errors, checked = compare(a, data)
        if errors:
            return dict(status='BLOCKED', errors=errors, protocol='BLOCKED', fields_compared=checked)
        d = replay(data, frozen, 'D_S1.2')
        if a['interventions'] != d['interventions']:
            raise ValueError('UNEQUAL_EXTERNAL_INTERVENTIONS')
        cutoff = stamp(frozen['frozen_at']); baseline_ids = set(frozen['baseline_match_ids'])
        prospective = [m for m in data['matches'] if stamp(m['played_at']) > cutoff and m['id'] not in baseline_ids]
        adjustment_rows = []; placement = Counter(); matches = []; newcomers = set()
        lineups = defaultdict(set); first = {}; counts = Counter()
        for l in data['lineups']:
            lineups[l['match_id']].add(l['player_id'])
        for m in sorted(data['matches'], key=lambda m: timeline_key('MATCH', m)):
            for p in lineups[m['id']]:
                first.setdefault(p, m['played_at']); counts[p] += 1
        for x in data['adjustments']:
            p = x['player_id']; personal = [m for m in prospective if p in lineups[m['id']]]
            before = [m for m in personal if timeline_key('MATCH', m) < timeline_key('ADJUSTMENT', x)]
            after = [m for m in personal if timeline_key('MATCH', m) > timeline_key('ADJUSTMENT', x)]
            where = 'NO_PROSPECTIVE_MATCH' if not personal else 'BEFORE_FIRST' if not before else 'BETWEEN' if after else 'AFTER_LATEST'
            placement[where] += 1
            personal_all = [m for m in data['matches'] if p in lineups[m['id']] and timeline_key('MATCH', m) < timeline_key('ADJUSTMENT', x)]
            new_cohort = p in first and stamp(first[p]) > cutoff
            if new_cohort and len(personal_all) < 15:
                newcomers.add(p)
            derived = next(e for e in a['adjustment_events'] if e['adjustment_id'] == x['id'])
            adjustment_rows.append(dict(x, **{k: str(v) for k, v in derived.items() if k not in ['adjustment_id', 'player_id']},
                                        placement=where, prior_rated_matches=len(personal_all),
                                        newcomer_intervention_milestones=[n for n in [5, 10, 15] if new_cohort and len(personal_all) < n],
                                        safe_type='APPEND_ONLY_REVERSAL' if x.get('correction_of_adjustment_id') else 'MANUAL_ADDITIVE_ADJUSTMENT',
                                        purpose='NOT_INFERRED_FROM_FREE_TEXT',
                                        recorded_after_effective=stamp(x['created_at']) > stamp(x['effective_at'])))
        for m in sorted(prospective, key=lambda m: timeline_key('MATCH', m)):
            relevant = [x for x in data['adjustments'] if x['player_id'] in lineups[m['id']] and timeline_key('ADJUSTMENT', x) < timeline_key('MATCH', m)]
            # Created-at availability is distinct from effective historical placement.
            late = [x for x in relevant if stamp(x['created_at']) >= stamp(m['played_at'])]
            same_day = [x for x in data['adjustments'] if x['player_id'] in lineups[m['id']] and stamp(x['effective_at']).date() == stamp(m['played_at']).date()]
            pre = {e['player_id']: e['rating_before'] for e in data['events'] if e['match_id'] == m['id'] and e['algorithm_version'] == next(s for s in data['settings'] if s['is_active'])['algorithm_version']}
            matches.append(dict(match_id=m['id'], played_at=m['played_at'], category='ADJUSTED-STATE' if relevant else 'CLEAN',
                                adjusted_participants=len({x['player_id'] for x in relevant}),
                                latest_adjustment=max((x['effective_at'] for x in relevant), default=None),
                                same_day_order_sensitive=bool(same_day), late_recorded_adjustments=len(late),
                                retrospective_rebuilt_pre_ratings=pre,
                                actual_historical_pre_result_state='UNKNOWN_WITHOUT_SEALED_AS_OF_EVIDENCE'))
        requested = [abs(dec(x['amount'])) for x in data['adjustments']]
        applied = [abs(e['applied_delta']) for e in a['adjustment_events']]
        per_player = Counter(x['player_id'] for x in data['adjustments'])
        drift = lambda r: {k: str(r[k]) for k in ['engine_drift', 'adjustment_raw_drift', 'adjustment_projection_drift', 'adjustment_rounding_drift', 'combined_drift']}
        return dict(status='ADJUSTMENT PROTOCOL READY', protocol='P3', captured_at=data['captured_at'], errors=[],
                    cutoff=frozen['frozen_at'], total_adjustments=len(data['adjustments']), pre_cutoff_adjustments=0,
                    post_cutoff_adjustments=len(data['adjustments']), unique_adjusted_players=len(per_player),
                    adjustments_per_player=dict(sorted(per_player.items())), players_adjusted_more_than_once=sum(n > 1 for n in per_player.values()),
                    magnitude=dict(requested_total_absolute=str(sum(requested)), applied_total_absolute=str(sum(applied)),
                                   requested_min=str(min(requested, default=0)), requested_max=str(max(requested, default=0)),
                                   requested_median=str(statistics.median(requested)) if requested else None,
                                   applied_min=str(min(applied, default=0)), applied_max=str(max(applied, default=0)),
                                   applied_median=str(statistics.median(applied)) if applied else None),
                    placement=dict(placement), prospective_matches_total=len(matches),
                    clean_matches=sum(m['category'] == 'CLEAN' for m in matches),
                    adjustment_affected_matches=sum(m['category'] == 'ADJUSTED-STATE' for m in matches),
                    order_sensitive_matches=sum(m['same_day_order_sensitive'] for m in matches),
                    manually_intervened_newcomers=len(newcomers), fields_compared=checked,
                    control_replay_mismatches=0, identical_requested_interventions=True,
                    pool=dict(A=drift(a), D=drift(d)), adjustments=adjustment_rows, matches=matches,
                    warnings=['ACCOUNTED EXOGENOUS EVENTS' if data['adjustments'] else 'NO MANUAL INTERVENTIONS',
                              'Retrospective control reconciliation is not a sealed prospective forecast.',
                              'Identical requested amounts/order; realized applied delta can differ due to model-specific clamp.',
                              'Clean-participant subset can retain indirect exposure through earlier opponents; not a causal no-intervention experiment.'],
                    calibration_c_eligible=False)
    except (ValueError, KeyError, TypeError, ArithmeticError) as exc:
        return dict(status='BLOCKED', protocol='BLOCKED', errors=[type(exc).__name__+':'+str(exc)])


def locked_inputs(frozen_path, baseline_path):
    lock_path = frozen_path.parent/'checkpoint_protocol_lock.json'
    lock = json.loads(lock_path.read_text(encoding='utf8'))
    for name, expected in lock['files'].items():
        if hashlib.sha256((frozen_path.parent/name).read_bytes()).hexdigest() != expected:
            raise ValueError('FROZEN_PROTOCOL_DRIFT:'+name)
    frozen = json.loads(frozen_path.read_text(encoding='utf8')); raw = baseline_path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != frozen['baseline_dataset_sha256']:
        raise ValueError('FROZEN_BASELINE_HASH_DRIFT')
    return frozen, json.loads(raw)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--frozen', type=Path, default=ROOT.parent/'rating-calibration01-b/frozen_candidates.json')
    parser.add_argument('--baseline', type=Path, default=ROOT.parent/'rating-calibration01-a/dataset.json')
    parser.add_argument('--output', type=Path, default=ROOT/'outputs/latest-reconciliation.json')
    args = parser.parse_args()
    frozen, baseline = locked_inputs(args.frozen, args.baseline)
    result = analyze(json.loads(args.input.read_text(encoding='utf8')), frozen, baseline)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    if args.output.exists() and not args.output.resolve().is_relative_to((ROOT/'outputs').resolve()):
        raise ValueError('REFUSE_NON_OUTPUT_OVERWRITE')
    args.output.write_text(json.dumps(result, indent=2, ensure_ascii=False, allow_nan=False)+'\n', encoding='utf8')
    print(json.dumps({k: v for k, v in result.items() if k not in ['adjustments', 'matches', 'adjustments_per_player']}, indent=2, ensure_ascii=False))
    return 2 if result['status'] == 'BLOCKED' else 0


if __name__ == '__main__':
    raise SystemExit(main())
