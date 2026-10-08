import copy,json,tempfile,unittest,subprocess,sys,os
from pathlib import Path
from datetime import timedelta
import monitor_checkpoint as monitor
from checkpoint_core import blank,edges,group,aggregate,validate,evaluate,stamp
ROOT=Path(__file__).resolve().parent
CFG,FROZEN=monitor.protocol()
def fixture(name):return json.loads((ROOT/'monitor_fixtures'/(name+'.json')).read_text())
def raw():
 t=stamp(FROZEN['frozen_at'])+timedelta(days=1);ids=['synthetic-p'+str(i) for i in range(4)];ratings=[5,3,4,4];mid='synthetic-match-new'
 data=dict(captured_at=(t+timedelta(days=1)).isoformat(),formula_md5=FROZEN['production_definition_md5'],settings=dict(FROZEN['common_parameters'],expected_sensitivity=FROZEN['candidates']['A']['expected_sensitivity']),active_settings_count=1,weights=FROZEN['common_parameters']['match_weights'],baseline_rated_present=len(FROZEN['baseline_match_ids']),total_rated_matches=len(FROZEN['baseline_match_ids'])+1,quality={k:0 for k in ['projection_mismatch','orphan_events','duplicate_events','cardinality_errors','nonfinite_values','result_errors','adjustments']},matches=[dict(id=mid,played_at=t.isoformat(),match_number=1,match_type='CLUB_RATED',score_mode='POINTS',team_a_score=11,team_b_score=7)],lineups=[dict(match_id=mid,player_id=p,team='A' if i<2 else 'B') for i,p in enumerate(ids)],events=[dict(match_id=mid,player_id=p,rating_before=ratings[i],rating_after=ratings[i]+(.1 if i<2 else -.1),rating_delta=.1 if i<2 else -.1,expected_share=.5,actual_share=round(11/18 if i<2 else 7/18,5)) for i,p in enumerate(ids)],players=[dict(id=p,first_rated_at=t.isoformat(),cumulative_matches=1) for p in ids])
 return data
class MonitorTests(unittest.TestCase):
 def test_zero(self):self.assertEqual(monitor.run(fixture('zero-new'),CFG,FROZEN,offline=True)['status'],'PRE-MINIMUM')
 def test_pre_minimum(self):self.assertEqual(monitor.run(fixture('pre-minimum'),CFG,FROZEN,offline=True)['status'],'PRE-MINIMUM')
 def test_minimum(self):self.assertEqual(monitor.run(fixture('exact-minimum'),CFG,FROZEN,offline=True)['status'],'MINIMUM REACHED')
 def test_preferred(self):self.assertEqual(monitor.run(fixture('preferred'),CFG,FROZEN,offline=True)['status'],'PREFERRED REACHED')
 def test_strong(self):self.assertEqual(monitor.run(fixture('strong'),CFG,FROZEN,offline=True)['status'],'STRONG REACHED')
 def test_eligibility(self):
  self.assertTrue(monitor.run(fixture('strong'),CFG,FROZEN,offline=True)['calibration_c_eligible'])
  self.assertFalse(monitor.run(fixture('preferred'),CFG,FROZEN,offline=True)['calibration_c_eligible'])
 def test_count_not_coverage(self):self.assertEqual(monitor.run(fixture('count-coverage-incomplete'),CFG,FROZEN,offline=True)['status'],'PRE-MINIMUM')
 def test_strong_missing_doubles(self):
  got=monitor.run(fixture('strong-one-doubles-missing'),CFG,FROZEN,offline=True);self.assertEqual(got['status'],'STRONG COUNT REACHED / COVERAGE INCOMPLETE');self.assertFalse(got['calibration_c_eligible'])
 def test_quality_block(self):
  got=monitor.run(fixture('data-quality-failure'),CFG,FROZEN,offline=True);self.assertEqual(got['status'],'BLOCKED — DATA QUALITY');self.assertIsNone(got['calibration_c_eligible']);self.assertNotIn('levels',got)
 def test_fixture_online_denied(self):
  with self.assertRaises(ValueError):monitor.run(fixture('strong'),CFG,FROZEN)
 def test_cutoff_exclusion(self):
  d=raw();d['matches'][0]['played_at']=FROZEN['frozen_at'];got=monitor.run(d,CFG,FROZEN,offline=True);self.assertEqual(got['observed']['new_matches'],0)
 def test_old_id_exclusion(self):
  d=raw();old=d['matches'][0]['id'];new=FROZEN['baseline_match_ids'][0];d['matches'][0]['id']=new
  for key in ['events','lineups']:
   for row in d[key]:row['match_id']=new
  self.assertEqual(monitor.run(d,CFG,FROZEN,offline=True)['observed']['new_matches'],0)
 def test_counts_days_players(self):
  got=monitor.run(raw(),CFG,FROZEN,offline=True);self.assertEqual([got['observed'][k] for k in ['new_matches','new_dates','players']],[1,1,4]);self.assertEqual(got['verified']['new_matches'],0)
 def test_newcomer(self):
  got=aggregate(raw(),raw()['matches'],CFG,FROZEN);self.assertEqual(got['newcomer_first'],4);self.assertEqual(got['newcomer_ge5'],0)
 def test_gap_boundaries(self):
  self.assertEqual([edges(v,CFG['gap_edges']) for v in [0,.25,.5,1]],['0-0.25','0.25-0.5','0.5-1','1-6.01'])
 def test_double_groups(self):self.assertEqual([group(g,CFG) for g in [[.2,.5],[1,2],[1,.4],[.7,.4]]],['balanced-balanced','mixed-mixed','mixed-balanced','intermediate'])
 def test_matched_mean(self):self.assertEqual(aggregate(raw(),raw()['matches'],CFG,FROZEN)['matched_mean'],1)
 def test_remaining(self):
  got=monitor.run(fixture('zero-new'),CFG,FROZEN,offline=True);self.assertEqual(got['levels']['minimum']['new_matches']['remaining'],CFG['checkpoints'][0]['new_matches']);self.assertEqual(got['missing'][0]['gate'],'matched_mean')
 def test_deterministic(self):self.assertEqual(monitor.run(fixture('preferred'),CFG,FROZEN,offline=True),monitor.run(fixture('preferred'),CFG,FROZEN,offline=True))
 def test_frozen_parameters(self):self.assertEqual(FROZEN['candidates'],{'A':{'expected_sensitivity':.9},'D_S1.2':{'expected_sensitivity':1.2}})
 def test_no_retuning(self):
  with tempfile.TemporaryDirectory(dir=ROOT) as tmp:
   folder=Path(tmp)
   for n in ['checkpoint_config.json','frozen_candidates.json','validation_metrics.py','checkpoint_protocol_lock.json']:(folder/n).write_bytes((ROOT/n).read_bytes())
   obj=json.loads((folder/'frozen_candidates.json').read_text());obj['candidates']['D_S1.2']['expected_sensitivity']=1.3;(folder/'frozen_candidates.json').write_text(json.dumps(obj),encoding='utf8')
   old=monitor.ROOT;monitor.ROOT=folder
   try:
    with self.assertRaises(ValueError):monitor.protocol()
   finally:monitor.ROOT=old
 def test_protocol_missing(self):
  f=fixture('strong');f['fixture_contract']['sealed_protocol']=False;self.assertFalse(monitor.run(f,CFG,FROZEN,offline=True)['calibration_c_eligible'])
 def test_decision_missing(self):
  f=fixture('strong');f['fixture_contract']['decision_review']=False;self.assertFalse(monitor.run(f,CFG,FROZEN,offline=True)['calibration_c_eligible'])
 def test_no_surrogate_metrics(self):self.assertIn('UNAVAILABLE',monitor.run(raw(),CFG,FROZEN,offline=True)['metrics'])
 def test_duplicate(self):
  d=raw();d['events'].append(d['events'][0]);self.assertIn('duplicate_event',validate(d,FROZEN))
 def test_nonfinite(self):
  d=raw();d['events'][0]['rating_before']='NaN';self.assertTrue(validate(d,FROZEN))
 def test_source_drift(self):
  d=raw();d['formula_md5']='drift';self.assertIn('formula_hash',validate(d,FROZEN))
 def test_no_lookahead_future_match(self):
  d=raw();d['captured_at']=FROZEN['frozen_at'];self.assertIsNone(monitor.run(d,CFG,FROZEN,offline=True)['calibration_c_eligible'])
 def test_sealed_forecasts_and_late_rejection(self):
  import hashlib
  d=raw();m=d['matches'][0];t=stamp(m['played_at']);state={e['player_id']:e['rating_before'] for e in d['events']}
  row=dict(match_id=m['id'],match_type=m['match_type'],score_mode=m['score_mode'],played_at=m['played_at'],prediction_recorded_at=(t-timedelta(minutes=1)).isoformat(),outcome_known_at=(t+timedelta(hours=1)).isoformat(),manifest_sha256=hashlib.sha256((ROOT/'frozen_candidates.json').read_bytes()).hexdigest(),expected_a=.5,expected_d=.5,actual_share=11/18,score_a=11,score_b=7,forecast_source='sealed_pre_result',sealed_pre_ratings=state,sealed_d_pre_ratings=state,source_prefix_sha256='a'*64,seed_snapshot_sha256='b'*64)
  q=dict(d['quality'],ordering_errors=0,formula_md5=d['formula_md5'],manifest_sha256=row['manifest_sha256'],as_of_seeds_verified=True,forecasts_sealed_before_outcome=True,no_retuning_verified=True)
  payload=dict(rows=[row],quality=q)
  with tempfile.TemporaryDirectory(dir=ROOT) as tmp:
   path=Path(tmp)/'evidence.json';path.write_text(json.dumps(payload),encoding='utf8')
   got=monitor.run(d,CFG,FROZEN,path,offline=True);self.assertEqual(got['verified']['new_matches'],1);self.assertEqual(got['metrics']['decision_status'],'INSUFFICIENT FOR DECISION')
   row['prediction_recorded_at']=row['outcome_known_at'];path.write_text(json.dumps(payload),encoding='utf8');late=monitor.run(d,CFG,FROZEN,path,offline=True);self.assertEqual(late['status'],'BLOCKED — DATA QUALITY');self.assertIsNone(late['calibration_c_eligible'])
 def test_readonly_sql(self):
  sql=(ROOT/'checkpoint_readonly.sql').read_text().upper();self.assertIn('REPEATABLE READ READ ONLY',sql)
  for keyword in ['INSERT INTO','DELETE FROM','UPDATE PUBLIC.','CREATE OR REPLACE','ALTER TABLE','_REBUILD_RATINGS_INTERNAL(']:self.assertNotIn(keyword,sql.replace("PUBLIC._REBUILD_RATINGS_INTERNAL(TEXT,UUID)",''))
if __name__=='__main__':unittest.main()
