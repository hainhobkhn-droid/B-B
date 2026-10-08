"""Build eight clearly synthetic OFFLINE gate-contract fixtures, not production data."""
from pathlib import Path
import json,copy
from checkpoint_core import blank
ROOT=Path(__file__).resolve().parent
cfg=json.loads((ROOT/'checkpoint_config.json').read_text())
def counters(level):
 c=blank(cfg)
 if level is None:return c
 t=cfg['checkpoints'][level]
 for k in ['new_matches','new_dates','players']:c[k]=t[k]
 for n in [5,10,20]:c['cumulative_ge'+str(n)]=t['players_ge'+str(n)];c['prospective_ge'+str(n)]=t['newcomer_cohorts']
 for k in ['newcomer_first','newcomer_ge5','newcomer_ge10','newcomer_ge15','newcomer_ge25']:c[k]=t['newcomer_cohorts']
 for b in c['gaps']:c['gaps'][b]=t['per_gap_bucket'];c['diversity_gaps'][b]=t['per_gap_bucket']
 c['gaps'][next(iter(c['gaps']))]+=t['new_matches']-sum(c['gaps'].values())
 for b in c['doubles']:c['doubles'][b]=cfg['composition']['per_core_composition'][level]
 c['doubles']['intermediate']=t['new_matches']-sum(c['doubles'].values())
 for b in c['bands']:c['bands'][b]=cfg['expected_share_band_minimums'][level]
 c['bands'][next(iter(c['bands']))]+=t['new_matches']-sum(c['bands'].values())
 c['matched_mean']=cfg['matched_mean_mixed_balanced_minimums'][level];c['tail_2plus']=cfg['tail_2plus_diagnostic_minimums'][level]
 c['dependence']={k:0 for k in cfg['coverage_limits']}
 return c
fixtures={}
for name,level in [('zero-new',None),('pre-minimum',None),('exact-minimum',0),('count-coverage-incomplete',0),('preferred',1),('strong',2),('strong-one-doubles-missing',2),('data-quality-failure',None)]:
 c=counters(level)
 if name=='pre-minimum':c['new_matches']=1
 if name=='count-coverage-incomplete':c['matched_mean']-=1
 if name=='strong-one-doubles-missing':c['doubles']['mixed-mixed']-=1
 fixtures[name]={'fixture_contract':{'description':'SYNTHETIC aggregate-contract test; never production evidence','counters':c,'sealed_protocol':True,'decision_review':True,'quality_errors':['projection_mismatch'] if name=='data-quality-failure' else []}}
if __name__=='__main__':
 folder=ROOT/'monitor_fixtures';folder.mkdir(exist_ok=True)
 for name,data in fixtures.items():(folder/(name+'.json')).write_text(json.dumps(data,indent=2)+'\n',encoding='utf8')
 print('Created eight OFFLINE-only fixtures')
