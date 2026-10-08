"""Tests use synthetic local forecasts; no production SQL or business RPC."""
import unittest,json,copy,sys,hashlib
from pathlib import Path
from datetime import timedelta
from validation_metrics import load_and_validate,summarize,stamp
from coverage_statistics import analyze
ROOT=Path(__file__).resolve().parent
class TestPlan(unittest.TestCase):
 def setUp(self):
  self.man=json.loads((ROOT/'frozen_candidates.json').read_text(encoding='utf8'));t=stamp(self.man['frozen_at'])
  self.quality={k:0 for k in ['projection_mismatch','orphan_events','duplicate_events','cardinality_errors','ordering_errors','nonfinite_values','result_errors']};self.quality.update(formula_md5=self.man['production_definition_md5'],as_of_seeds_verified=True,forecasts_sealed_before_outcome=True,manifest_sha256='test')
  self.row=dict(match_id='test-only-new-match',prediction_recorded_at=(t+timedelta(days=1)).isoformat(),played_at=(t+timedelta(days=1,minutes=1)).isoformat(),outcome_known_at=(t+timedelta(days=1,hours=1)).isoformat(),manifest_sha256='test',expected_a='.6',expected_d='.58',actual_share=str(11/18),score_a='11',score_b='7',match_type='CLUB_RATED',score_mode='POINTS',forecast_source='sealed_pre_result')
 def test_frozen(self):
  self.assertEqual(self.man['candidates'],{'A':{'expected_sensitivity':.9},'D_S1.2':{'expected_sensitivity':1.2}});self.assertEqual(self.man['common_parameters']['k_factor'],.55);self.assertEqual(len(self.man['baseline_match_ids']),60)
 def test_repeat_deterministic(self):
  rows=load_and_validate([self.row],self.man,self.quality);self.assertEqual(summarize(rows),summarize(rows))
 def test_rejections(self):
  cases=[('match_id',self.man['baseline_match_ids'][0]),('prediction_recorded_at',self.row['outcome_known_at']),('expected_d','nan'),('actual_share','.99'),('forecast_source','retrospective'),('manifest_sha256','changed')]
  for key,value in cases:
   with self.subTest(key=key):
    row=dict(self.row,**{key:value})
    with self.assertRaises(ValueError):load_and_validate([row],self.man,self.quality)
 def test_duplicate(self):
  with self.assertRaises(ValueError):load_and_validate([self.row,self.row],self.man,self.quality)
 def test_quality_failure(self):
  for key in ['projection_mismatch','orphan_events','duplicate_events','cardinality_errors','ordering_errors','nonfinite_values','result_errors']:
   with self.assertRaises(ValueError):load_and_validate([self.row],self.man,dict(self.quality,**{key:1}))
 def test_asof_required(self):
  with self.assertRaises(ValueError):load_and_validate([self.row],self.man,dict(self.quality,as_of_seeds_verified=False))
 def test_frozen_drift_rejected(self):
  changed=copy.deepcopy(self.man);changed['candidates']['D_S1.2']['expected_sensitivity']=1.3
  with self.assertRaises(ValueError):load_and_validate([self.row],changed,self.quality)
  changed=copy.deepcopy(self.man);changed['common_parameters']['k_factor']=.75
  with self.assertRaises(ValueError):load_and_validate([self.row],changed,self.quality)
  changed=copy.deepcopy(self.man);changed['common_parameters']['match_weights']['CLUB_RATED']=1
  with self.assertRaises(ValueError):load_and_validate([self.row],changed,self.quality)
 def test_source_drift(self):
  with self.assertRaises(ValueError):load_and_validate([self.row],self.man,dict(self.quality,formula_md5='drift'))
 def test_statistics(self):
  a=ROOT.parent/'rating-calibration01-a'
  if not a.exists():a=Path(r'C:\Users\hainh\OneDrive\Desktop\PICK DUPR B&B\B-B-remote-check\analysis\rating-calibration01-a')
  got=analyze(a);expected=json.loads((ROOT/'planning_statistics.json').read_text(encoding='utf8'));self.assertEqual(got,expected)
 def test_checkpoint_thresholds(self):
  c=json.loads((ROOT/'checkpoint_config.json').read_text());self.assertEqual([x['new_matches'] for x in c['checkpoints']],[160,240,400]);self.assertEqual(c['thresholds']['relative_primary_mse_gain_min'],.10)
if __name__=='__main__':unittest.main()
