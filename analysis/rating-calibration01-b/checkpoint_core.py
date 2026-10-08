"""Read-only checkpoint aggregation. No engine replay, tuning, SQL, or production writes."""
from collections import Counter,defaultdict
from datetime import datetime,timezone
from itertools import product
import hashlib,json,math

def stamp(s):
 d=datetime.fromisoformat(s.replace('Z','+00:00'))
 if d.tzinfo is None:raise ValueError('TIMEZONE_REQUIRED')
 return d.astimezone(timezone.utc)

def order(m):return (stamp(m['played_at']),m.get('match_number') if m.get('match_number') is not None else math.inf,m['id'])
def edges(value,limits):
 for i in range(len(limits)-1):
  if limits[i]<=value<limits[i+1]:return f'{limits[i]:g}-{limits[i+1]:g}'
 raise ValueError('VALUE_OUTSIDE_FROZEN_BUCKETS')
def group(gaps,cfg):
 b=cfg['composition']['balanced_teammate_gap_max'];m=cfg['composition']['mixed_teammate_gap_min']
 if max(gaps)<=b:return 'balanced-balanced'
 if min(gaps)>=m:return 'mixed-mixed'
 if max(gaps)>=m and min(gaps)<=b:return 'mixed-balanced'
 return 'intermediate'

def validate(data,frozen):
 errors=[]
 if data.get('baseline_rated_present')!=len(frozen['baseline_match_ids']):errors.append('baseline_source_inventory_changed')
 for k in ['projection_mismatch','orphan_events','duplicate_events','cardinality_errors','nonfinite_values','result_errors','adjustments']:
  if data.get('quality',{}).get(k)!=0:errors.append(k)
 if data.get('formula_md5')!=frozen['production_definition_md5']:errors.append('formula_hash')
 if data.get('active_settings_count')!=1:errors.append('active_settings_count')
 common=frozen['common_parameters'];settings=data.get('settings',{})
 for k in ['initial_rating','min_rating','max_rating','k_factor','provisional_matches','stable_matches','recency_half_life_days','recency_floor','rating_delta_cap']:
  if settings.get(k)!=common[k]:errors.append('settings:'+k)
 if settings.get('expected_sensitivity')!=frozen['candidates']['A']['expected_sensitivity']:errors.append('control_sensitivity')
 if data.get('weights')!=common['match_weights']:errors.append('match_weights')
 ms=data.get('matches',[]);ids=[m['id'] for m in ms]
 if len(ids)!=len(set(ids)):errors.append('duplicate_match')
 es=data.get('events',[]);keys=[(e['match_id'],e['player_id']) for e in es]
 if len(keys)!=len(set(keys)):errors.append('duplicate_event')
 for m in ms:
  try:
   order(m);ls=[l for l in data['lineups'] if l['match_id']==m['id']];events=[e for e in es if e['match_id']==m['id']]
   if len(ls)!=4 or Counter(l['team'] for l in ls)!=dict(A=2,B=2) or len({l['player_id'] for l in ls})!=4 or len(events)!=4 or {e['player_id'] for e in events}!={l['player_id'] for l in ls}:raise ValueError('cardinality')
   sa,sb=m['team_a_score'],m['team_b_score']
   if type(sa) is not int or type(sb) is not int or min(sa,sb)<0 or m['score_mode'] not in ['POINTS','RESULT'] or (m['score_mode']=='POINTS' and sa+sb<=0):raise ValueError('scores')
   if m['score_mode']=='RESULT' and (sa not in [0,1] or sb not in [0,1] or sa+sb==0):raise ValueError('result')
   team={l['player_id']:l['team'] for l in ls}
   for e in events:
    if any(not math.isfinite(float(e[k])) for k in ['rating_before','rating_after','rating_delta','expected_share','actual_share']):raise ValueError('nonfinite')
    if not 0<=float(e['expected_share'])<=1 or not 0<=float(e['actual_share'])<=1:raise ValueError('share_range')
    expected_actual=sa/(sa+sb) if m['score_mode']=='POINTS' else 1 if sa>sb else 0 if sa<sb else .5
    if team[e['player_id']]=='B':expected_actual=1-expected_actual
    if abs(e['actual_share']-expected_actual)>10**(-frozen['common_parameters']['event_share_delta_scale']):raise ValueError('actual_share')
  except (ValueError,KeyError,TypeError,OverflowError) as exc:errors.append('match:'+m['id']+':'+str(exc))
 if any(e['match_id'] not in ids for e in es):errors.append('orphan_selected_event')
 previous={}
 try:
  for m in sorted(ms,key=order):
   for e in [v for v in es if v['match_id']==m['id']]:
    p=e['player_id']
    if p in previous and abs(float(e['rating_before'])-previous[p])>10**(-frozen['common_parameters']['rating_scale'])/2:errors.append('rating_continuity:'+p)
    previous[p]=float(e['rating_after'])
 except (ValueError,KeyError,TypeError):errors.append('ordering_or_continuity')
 return sorted(set(errors))

def blank(cfg):
 return dict(new_matches=0,new_dates=0,players=0,cumulative_ge5=0,cumulative_ge10=0,cumulative_ge20=0,prospective_ge5=0,prospective_ge10=0,prospective_ge20=0,newcomer_first=0,newcomer_ge5=0,newcomer_ge10=0,newcomer_ge15=0,newcomer_ge25=0,matched_mean=0,tail_2plus=0,gaps={f'{a:g}-{b:g}':0 for a,b in zip(cfg['gap_edges'],cfg['gap_edges'][1:])},doubles={k:0 for k in ['balanced-balanced','mixed-balanced','mixed-mixed']},bands={f'{a:g}-{b:g}':0 for a,b in zip(cfg['expected_share_bands'],cfg['expected_share_bands'][1:])},dependence={},diversity_gaps={f'{a:g}-{b:g}':0 for a,b in zip(cfg['gap_edges'],cfg['gap_edges'][1:])})

def aggregate(data,ms,cfg,frozen,sealed=None):
 c=blank(cfg);pc=Counter();days=Counter();pairs=Counter();opponents=Counter();quartets=Counter();matchups=Counter();player_partners=defaultdict(Counter);subset_quartets=Counter();subset_matchups=Counter();subset_dates=Counter()
 context={p['id']:p for p in data['players']};retrospective={};first_selected={}
 for e in data['events']:retrospective[(e['match_id'],e['player_id'])]=float(e['rating_before'])
 for m in sorted(ms,key=order):
  ls=[l for l in data['lineups'] if l['match_id']==m['id']];teams=[sorted(l['player_id'] for l in ls if l['team']==t) for t in 'AB'];ids=sorted(sum(teams,[]));before=sealed[m['id']]['sealed_pre_ratings'] if sealed else {p:retrospective[(m['id'],p)] for p in ids}
  means=[sum(float(before[p]) for p in team)/2 for team in teams];tg=[abs(float(before[t[0]])-float(before[t[1]])) for t in teams];gap=abs(means[0]-means[1]);bucket=edges(gap,cfg['gap_edges']);comp=group(tg,cfg);day=stamp(m['played_at']).date().isoformat()
  c['gaps'][bucket]+=1;c['doubles'][comp]=c['doubles'].get(comp,0)+1;c['matched_mean']+=int(comp=='mixed-balanced' and gap<=cfg['composition']['matched_team_mean_gap_max']);c['tail_2plus']+=int(gap>=2)
  expected=1/(1+math.exp((means[1]-means[0])/frozen['candidates']['A']['expected_sensitivity']));c['bands'][edges(max(expected,1-expected),cfg['expected_share_bands'])]+=1
  days[day]+=1;pc.update(ids);
  for p in ids:first_selected.setdefault(p,stamp(m['played_at']))
  quartet=tuple(ids);matchup=tuple(sorted(tuple(t) for t in teams));quartets[quartet]+=1;matchups[matchup]+=1
  for t in teams:
   pairs[tuple(t)]+=1;player_partners[t[0]][t[1]]+=1;player_partners[t[1]][t[0]]+=1
  for p,q in product(*teams):opponents[tuple(sorted([p,q]))]+=1
  lim=cfg['diversity_subset']
  if subset_quartets[quartet]<lim['max_same_quartet_per_window'] and subset_matchups[matchup]<lim['max_identical_matchup_per_window'] and subset_dates[day]<lim['max_date_matches']:
   c['diversity_gaps'][bucket]+=1;subset_quartets[quartet]+=1;subset_matchups[matchup]+=1;subset_dates[day]+=1
 c.update(new_matches=len(ms),new_dates=len(days),players=len(pc))
 for n in [5,10,20]:
  c[f'prospective_ge{n}']=sum(v>=n for v in pc.values());c[f'cumulative_ge{n}']=sum(context[p]['cumulative_matches']>=n for p in pc)
 newcomers=[p for p in pc if context[p].get('first_rated_at') and stamp(context[p]['first_rated_at'])>stamp(frozen['frozen_at']) and stamp(context[p]['first_rated_at'])==first_selected[p]]
 c['newcomer_first']=len(newcomers)
 for n in [5,10,15,25]:c[f'newcomer_ge{n}']=sum(pc[p]>=n for p in newcomers)
 def stats(counter):
  total=sum(counter.values());return dict(distinct=len(counter),repeated_groups=sum(v>1 for v in counter.values()),repeat_observations=sum(max(v-1,0) for v in counter.values()),max_count=max(counter.values(),default=0),top_share=max(counter.values(),default=0)/total if total else 0)
 c['dependence']={k:stats(v) for k,v in dict(teammates=pairs,opponents=opponents,quartets=quartets,matchups=matchups,days=days).items()}
 c['dependence']['max_player_appearance_share']=max(pc.values(),default=0)/(len(ms)*4) if ms else 0
 c['dependence']['max_partner_repeat_share_per_player']=max((max(v.values())/pc[p] for p,v in player_partners.items()),default=0)
 c['dependence']['max_date_share']=max(days.values(),default=0)/len(ms) if ms else 0
 return c

def gates(c,cfg,index,protocol):
 t=cfg['checkpoints'][index];out={}
 def add(name,value,target):out[name]=dict(current=value,target=target,remaining=max(0,target-value),status='PASS' if value>=target else 'NOT YET')
 for key in ['new_matches','new_dates','players']:add(key,c[key],t[key])
 for n in [5,10,20]:add('cumulative_ge'+str(n),c['cumulative_ge'+str(n)],t['players_ge'+str(n)])
 add('newcomer_ge15',c['newcomer_ge15'],t['newcomer_cohorts'])
 if index==len(cfg['checkpoints'])-1:add('newcomer_ge25',c['newcomer_ge25'],t['newcomer_cohorts'])
 for b,v in c['gaps'].items():add('gap:'+b,v,t['per_gap_bucket'])
 for b in ['balanced-balanced','mixed-balanced','mixed-mixed']:add('doubles:'+b,c['doubles'].get(b,0),cfg['composition']['per_core_composition'][index])
 add('matched_mean',c['matched_mean'],cfg['matched_mean_mixed_balanced_minimums'][index]);add('tail_2plus',c['tail_2plus'],cfg['tail_2plus_diagnostic_minimums'][index])
 for b,v in c['bands'].items():add('expected_band:'+b,v,cfg['expected_share_band_minimums'][index])
 if index==len(cfg['checkpoints'])-1:
  for b,v in c['diversity_gaps'].items():add('diversity_gap:'+b,v,t['per_gap_bucket'])
 for key,limit in cfg['coverage_limits'].items():
  value=c.get('dependence',{}).get(key,0);out[key]=dict(current=value,target=limit,remaining=max(0,value-limit),status='PASS' if value<=limit else 'NOT YET',direction='maximum')
 out['sealed_protocol']=dict(current=protocol,target=True,remaining=None,status='PASS' if protocol else 'UNKNOWN')
 return out

def evaluate(c,observed,cfg,protocol,decision=False):
 levels={t['name']:gates(c,cfg,i,protocol) for i,t in enumerate(cfg['checkpoints'])};passed=[name for name,gs in levels.items() if all(g['status']=='PASS' for g in gs.values())]
 status='PRE-MINIMUM'
 if passed:status=passed[-1].upper()+' REACHED'
 if observed['new_matches']>=cfg['checkpoints'][-1]['new_matches'] and cfg['checkpoints'][-1]['name'] not in passed:status='STRONG COUNT REACHED / COVERAGE INCOMPLETE'
 next_name=next((t['name'] for t in cfg['checkpoints'] if t['name'] not in passed),None)
 missing=[]
 if next_name:
  for name,g in levels[next_name].items():
   if g['status']!='PASS':missing.append(dict(gate=name,remaining=g['remaining'],current=g['current'],target=g['target'],status=g['status']))
  missing.sort(key=lambda x:(x['gate']!='matched_mean',x['remaining'] is None,-(x['remaining'] or 0),x['gate']))
 return dict(status=status,levels=levels,next_checkpoint=next_name,missing=missing,calibration_c_eligible=cfg['checkpoints'][-1]['name'] in passed and decision,decision_review='PASS' if decision else 'UNKNOWN — frozen B performance/fairness/stability review still required')
