"""Recompute dependency/uncertainty diagnostics from locked Calibration A, no engine import/grid."""
import csv,json,itertools,statistics as st,math,argparse
from pathlib import Path
from collections import Counter,defaultdict
from validation_metrics import interval

def analyze(a):
 d=json.loads((a/'dataset.json').read_text(encoding='utf8'))
 with (a/'prequential_predictions.csv').open(encoding='utf8') as f:rows=list(csv.DictReader(f))
 control={x['match_id']:x for x in rows if x['model']=='A'};candidate={x['match_id']:x for x in rows if x['model']=='D_S1.2'}
 matched_mean_count=0
 counters={k:Counter() for k in ['players','teammates','opponents','quartets','matchups','dates','gaps','bands','upsets','composition']};paired=[]
 for m in d['matches']:
  teams=[sorted(l['player_id'] for l in d['lineups'] if l['match_id']==m['id'] and l['team']==t) for t in 'AB'];ids=sorted(sum(teams,[]));counters['quartets'][tuple(ids)]+=1;counters['matchups'][tuple(sorted(tuple(t) for t in teams))]+=1
  for t in teams:counters['teammates'][tuple(t)]+=1
  for p,q in itertools.product(*teams):counters['opponents'][tuple(sorted([p,q]))]+=1
  counters['players'].update(ids);counters['dates'][m['played_date']]+=1
  row=control[m['id']];other=candidate[m['id']];gap=abs(float(row['gap']));band=next(label for lo,hi,label in [(0,.25,'0-.25'),(.25,.5,'.25-.5'),(.5,1,'.5-1'),(1,2,'1-2'),(2,7,'2+')] if lo<=gap<hi);counters['gaps'][band]+=1
  expected=float(row['expected']);actual=float(row['actual']);win=float(row['win']);prob=max(expected,1-expected)
  probband=next(label for lo,hi,label in [(.5,.55,'50-55'),(.55,.6,'55-60'),(.6,.7,'60-70'),(.7,.8,'70-80'),(.8,1.01,'80+')] if lo<=prob<hi);counters['bands'][probband]+=1
  if expected!=.5 and win!=.5 and (expected>.5)!=(win>.5):counters['upsets'][band]+=1
  before={e['player_id']:e['rating_before'] for e in d['events'] if e['match_id']==m['id']};tg=[abs(before[t[0]]-before[t[1]]) for t in teams];comp='balanced-balanced' if max(tg)<=.5 else 'mixed-mixed' if min(tg)>=1 else 'mixed-balanced' if max(tg)>=1 and min(tg)<=.5 else 'other';counters['composition'][comp]+=1
  pre_gaps=[abs(float(row['team_'+t+'_before'].split(',')[0])-float(row['team_'+t+'_before'].split(',')[1])) for t in ['a','b']]
  if max(pre_gaps)>=1 and min(pre_gaps)<=.5 and gap<=.25:matched_mean_count+=1
  la=(expected-actual)**2;ld=(float(other['expected'])-actual)**2;paired.append(dict(match_id=m['id'],date=m['played_date'],a=la,d=ld,diff=la-ld))
 def rep(c):return dict(distinct=len(c),repeated_groups=sum(v>1 for v in c.values()),max_repeats=max(c.values()),observations=sum(c.values()),repeat_fraction=1-len(c)/sum(c.values()),kish_cluster_equivalents=sum(c.values())**2/sum(v*v for v in c.values()))
 hold=paired[41:];mu=st.mean(x['diff'] for x in hold);sd=st.stdev(x['diff'] for x in hold);loss=st.mean(x['a'] for x in hold);counts=list(counters['players'].values())
 return dict(matched_mean_mixed_balanced_prequential=matched_mean_count,matches=len(d['matches']),players=len(d['players']),participating_players=len(counts),events=len(d['events']),matches_per_participant=dict(min=min(counts),max=max(counts),mean=st.mean(counts),median=st.median(counts),ge5=sum(v>=5 for v in counts),ge10=sum(v>=10 for v in counts),ge20=sum(v>=20 for v in counts)),dependence={k:rep(counters[k]) for k in ['teammates','opponents','quartets','matchups','dates']},gap_counts=dict(counters['gaps']),expected_bands=dict(counters['bands']),upsets=dict(counters['upsets']),composition_retrospective=dict(counters['composition']),holdout=dict(n=19,dates=len({r['date'] for r in hold}),paired_mean=mu,paired_median=st.median(r['diff'] for r in hold),paired_sd=sd,match_bootstrap95=interval(hold,blocked=False),date_bootstrap95=interval(hold),date_kish=rep(Counter(r['date'] for r in hold))['kish_cluster_equivalents']),planning=dict(optimistic_independent_n=math.ceil(((1.96+.84)*sd/mu)**2),independent_n_for10percent_gain=math.ceil(((1.96+.84)*sd/(.10*loss))**2),design_effect_range=[1.7,2.4],bucket_n_from_precision=[math.ceil(1.96**2*.25/(h*h)) for h in [.25,.20,.15]],coverage_targets=[160,240,400],target_derivation='4 core gap bins have minimum frequency12/60; expected bands minimum9/60; matched-mean mixed-balanced3/60 dominates: quotas8/12/20 divided by .05',warning='Planning approximations; post-selection optimism, unknown ICC, overlapping player clusters; not a power guarantee'))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--baseline',type=Path,default=Path(__file__).resolve().parent.parent/'rating-calibration01-a');p.add_argument('--output',type=Path);args=p.parse_args();text=json.dumps(analyze(args.baseline),indent=2)+'\n'
 if args.output:args.output.write_text(text,encoding='utf8')
 else:print(text)
