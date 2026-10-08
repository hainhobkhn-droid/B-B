"""One-command read-only monitoring. Local outputs only; never invokes a business RPC."""
import argparse,csv,hashlib,json,math,os,shutil,subprocess,sys,tempfile
from datetime import datetime,timezone
from pathlib import Path
from checkpoint_core import validate,aggregate,blank,evaluate,stamp,order
ROOT=Path(__file__).resolve().parent

def protocol():
 lock=json.loads((ROOT/'checkpoint_protocol_lock.json').read_text(encoding='utf8'))
 for n,h in lock['files'].items():
  if hashlib.sha256((ROOT/n).read_bytes()).hexdigest()!=h:raise ValueError('FROZEN_PROTOCOL_DRIFT:'+n)
 cfg=json.loads((ROOT/'checkpoint_config.json').read_text(encoding='utf8'));frozen=json.loads((ROOT/'frozen_candidates.json').read_text(encoding='utf8'))
 return cfg,frozen

def extract(frozen,cli):
 from uuid import UUID
 ids=','.join("'"+str(UUID(v))+"'::uuid" for v in frozen['baseline_match_ids'])
 if not cli:raise RuntimeError('SUPABASE_CLI_REQUIRED')
 sql=(ROOT/'checkpoint_readonly.sql').read_text(encoding='utf8').replace('__CUTOFF__',stamp(frozen['frozen_at']).isoformat()).replace('__BASELINE_IDS__',ids)
 target=ROOT/'checkpoints';target.mkdir(exist_ok=True)
 with tempfile.TemporaryDirectory(prefix='query-',dir=target) as tmp:
  p=Path(tmp)/'read.sql';p.write_text(sql,encoding='utf8')
  x=subprocess.run([cli,'db','query','--linked','--project-ref','bflwaqlvnesuqoyikxar','--output','json','--file',str(p)],capture_output=True,text=True,encoding='utf8',timeout=120)
  if x.returncode:raise RuntimeError('READ_ONLY_EXTRACTION_FAILED: exit '+str(x.returncode))
  obj=json.loads(x.stdout)['rows'][0]['monitor_dataset']
  return json.loads(obj) if isinstance(obj,str) else obj

def evidence(data,ms,frozen,path):
 if not path:return {},None,False,False,['NO SEALED PRE-RESULT EVIDENCE; source events are retrospective, not prospective forecasts']
 from validation_metrics import load_and_validate,summarize
 payload=json.loads(Path(path).read_text(encoding='utf8'));quality=dict(payload['quality']);quality.update(data['quality']);quality['formula_md5']=data['formula_md5']
 expected_hash=hashlib.sha256((ROOT/'frozen_candidates.json').read_bytes()).hexdigest()
 if quality.get('manifest_sha256')!=expected_hash:raise ValueError('EVIDENCE_MANIFEST_MISMATCH')
 source={m['id']:m for m in ms};rows=payload['rows'];selected=[];sealed={}
 for row in rows:
  if row['match_id'] not in source:raise ValueError('EVIDENCE_NOT_IN_CURRENT_SOURCE')
  m=source[row['match_id']]
  if stamp(row['played_at'])!=stamp(m['played_at']) or int(row['score_a'])!=m['team_a_score'] or int(row['score_b'])!=m['team_b_score']:raise ValueError('EVIDENCE_SOURCE_MISMATCH')
  ls=[l for l in data['lineups'] if l['match_id']==m['id']];ids={l['player_id'] for l in ls}
  for key in ['sealed_pre_ratings','sealed_d_pre_ratings']:
   if set(row[key])!=ids or any(not math.isfinite(float(v)) or not frozen['common_parameters']['min_rating']<=float(v)<=frozen['common_parameters']['max_rating'] for v in row[key].values()):raise ValueError('SEALED_STATE_INVALID')
  for state_key,model,forecast_key in [('sealed_pre_ratings','A','expected_a'),('sealed_d_pre_ratings','D_S1.2','expected_d')]:
   means=[sum(float(row[state_key][l['player_id']]) for l in ls if l['team']==t)/2 for t in 'AB'];expected=1/(1+math.exp((means[1]-means[0])/frozen['candidates'][model]['expected_sensitivity']))
   if abs(float(row[forecast_key])-expected)>10**(-frozen['common_parameters']['event_share_delta_scale']):raise ValueError('FROZEN_EXPECTATION_MISMATCH')
  for key in ['source_prefix_sha256','seed_snapshot_sha256']:
   if len(row.get(key,''))!=64 or any(c not in '0123456789abcdef' for c in row[key]):raise ValueError('AS_OF_DIGEST_REQUIRED')
  selected.append(row);sealed[row['match_id']]=row
 selected.sort(key=lambda row:order(source[row['match_id']]))
 validated=load_and_validate(selected,frozen,quality)
 metrics=summarize(validated) if validated else None
 if metrics:
  metrics['stability']='UNAVAILABLE — reviewed shadow deltas required; not inferred from A production events'
  metrics['rating_pool_drift']='UNAVAILABLE — separate model-specific shadow projections required'
  metrics['fairness']='Coverage and paired errors only; causal individual contribution not identified'
  metrics['late_half']=summarize(validated[len(validated)//2:])
 # External review is retained as evidence, never represented as machine-verified safety.
 review=payload.get('decision_review',{});cfg,_=protocol()
 decision=review.get('independently_reviewed') is True and all(review.get(k) is True for k in cfg['thresholds'])
 if metrics:
  decision=decision and metrics['relative_gain'] is not None and metrics['relative_gain']>=cfg['thresholds']['relative_primary_mse_gain_min'] and metrics['date_bootstrap95'][0]>cfg['thresholds']['strong_date_cluster_ci_lower_min'] and metrics['late_half']['relative_gain'] is not None and metrics['late_half']['relative_gain']>=cfg['thresholds']['late_half_relative_gain_min']
 else:decision=False
 return sealed,metrics,quality.get('no_retuning_verified') is True,decision,['As-of/decision attestations require operator review; digests/timestamps alone are not proof of capture time']

def run(data,cfg,frozen,evidence_path=None,offline=False):
 if 'fixture_contract' in data:
  if not offline:raise ValueError('AGGREGATE_FIXTURE_REQUIRES_OFFLINE')
  fixture=data['fixture_contract'];errors=fixture.get('quality_errors',[])
  if errors:return dict(status='BLOCKED — DATA QUALITY',quality_errors=errors,calibration_c_eligible=None,offline_fixture=True)
  counts=fixture['counters'];result=evaluate(counts,counts,cfg,fixture['sealed_protocol'],fixture['decision_review'])
  return dict(result,quality_errors=[],observed=counts,verified=counts,offline_fixture=True,metrics='SYNTHETIC CONTRACT FIXTURE — no production inference',cutoff=frozen['frozen_at'])
 errors=validate(data,frozen)
 if errors:return dict(status='BLOCKED — DATA QUALITY',quality_errors=errors,quality_counters=data.get('quality',{}),captured_at=data.get('captured_at'),formula_md5=data.get('formula_md5'),calibration_c_eligible=None,offline_fixture=offline)
 cutoff=stamp(frozen['frozen_at']);baseline=set(frozen['baseline_match_ids'])
 observed_ms=sorted([m for m in data['matches'] if stamp(m['played_at'])>cutoff and m['id'] not in baseline],key=order)
 if any(stamp(m['played_at'])>stamp(data['captured_at']) for m in observed_ms):return dict(status='BLOCKED — DATA QUALITY',quality_errors=['FUTURE_PLAYED_AT'],calibration_c_eligible=None,offline_fixture=offline)
 primary=[m for m in observed_ms if m['match_type']=='CLUB_RATED' and m['score_mode']=='POINTS']
 observed=aggregate(data,primary,cfg,frozen)
 try:sealed,metrics,intact,decision,warnings=evidence(data,primary,frozen,evidence_path)
 except (ValueError,KeyError,TypeError) as exc:return dict(status='BLOCKED — DATA QUALITY',quality_errors=['PROSPECTIVE_EVIDENCE:'+str(exc)],calibration_c_eligible=None,offline_fixture=offline)
 verified_ms=[m for m in primary if m['id'] in sealed];verified=aggregate(data,verified_ms,cfg,frozen,sealed) if sealed else blank(cfg)
 result=evaluate(verified,observed,cfg,intact,decision)
 if metrics and verified['new_matches']<cfg['checkpoints'][-1]['new_matches']:metrics['decision_status']='INSUFFICIENT FOR DECISION'
 return dict(result,quality_errors=[],cutoff=frozen['frozen_at'],captured_at=data['captured_at'],offline_fixture=offline,observed_rated_after_cutoff=len(observed_ms),observed=observed,verified=verified,total_rated_matches=data['total_rated_matches'],baseline_plus_verified=len(baseline)+len(verified_ms),metrics=metrics or 'UNAVAILABLE — sealed A/D forecasts missing; no surrogate D replay from production A states',warnings=warnings,retrospective_coverage_is_not_prospective=True)

def markdown(result):
 lines=['# Checkpoint monitoring snapshot','',('OFFLINE SYNTHETIC FIXTURE — NOT PRODUCTION EVIDENCE' if result.get('offline_fixture') else 'READ-ONLY SOURCE MONITORING'),'',f"CHECKPOINT STATUS: {result['status']}"]
 if result.get('quality_errors'):
  lines+=['','Quality failures: '+', '.join(result['quality_errors']),str(result.get('quality_counters',{})),'Calibration C eligibility withheld.']
  if 'adjustments' in result['quality_errors']:lines+=['Manual adjustments are present: frozen B requires a reviewed replay extension before primary validation. This does not mean these production records are invalid; do not delete or ignore them.']
 else:
  lines+=['',f"CALIBRATION C ELIGIBLE: {'YES — analysis entry only, never approval to deploy D' if result['calibration_c_eligible'] else 'NO'}",f"Cutoff: {result.get('cutoff')}"]
  if 'observed' in result:
   o=result['observed'];v=result['verified'];lines+=['',f"Observed primary matches: {o['new_matches']}; verified prospective: {v['new_matches']}",f"Verified match-days: {v['new_dates']}; Players: {v['players']}",f"Prospective >=5/10/20: {v['prospective_ge5']}/{v['prospective_ge10']}/{v['prospective_ge20']}; cumulative >=5/10/20: {v['cumulative_ge5']}/{v['cumulative_ge10']}/{v['cumulative_ge20']}",f"Newcomer first/5/10/15/25: {v['newcomer_first']}/{v['newcomer_ge5']}/{v['newcomer_ge10']}/{v['newcomer_ge15']}/{v['newcomer_ge25']}",f"**Matched-mean mixed/balanced: {v['matched_mean']} verified** (historical baseline3/60)",f"Observed retrospective dependence: {o['dependence']}"]
  for level,gs in result.get('levels',{}).items():
   lines+=['',f'## {level.title()} gates','','| Gate | Current | Target | Remaining | Status |','|---|---:|---:|---:|---|']
   lines += [f"| {k} | {g['current']} | {g['target']} | {g['remaining']} | {g['status']} |" for k,g in gs.items()]
  lines+=['','## What is missing','']+[f"- {g['gate']}: remaining {g['remaining']}, {g['status']}" for g in result.get('missing',[])]
  lines+=['','## Frozen model metrics','',str(result.get('metrics')),'']+['- '+w for w in result.get('warnings',[])]
 if result.get('manual_adjustments'):
  a=result['manual_adjustments'];lines+=['','## MANUAL ADJUSTMENT INTERVENTIONS','',f"Protocol: {a.get('protocol')}; post-cutoff adjustments: {a.get('post_cutoff_adjustments')}; adjusted Players: {a.get('unique_adjusted_players')}",f"Clean matches: {a.get('clean_matches')}; adjustment-affected: {a.get('adjustment_affected_matches')}; intervened newcomers: {a.get('manually_intervened_newcomers')}",f"Pool decomposition: {a.get('pool')}",'Natural newcomer convergence is censored from first intervention; administrative movement is excluded from engine volatility.']
 lines+=['','Production mutation: NO. No retuning; no automatic git action.','']
 return '\n'.join(lines)

def main():
 p=argparse.ArgumentParser();p.add_argument('--input',type=Path);p.add_argument('--offline',action='store_true');p.add_argument('--evidence',type=Path);p.add_argument('--json',type=Path);p.add_argument('--markdown',type=Path);p.add_argument('--snapshot',action='store_true');p.add_argument('--adjustment-protocol',choices=['P3']);p.add_argument('--supabase',default=str(Path.home()/'bin'/'supabase.exe') if (Path.home()/'bin'/'supabase.exe').exists() else shutil.which('supabase'));args=p.parse_args()
 if args.offline and not args.input:p.error('--offline requires --input')
 if args.input and not args.offline:p.error('local input requires --offline; production runs always extract read-only')
 try:
  cfg,frozen=protocol()
  if args.adjustment_protocol:
   if args.evidence:raise ValueError('INTERVENTION_AWARE_SEALED_EVIDENCE_NOT_IMPLEMENTED')
   sys.path.insert(0,str(ROOT.parent/'rating-calibration01-b2'))
   from monitor_extension import run as run_adjustments
   data=json.loads(args.input.read_text(encoding='utf8')) if args.input else None
   result=run_adjustments(args.supabase,cfg,frozen,data,args.offline)
  else:
   data=json.loads(args.input.read_text(encoding='utf8')) if args.input else extract(frozen,args.supabase)
   result=run(data,cfg,frozen,args.evidence,args.offline)
 except Exception as exc:result=dict(status='BLOCKED — DATA QUALITY',quality_errors=[type(exc).__name__+':'+str(exc)],calibration_c_eligible=None,offline_fixture=args.offline)
 out=ROOT/'checkpoints';out.mkdir(exist_ok=True);jp=args.json or out/'latest-checkpoint.json';mp=args.markdown or out/'latest-checkpoint.md'
 protected={ROOT/'checkpoint_config.json',ROOT/'frozen_candidates.json',ROOT/'checkpoint_protocol_lock.json',ROOT/'checkpoint_readonly.sql'}
 for path in [jp,mp]:
  if path.resolve() in {x.resolve() for x in protected} or (path.exists() and not path.resolve().is_relative_to(out.resolve())):raise ValueError('PROTECTED_NON_SNAPSHOT_OUTPUT_PATH')
  path.parent.mkdir(parents=True,exist_ok=True)
 jp.write_text(json.dumps(result,indent=2,ensure_ascii=False,allow_nan=False)+'\n',encoding='utf8');mp.write_text(markdown(result),encoding='utf8');print(markdown(result))
 if args.snapshot:
  suffix=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ');(out/(suffix+'.json')).write_bytes(jp.read_bytes());(out/(suffix+'.md')).write_bytes(mp.read_bytes())
 return 2 if result.get('quality_errors') else 0
if __name__=='__main__':raise SystemExit(main())
