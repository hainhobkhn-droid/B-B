import json,csv,math,statistics as st
from pathlib import Path
from decimal import Decimal as D, localcontext, ROUND_HALF_UP
from collections import Counter,defaultdict
root=Path(__file__).resolve().parent
d=json.loads((root/'dataset.json').read_text()); cfg=next(s for s in d['settings'] if s['is_active']);version=cfg['algorithm_version']
assert d['function_hashes']['_rebuild_ratings_internal']=='b3b434e407c1828bbb6dbf2907148104', 'ENGINE_SOURCE_DRIFT'
assert len(d['matches'])==60 and len(d['events'])==240 and len(d['players'])==25, 'DATASET_BASELINE_DRIFT'
assert d['adjustments']==0, 'ADJUSTMENT_REPLAY_NOT_IMPLEMENTED'
players={p['id']:p for p in d['players']}; aliases={p:f'P{i:02d}' for i,p in enumerate(sorted(players),1)}
weights={w['match_type']:D(str(w['weight'])) for w in d['weights']};matches=d['matches'];lineups=defaultdict(list)
for l in d['lineups']:lineups[l['match_id']].append(l)
source={(e['match_id'],e['player_id']):e for e in d['events'] if e['algorithm_version']==version}
def dec(x):return D(str(x))
def q(x,n=3):return x.quantize(D(10)**-n,rounding=ROUND_HALF_UP)
def write(name,rows):
 if not rows:return
 with (root/name).open('w',newline='',encoding='utf8') as f:
  w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
def replay(model,subset=None):
 ms=matches if subset is None else subset
 ratings={p:dec(v['initial_rating']) for p,v in players.items()};counts=Counter();events=[];mr=[];latest=max(m['played_date'] for m in ms) if ms else None
 from datetime import date
 for ix,m in enumerate(ms):
  ls=lineups[m['id']];teams={t:[l['player_id'] for l in ls if l['team']==t] for t in 'AB'}
  avg={t:sum(ratings[p] for p in ps)/2 for t,ps in teams.items()}
  age=(date.fromisoformat(latest)-date.fromisoformat(m['played_date'])).days
  rec=max(dec(cfg['recency_floor']),dec('.5')**(D(age)/dec(cfg['recency_half_life_days'])))
  sa,sb=dec(m['team_a_score']),dec(m['team_b_score']); actual=sa/(sa+sb) if m['score_mode']=='POINTS' else D(1) if sa>sb else D(0) if sa<sb else D('.5')
  ex=D(1)/(D(1)+((avg['B']-avg['A'])/dec(model['s'])).exp())
  mr.append(dict(model=model['name'],match_id=m['id'],order=ix+1,played_at=m['played_at'],score_mode=m['score_mode'],team_a_ids=','.join(teams['A']),team_b_ids=','.join(teams['B']),team_a_before=','.join(str(ratings[p]) for p in teams['A']),team_b_before=','.join(str(ratings[p]) for p in teams['B']),team_a_prior=','.join(str(counts[p]) for p in teams['A']),team_b_prior=','.join(str(counts[p]) for p in teams['B']),score_a=float(sa),score_b=float(sb),gap=float(avg['A']-avg['B']),expected=float(ex),actual=float(actual),win=float(sa>sb) if sa!=sb else .5,partner_gap_a=float(abs(ratings[teams['A'][0]]-ratings[teams['A'][1]])),partner_gap_b=float(abs(ratings[teams['B'][0]]-ratings[teams['B'][1]]))))
  updates={}
  for l in ls:
   p,t=l['player_id'],l['team'];e=ex if t=='A' else D(1)-ex;a=actual if t=='A' else D(1)-actual
   mult=dec(model['provisional']) if counts[p]<model['n'] else dec('1.10') if counts[p]<10 else D(1)
   gap=a-e;raw=gap*dec(model['k'])*weights[m['match_type']]*rec*mult;delta=max(dec('-.35'),min(dec('.35'),raw));after=max(D(2),min(D(8),ratings[p]+delta))
   row=dict(model=model['name'],match_id=m['id'],player_id=p,alias=aliases[p],team=t,prior_matches=counts[p],rating_before=float(ratings[p]),team_rating=float(q(avg[t])),opponent_team_rating=float(q(avg['B' if t=='A' else 'A'])),expected_share=float(q(e,5)),actual_share=float(q(a,5)),performance_gap=float(q(gap,5)),match_weight=float(q(weights[m['match_type']])),recency_weight=float(q(rec)),provisional_factor=float(q(mult)),rating_delta=float(q(delta,5)),rating_after=float(q(after)),applied_delta=float(q(after)-ratings[p]),rounding_drift=float(q(after)-after))
   events.append(row);updates[p]=q(after);counts[p]+=1
  ratings.update(updates)
  mr[-1].update(team_a_after=','.join(str(ratings[p]) for p in teams['A']),team_b_after=','.join(str(ratings[p]) for p in teams['B']))
 return ratings,events,mr
models=[dict(name='A',k=.55,s=.9,provisional=1.25,n=5)]
models += [dict(models[0],name=f'B_K{k}',k=k) for k in [.35,.75]]
models += [dict(models[0],name=f'C_P{p}_N{n}',provisional=p,n=n) for p,n in [(1.5,5),(1.5,10),(2,5)]]
models += [dict(models[0],name=f'D_S{s}',s=s) for s in [.6,1.2]]
ratings,events,mr=replay(models[0]);mismatch=[]
fields=['rating_before','team_rating','opponent_team_rating','expected_share','actual_share','performance_gap','match_weight','recency_weight','provisional_factor','rating_delta','rating_after']
for e in events:
 orig=source.get((e['match_id'],e['player_id']))
 for f in fields:
  if orig is None or dec(e[f])!=dec(orig[f]):mismatch.append(dict(match=e['match_id'],player=e['player_id'],field=f,sim=e[f],source=None if orig is None else orig[f]))
for p,r in ratings.items():
 if r!=dec(players[p]['current_rating']):mismatch.append(dict(player=p,field='projection',sim=float(r),source=players[p]['current_rating']))
(root/'control-validation.json').write_text(json.dumps({'mismatches':mismatch,'fields_compared':len(events)*len(fields)+len(players)},indent=2)+'\n')
if mismatch:print(json.dumps(mismatch[:10]));raise SystemExit('SIMULATION INVALID - CONTROL REPLAY MISMATCH')
assert len(source)==240 and len(source)==len(d['events']) and len(events)==240 and d['adjustments']==0
assert len({(e['match_id'],e['player_id']) for e in d['events']})==240
for m in matches:
 ls=lineups[m['id']];assert Counter(l['team'] for l in ls)=={'A':2,'B':2};assert len({l['player_id'] for l in ls})==4;assert m['team_a_score']>=0 and m['team_b_score']>=0
assert all(math.isfinite(e[f]) for e in events for f in fields)
def metrics(ms):
 n=len(ms);return dict(n=n,share_mse=st.mean((m['expected']-m['actual'])**2 for m in ms),win_brier_proxy=st.mean((m['expected']-m['win'])**2 for m in ms),win_logloss_proxy=st.mean(-m['win']*math.log(max(1e-12,m['expected']))-(1-m['win'])*math.log(max(1e-12,1-m['expected'])) for m in ms),favorite_accuracy=st.mean(float((m['expected']>.5)==(m['win']>.5)) for m in ms if m['expected']!=.5 and m['win']!=.5) if any(m['expected']!=.5 and m['win']!=.5 for m in ms) else None)
all_events=[];finals=[];summaries=[];online_rows=[]
# Prequential predictions rebuild ONLY prior matches. Current match date is not used to discount the past before prediction.
for model in models:
 rs,es,ms=replay(model);all_events+=es
 online=[]
 for i,m in enumerate(matches):
  prior,_,_=replay(model,matches[:i]);teams={t:[l['player_id'] for l in lineups[m['id']] if l['team']==t] for t in 'AB'};avg={t:sum(prior[p] for p in ps)/2 for t,ps in teams.items()};ex=float(D(1)/(D(1)+((avg['B']-avg['A'])/dec(model['s'])).exp()));row=dict(model=model['name'],match_id=m['id'],order=i+1,played_at=m['played_at'],expected=ex,actual=ms[i]['actual'],win=ms[i]['win'],gap=float(avg['A']-avg['B']),team_a_before=','.join(str(prior[p]) for p in teams['A']),team_b_before=','.join(str(prior[p]) for p in teams['B']));online.append(row)
 online_rows+=online
 vals=list(map(float,rs.values()));summaries.append(dict(model=model['name'],k=model['k'],s=model['s'],provisional=model['provisional'],n_provisional=model['n'],**{'full_'+k:v for k,v in metrics(ms).items()},**{'online_'+k:v for k,v in metrics(online).items()},**{'train_'+k:v for k,v in metrics(online[:41]).items()},**{'holdout_'+k:v for k,v in metrics(online[41:]).items()},rating_sum=sum(vals),mean=st.mean(vals),sd=st.pstdev(vals),min=min(vals),max=max(vals),drift=sum(vals)-sum(p['initial_rating'] for p in players.values()),mean_abs_delta=st.mean(abs(e['applied_delta']) for e in es),rounding_drift=sum(e['rounding_drift'] for e in es),nonzero_pool_matches=sum(abs(sum(e['applied_delta'] for e in es if e['match_id']==m['id']))>1e-9 for m in matches),max_match_pool_drift=max(abs(sum(e['applied_delta'] for e in es if e['match_id']==m['id'])) for m in matches),established_mean_abs_delta=st.mean(abs(e['applied_delta']) for e in es if e['prior_matches']>=10),new_mean_abs_delta=st.mean(abs(e['applied_delta']) for e in es if e['prior_matches']<5)))
 finals += [dict(model=model['name'],player_id=p,alias=aliases[p],rating=float(r)) for p,r in rs.items()]
write('historical_matches.csv',mr);write('candidate_events.csv',all_events);write('candidate_summary.csv',summaries);write('candidate_player_ratings.csv',finals);write('prequential_predictions.csv',online_rows)
trajectories=[]
for p,v in players.items():
 es=[e for e in events if e['player_id']==p];ds=[e['applied_delta'] for e in es];path=[v['initial_rating']]+[e['rating_after'] for e in es];wins=sum(next(m for m in mr if m['match_id']==e['match_id'])['win']==(1 if e['team']=='A' else 0) for e in es)
 trajectories.append(dict(player_id=p,alias=aliases[p],initial=v['initial_rating'],current=v['current_rating'],matches=len(es),wins=wins,losses=sum(next(m for m in mr if m['match_id']==e['match_id'])['win']==(0 if e['team']=='A' else 1) for e in es),draws=sum(next(m for m in mr if m['match_id']==e['match_id'])['win']==.5 for e in es),mean_abs_delta=st.mean(map(abs,ds)) if ds else 0,max_gain=max(ds,default=0),max_loss=min(ds,default=0),delta_sd=st.pstdev(ds) if ds else 0,last5=sum(ds[-5:]),last10=sum(ds[-10:]),range=max(path)-min(path),sign_changes=sum(a*b<0 for a,b in zip(ds,ds[1:])),experience='0-5' if len(es)<=5 else '6-10' if len(es)<=10 else '11-20' if len(es)<=20 else '21+'))
write('player_trajectories.csv',trajectories)
vals=sorted(v['current_rating'] for v in players.values())
def pct(p):
 x=(len(vals)-1)*p;i=int(x);return vals[i]+(vals[min(i+1,len(vals)-1)]-vals[i])*(x-i)
dist=dict(min=min(vals),max=max(vals),mean=st.mean(vals),median=st.median(vals),sd=st.pstdev(vals),p10=pct(.1),p25=pct(.25),p75=pct(.75),p90=pct(.9),near_initial_01=sum(abs(v['current_rating']-v['initial_rating'])<=.1 for v in players.values()),buckets=dict(Counter(f'{math.floor(x*2)/2:.1f}-{math.floor(x*2)/2+.5:.1f}' for x in vals)),experience={b:[t['alias'] for t in trajectories if t['experience']==b] for b in ['0-5','6-10','11-20','21+']})
cal=[]
for low,high in [(.5,.55),(.55,.6),(.6,.7),(.7,.8),(.8,1.00001)]:
 subset=[m for m in online_rows[:60] if low<=max(m['expected'],1-m['expected'])<high];subset=[m for m in subset if m['expected']!=.5 and m['win']!=.5];n=len(subset);correct=sum((m['expected']>.5)==(m['win']>.5) for m in subset)
 cal.append(dict(low=low,high=high,n=n,mean_expected=st.mean(max(m['expected'],1-m['expected']) for m in subset) if n else None,favorite_wins=correct,rate=correct/n if n else None))
write('calibration_buckets.csv',cal)
gaps=[]
for lo,hi in [(0,.25),(.25,.5),(.5,1),(1,2),(2,6.01)]:
 sub=[m for m in mr if lo<=abs(m['gap'])<hi];ids={m['match_id'] for m in sub};ee=[e for e in events if e['match_id'] in ids];gaps.append(dict(lo=lo,hi=hi,n=len(sub),mean_expected=st.mean(max(m['expected'],1-m['expected']) for m in sub) if sub else None,favorite_win_rate=st.mean((m['gap']>0)==(m['win']>.5) for m in sub if m['gap']!=0) if any(m['gap']!=0 for m in sub) else None,mean_abs_delta=st.mean(abs(e['applied_delta']) for e in ee) if ee else None))
write('gap_buckets.csv',gaps)
# Synthetic one-match and repeated-match experiments, truth only defined for seeded-newcomer scenarios.
syn=[]
scenarios=[('equal',[4,4,4,4],11,7,20),('strong_weak',[6,6,3,3],11,7,20),('major_upset',[6,6,3,3],7,11,20),('balanced_mixed',[6,2,4,4],11,7,20),('overrated_new',[6,4,4,4],4,11,20),('underrated_new',[2,4,4,4],11,4,20),('established_provisional',[4,4,4,4],11,7,20),('repeated_favorite_wins',[5,5,3,3],11,9,20),('repeated_underdog_wins',[3,3,5,5],11,9,20),('repeated_rematches',[4,4,4,4],11,7,20)]
for model in models:
 for name,start,sa,sb,n in scenarios:
  rr=list(map(dec,start));initial=sum(rr);count=[20]*4 if name=='established_provisional' else [0]*4
  if name=='established_provisional':count[0]=0
  for j in range(n):
   av=[sum(rr[:2])/2,sum(rr[2:])/2];ex=D(1)/(1+((av[1]-av[0])/dec(model['s'])).exp());updates=[]
   for i in range(4):
    a=dec(sa)/(sa+sb) if i<2 else dec(sb)/(sa+sb);e=ex if i<2 else 1-ex;mult=dec(model['provisional']) if count[i]<model['n'] else dec('1.10') if count[i]<10 else D(1);delta=max(dec('-.35'),min(dec('.35'),(a-e)*dec(model['k'])*dec('.9')*mult));updates.append(q(max(D(2),min(D(8),rr[i]+delta))));count[i]+=1
   rr=updates
   if j in [0,4,9,19]:syn.append(dict(model=model['name'],scenario=name,match=j+1,p1=float(rr[0]),p2=float(rr[1]),p3=float(rr[2]),p4=float(rr[3]),pool_drift=float(sum(rr)-initial)))
write('synthetic_scenarios.csv',syn)
summary=dict(control_mismatches=0,projection_mismatch=0,distribution=dist,summary=summaries,calibration=cal,dates=dict(Counter(m['played_date'] for m in matches)),score_modes=dict(Counter(m['score_mode'] for m in matches)),match_types=dict(Counter(m['match_type'] for m in matches)),ties=sum(m['win']==.5 for m in mr),team_pair_repeats=dict(Counter(','.join(sorted(l['player_id'] for l in lineups[m['id']] if l['team']==t)) for m in matches for t in 'AB')),historical_metrics=metrics(mr),best_training=min(summaries,key=lambda s:s['train_share_mse'])['model'])
(root/'results.json').write_text(json.dumps(summary,indent=2)+'\n',encoding='utf8')
print(json.dumps({k:v for k,v in summary.items() if k not in ['summary','team_pair_repeats']},indent=2));print('SIMULATION PASS: control exact; eight models; chronological prequential evaluation')
