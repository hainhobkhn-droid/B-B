import copy
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent/'rating-calibration01-b'))
from monitor_checkpoint import protocol, markdown
from monitor_extension import run
from reconcile_adjustments import replay


class Extension(unittest.TestCase):
    def data(self, adjustment=False):
        cfg, frozen = protocol()
        data = json.loads((ROOT.parent/'rating-calibration01-a/dataset.json').read_text(encoding='utf8'))
        data['captured_at'] = '2026-10-10T12:00:00Z'
        data['adjustments'] = []; data['adjustment_events'] = []
        if adjustment:
            p = data['players'][0]['id']
            data['adjustments'] = [dict(id='synthetic-post', player_id=p, amount=.2,
                                       effective_at='2026-10-08T08:00:00Z', created_at='2026-10-08T08:01:00Z',
                                       replay_order=1, correction_of_adjustment_id=None, request_algorithm_version='V1.1')]
            rebuilt = replay(data, frozen)
            data['adjustment_events'] = [dict(**{k: str(v) for k, v in e.items()}, algorithm_version='V1.1') for e in rebuilt['adjustment_events']]
            for player in data['players']:
                player['current_rating'] = str(rebuilt['ratings'][player['id']])
        return cfg, frozen, data

    def test_no_intervention(self):
        cfg, frozen, data = self.data()
        r = run(None, cfg, frozen, data, True)
        self.assertEqual(r['quality_errors'], [])
        self.assertEqual(r['status'], 'PRE-MINIMUM')

    def test_post_adjustment_no_false_block(self):
        cfg, frozen, data = self.data(True)
        r = run(None, cfg, frozen, data, True)
        self.assertEqual(r['quality_errors'], [])
        self.assertEqual(r['manual_adjustments']['post_cutoff_adjustments'], 1)
        self.assertIn('MANUAL ADJUSTMENT INTERVENTIONS', markdown(r))

    def test_pre_cutoff_still_blocks(self):
        cfg, frozen, data = self.data(True)
        data['adjustments'][0]['effective_at'] = frozen['frozen_at']
        r = run(None, cfg, frozen, data, True)
        self.assertEqual(r['status'], 'BLOCKED — DATA QUALITY')
        self.assertIsNone(r['calibration_c_eligible'])

    def test_no_surrogate_forecasts(self):
        cfg, frozen, data = self.data(True)
        r = run(None, cfg, frozen, data, True)
        self.assertFalse(r['calibration_c_eligible'])
        self.assertEqual(r['verified']['new_matches'], 0)
        self.assertIn('UNAVAILABLE', r['metrics'])


if __name__ == '__main__':
    unittest.main()
