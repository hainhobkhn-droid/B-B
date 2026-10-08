"""Ten required intervention scenarios plus safety/ordering/rounding regressions."""
import copy
import json
from pathlib import Path
import unittest
import tempfile
from reconcile_adjustments import analyze, replay, timeline_key, dec, quant, locked_inputs

ROOT = Path(__file__).resolve().parent


class Adjustments(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cases = {p.stem: json.loads(p.read_text(encoding='utf8')) for p in (ROOT/'fixtures').glob('*.json')}

    def evaluate(self, name):
        c = self.cases[name]
        return analyze(c['data'], c['frozen'], c['baseline'])

    def test_01_no_adjustments(self):
        self.assertEqual(self.evaluate('01-no-adjustments')['total_adjustments'], 0)

    def test_02_before_first(self):
        r = self.evaluate('02-before-first')
        self.assertEqual(r['placement']['BEFORE_FIRST'], 1)
        self.assertEqual(r['adjustment_affected_matches'], 2)

    def test_03_between_matches(self):
        r = self.evaluate('03-between')
        self.assertEqual(r['placement']['BETWEEN'], 1)
        self.assertEqual((r['clean_matches'], r['adjustment_affected_matches']), (1, 1))

    def test_04_multiple_same_player(self):
        r = self.evaluate('04-multiple-same-player')
        self.assertEqual((r['total_adjustments'], r['unique_adjusted_players'], r['players_adjusted_more_than_once']), (2, 1, 1))

    def test_05_multiple_players(self):
        r = self.evaluate('05-multiple-players')
        self.assertEqual(r['matches'][1]['adjusted_participants'], 2)

    def test_06_newcomer(self):
        self.assertEqual(self.evaluate('06-newcomer')['manually_intervened_newcomers'], 1)

    def test_07_timestamp(self):
        c = self.cases['07-same-timestamp']; r = self.evaluate('07-same-timestamp')
        self.assertEqual((r['clean_matches'], r['adjustment_affected_matches']), (1, 1))
        self.assertTrue(r['matches'][0]['same_day_order_sensitive'])
        self.assertLess(timeline_key('MATCH', c['data']['matches'][0]), timeline_key('ADJUSTMENT', c['data']['adjustments'][0]))

    def test_08_pre_cutoff(self):
        self.assertIn('PRE_CUTOFF_ADJUSTMENT_BASELINE_INCONSISTENCY', self.evaluate('08-pre-cutoff')['errors'])

    def test_09_nonfinite(self):
        self.assertEqual(self.evaluate('09-nonfinite')['status'], 'BLOCKED')

    def test_10_identical_interventions(self):
        c = self.cases['10-identical-interventions']
        a, d = [replay(c['data'], c['frozen'], m) for m in ['A', 'D_S1.2']]
        self.assertEqual(a['interventions'], d['interventions'])
        self.assertTrue(self.evaluate('10-identical-interventions')['identical_requested_interventions'])

    def test_control_drift(self):
        c = copy.deepcopy(self.cases['03-between']); c['data']['players'][0]['current_rating'] += .001
        self.assertEqual(analyze(c['data'], c['frozen'], c['baseline'])['status'], 'BLOCKED')

    def test_event_drift(self):
        c = copy.deepcopy(self.cases['03-between']); c['data']['adjustment_events'][0]['applied_delta'] += .001
        self.assertEqual(analyze(c['data'], c['frozen'], c['baseline'])['status'], 'BLOCKED')

    def test_missing_order(self):
        c = copy.deepcopy(self.cases['03-between']); c['data']['adjustments'][0]['replay_order'] = None
        self.assertEqual(analyze(c['data'], c['frozen'], c['baseline'])['status'], 'BLOCKED')

    def test_duplicate_event(self):
        c = copy.deepcopy(self.cases['03-between']); c['data']['adjustment_events'] *= 2
        self.assertEqual(analyze(c['data'], c['frozen'], c['baseline'])['status'], 'BLOCKED')

    def test_determinism_order(self):
        c = copy.deepcopy(self.cases['04-multiple-same-player']); expected = analyze(c['data'], c['frozen'], c['baseline'])
        c['data']['matches'].reverse(); c['data']['events'].reverse(); c['data']['lineups'].reverse()
        # DB extraction sorts source adjustments; retain report inventory order contract.
        self.assertEqual(expected, analyze(c['data'], c['frozen'], c['baseline']))

    def test_half_up_and_clamp(self):
        self.assertEqual(str(quant(dec('2.0005'))), '2.001')
        c = copy.deepcopy(self.cases['10-identical-interventions']); c['data']['adjustments'][0]['amount'] = 100
        a = replay(c['data'], c['frozen'])
        self.assertEqual(a['adjustment_events'][0]['rating_after'], dec(8))
        self.assertEqual(a['combined_drift'], a['engine_drift']+a['adjustment_projection_drift'])

    def test_source_hash_no_retuning(self):
        c = copy.deepcopy(self.cases['03-between']); c['data']['function_hashes']['_rebuild_ratings_internal'] = 'drift'
        self.assertIn('ENGINE_SOURCE_DRIFT', analyze(c['data'], c['frozen'], c['baseline'])['errors'])
        c = copy.deepcopy(self.cases['03-between']); c['data']['settings'][0]['expected_sensitivity'] = 1.2
        self.assertIn('CONTROL_DRIFT', analyze(c['data'], c['frozen'], c['baseline'])['errors'])

    def test_no_false_eligibility(self):
        self.assertFalse(self.evaluate('03-between')['calibration_c_eligible'])

    def test_future_adjustment(self):
        c = copy.deepcopy(self.cases['03-between']); c['data']['adjustments'][0]['created_at'] = '2027-01-01T00:00:00Z'
        self.assertIn('FUTURE_ADJUSTMENT', analyze(c['data'], c['frozen'], c['baseline'])['errors'])

    def test_adjustment_inventory_order(self):
        c = copy.deepcopy(self.cases['04-multiple-same-player']); expected = analyze(c['data'], c['frozen'], c['baseline'])
        c['data']['adjustments'].reverse()
        self.assertEqual(expected, analyze(c['data'], c['frozen'], c['baseline']))

    def test_fractional_adjustment_projection_rounding(self):
        c = copy.deepcopy(self.cases['03-between']); c['data']['adjustments'][0]['amount'] = '.00051'
        r = replay(c['data'], c['frozen'])
        e = r['adjustment_events'][0]
        self.assertEqual(e['applied_delta'], dec('.00051'))
        self.assertEqual(r['adjustment_rounding_drift'], dec('.00049'))

    def test_correction_is_append_only_inverse(self):
        c = copy.deepcopy(self.cases['03-between']); a = c['data']['adjustments'][0]
        reversal = dict(a, id='reversal', replay_order=2, amount=-a['amount'], correction_of_adjustment_id=a['id'], request_algorithm_version=None)
        c['data']['adjustments'].append(reversal)
        from reconcile_adjustments import validate_inputs
        self.assertEqual(validate_inputs(c['data'], c['frozen'], c['baseline']), [])
        r = replay(c['data'], c['frozen'])
        self.assertEqual(r['adjustment_projection_drift'], dec(0))
        reversal['amount'] = .7
        self.assertIn('MALFORMED_CORRECTION', validate_inputs(c['data'], c['frozen'], c['baseline']))

    def test_late_recording_not_as_of_evidence(self):
        c = copy.deepcopy(self.cases['03-between']); c['data']['adjustments'][0]['created_at'] = '2026-10-10T09:00:00Z'
        r = analyze(c['data'], c['frozen'], c['baseline'])
        self.assertEqual(r['matches'][1]['late_recorded_adjustments'], 1)
        self.assertEqual(r['matches'][1]['actual_historical_pre_result_state'], 'UNKNOWN_WITHOUT_SEALED_AS_OF_EVIDENCE')

    def test_newcomer_milestones(self):
        r = self.evaluate('06-newcomer')
        self.assertEqual(r['adjustments'][0]['newcomer_intervention_milestones'], [5, 10, 15])

    def test_frozen_file_tamper(self):
        import hashlib
        with tempfile.TemporaryDirectory(dir=ROOT) as folder:
            root = Path(folder); frozen = root/'frozen_candidates.json'; base = root/'dataset.json'
            base.write_text('{}', encoding='utf8'); frozen.write_text(json.dumps({'baseline_dataset_sha256': hashlib.sha256(base.read_bytes()).hexdigest()}), encoding='utf8')
            (root/'checkpoint_protocol_lock.json').write_text(json.dumps({'files': {'frozen_candidates.json': hashlib.sha256(frozen.read_bytes()).hexdigest()}}), encoding='utf8')
            locked_inputs(frozen, base)
            frozen.write_text('{}', encoding='utf8')
            with self.assertRaisesRegex(ValueError, 'FROZEN_PROTOCOL_DRIFT'):
                locked_inputs(frozen, base)


if __name__ == '__main__':
    unittest.main()
