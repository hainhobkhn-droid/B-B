"""Research-only metrics; consumes sealed forecasts, never predicts or touches production."""
import argparse,csv,json,math,random,statistics as st
from pathlib import Path
from datetime import datetime,timezone
from collections import defaultdict
ROOT=Path(__file__).resolve().parent
def stamp(v):
 d=datetime.fromisoformat(v.replace('Z','+00:00'))
 if d.tzinfo is None:raise ValueError('TIMEZONE_REQUIRED')
 return d

def load_and_validate(rows,manifest,quality):
 if manifest.get('candidates')!={'A':{'expected_sensitivity':.9},'D_S1.2':{'expected_sensitivity':1.2}}:raise ValueError('FROZEN_CANDIDATE_DRIFT')
 common=manifest.get('common_parameters',{})
 for k,v in {'k_factor':.55,'min_rating':2,'max_rating':8,'rating_delta_cap':.35,'provisional_matches':5,'stable_matches':10,'recency_half_life_days':60,'recency_floor':.35,'provisional_factor':1.25,'transition_factor':1.10,'established_factor':1.00,'initial_rating':4,'rating_scale':3,'event_share_delta_scale':5,'match_weights':{'TOURNAMENT':1,'LEAGUE':.95,'CLUB_RATED':.9,'FRIENDLY_RATED':.6,'SELF_REPORTED':.4,'TRAINING':0}}.items():
  if common.get(k)!=v:raise ValueError('FROZEN_PARAMETER_DRIFT:'+k)
 for key in ['projection_mismatch','orphan_events','duplicate_events','cardinality_errors','ordering_errors','nonfinite_values','result_errors']:
  if quality.get(key)!=0:raise ValueError('DATA_QUALITY_BLOCK:'+key)
 if quality.get('formula_md5')!=manifest['production_definition_md5']:raise ValueError('SOURCE_DRIFT')
 if quality.get('as_of_seeds_verified') is not True or quality.get('forecasts_sealed_before_outcome') is not True:raise ValueError('AS_OF_EVIDENCE_REQUIRED')
 baseline=set(manifest['baseline_match_ids']);seen=set();out=[]
 for row in rows:
  mid=row['match_id']
  if mid in baseline or mid in seen:raise ValueError('OLD_OR_DUPLICATE_MATCH')
  seen.add(mid)
  if row['match_type']!='CLUB_RATED' or row['score_mode']!='POINTS':raise ValueError('OUTSIDE_PRIMARY_POPULATION')
  pred=stamp(row['prediction_recorded_at']);played=stamp(row['played_at']);known=stamp(row['outcome_known_at'])
  if not stamp(manifest['frozen_at'])<=pred<=played<known:raise ValueError('LOOKAHEAD_OR_INVALID_TIMING')
  if row['manifest_sha256']!=quality.get('manifest_sha256'):raise ValueError('MANIFEST_MISMATCH')
  pa,pd,actual=[float(row[k]) for k in ['expected_a','expected_d','actual_share']]
  if any(not math.isfinite(v) or not 0<=v<=1 for v in [pa,pd,actual]):raise ValueError('INVALID_SHARE')
  score_a,score_b=[int(row[k]) for k in ['score_a','score_b']]
  if min(score_a,score_b)<0 or score_a+score_b<=0 or abs(actual-score_a/(score_a+score_b))>1e-10:raise ValueError('SCORE_SHARE_MISMATCH')
  if row['forecast_source']!='sealed_pre_result':raise ValueError('EXPLORATORY_ONLY_SOURCE')
  out.append(dict(match_id=mid,date=played.astimezone(timezone.utc).date().isoformat(),a=(pa-actual)**2,d=(pd-actual)**2,diff=(pa-actual)**2-(pd-actual)**2))
 return out

def interval(rows,seed=20261008,reps=4000,blocked=True):
 if not rows:raise ValueError('NO_ROWS')
 blocks=defaultdict(list)
 for row in rows:blocks[row['date']].append(row)
 groups=list(blocks.values());rng=random.Random(seed);stats=[]
 for _ in range(reps):
  sample=[v for _ in groups for v in rng.choice(groups)] if blocked else [rng.choice(rows) for _ in rows]
  stats.append(st.mean(x['diff'] for x in sample))
 stats.sort()
 def quant(p):
  i=(len(stats)-1)*p;j=int(i);return stats[j]+(stats[min(j+1,len(stats)-1)]-stats[j])*(i-j)
 return [quant(.025),quant(.975)]

def summarize(rows):
 a=st.mean(x['a'] for x in rows);d=st.mean(x['d'] for x in rows)
 return dict(matches=len(rows),dates=len({x['date'] for x in rows}),mse_a=a,mse_d=d,relative_gain=None if a==0 else 1-d/a,paired_mean=st.mean(x['diff'] for x in rows),paired_median=st.median(x['diff'] for x in rows),date_bootstrap95=interval(rows),status='DESCRIPTIVE ONLY; coverage/fairness/convergence review required; no automatic GO')
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--forecasts',required=True);p.add_argument('--quality-json',required=True);p.add_argument('--manifest',default=str(ROOT/'frozen_candidates.json'));args=p.parse_args()
 manifest=json.loads(Path(args.manifest).read_text(encoding='utf8'));quality=json.loads(Path(args.quality_json).read_text(encoding='utf8'))
 import hashlib
 if quality.get('manifest_sha256')!=hashlib.sha256(Path(args.manifest).read_bytes()).hexdigest():raise ValueError('MANIFEST_HASH_INVALID')
 with open(args.forecasts,encoding='utf8',newline='') as f:rows=list(csv.DictReader(f))
 print(json.dumps(summarize(load_and_validate(rows,manifest,quality)),indent=2))
