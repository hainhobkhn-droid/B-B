from pathlib import Path
import json,csv,statistics as st,math,hashlib,ast
r=Path(__file__).resolve().parent
s=json.loads((r/'results.json').read_text());d=json.loads((r/'dataset.json').read_text())
def read(n):return list(csv.DictReader((r/n).open(encoding='utf8')))
ms=read('historical_matches.csv');es=read('candidate_events.csv');a=[e for e in es if e['model']=='A'];tr=read('player_trajectories.csv')
# Correlation: score-share performance now vs next strictly later-time match for the same participant.
matchmap={m['match_id']:m for m in ms};pairs=[]
for p in d['players']:
 ev=[e for e in a if e['player_id']==p['id']]
 for i,e in enumerate(ev):
  nxt=next((x for x in ev[i+1:] if matchmap[x['match_id']]['played_at']>matchmap[e['match_id']]['played_at']),None)
  if nxt:pairs.append((float(e['performance_gap']),float(nxt['performance_gap'])))
def corr(p):
 if len(p)<3:return None
 x,y=zip(*p);return st.correlation(x,y)
teamgaps=[max(float(m['partner_gap_a']),float(m['partner_gap_b'])) for m in ms]
extra=dict(future_margin_pairs=len(pairs),future_residual_correlation=corr(pairs),large_partner_gap_ge1=sum(x>=1 for x in teamgaps),max_partner_gap=max(teamgaps),repeat_partner_groups=sum(v>1 for v in s['team_pair_repeats'].values()),max_partner_repeats=max(s['team_pair_repeats'].values()),initial_sum=sum(p['initial_rating'] for p in d['players']),max_player_matches=max(int(t['matches']) for t in tr),inactive_players=sum(p['status']=='INACTIVE' for p in d['players']),unplayed_players=sum(int(t['matches'])==0 for t in tr),largest_abs_event=max(abs(float(e['applied_delta'])) for e in a),recent_abs_delta=st.mean(abs(float(e['applied_delta'])) for e in a if int(e['prior_matches'])>=10),new_abs_delta=st.mean(abs(float(e['applied_delta'])) for e in a if int(e['prior_matches'])<5))
(r/'supplemental.json').write_text(json.dumps(extra,indent=2)+'\n',encoding='utf8');print(json.dumps(extra,indent=2))
for c in s['summary']:print(c['model'], 'train',round(c['train_share_mse'],6),'hold',round(c['holdout_share_mse'],6),'online',round(c['online_share_mse'],6),'drift',round(c['drift'],4))
