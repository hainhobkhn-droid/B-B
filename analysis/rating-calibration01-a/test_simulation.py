from pathlib import Path
import ast,json,csv,hashlib,subprocess,sys,tempfile,shutil
r=Path(__file__).resolve().parent
for p in r.glob('*.py'):ast.parse(p.read_text(encoding='utf-8-sig'),filename=p.name)
outputs=['candidate_events.csv','candidate_summary.csv','candidate_player_ratings.csv','prequential_predictions.csv','historical_matches.csv','player_trajectories.csv','synthetic_scenarios.csv','results.json']
before={n:hashlib.sha256((r/n).read_bytes()).hexdigest() for n in outputs}
x=subprocess.run([sys.executable,str(r/'simulate.py')],capture_output=True,text=True,encoding='utf8');assert x.returncode==0,x.stdout+x.stderr
assert before=={n:hashlib.sha256((r/n).read_bytes()).hexdigest() for n in outputs},'NONDETERMINISTIC'
base=json.loads((r/'dataset.json').read_text())
for case in ['stored_event_drift','seed_drift','engine_hash_drift','adjustment_unsupported']:
 data=json.loads(json.dumps(base))
 if case=='stored_event_drift':data['events'][0]['rating_after']+=.001
 if case=='seed_drift':data['players'][0]['initial_rating']+=.1
 if case=='engine_hash_drift':data['function_hashes']['_rebuild_ratings_internal']='drift'
 if case=='adjustment_unsupported':data['adjustments']=1
 with tempfile.TemporaryDirectory(prefix='pick-calibration-negative-',dir=r) as tmp:
  t=Path(tmp);shutil.copy2(r/'simulate.py',t/'simulate.py');(t/'dataset.json').write_text(json.dumps(data),encoding='utf8')
  result=subprocess.run([sys.executable,str(t/'simulate.py')],capture_output=True,text=True,encoding='utf8')
  assert result.returncode!=0,case
  assert not (t/'candidate_summary.csv').exists(),case
 print('PASS negative:',case)
for n,count in [('historical_matches.csv',60),('player_trajectories.csv',25),('candidate_events.csv',1920),('candidate_player_ratings.csv',200),('synthetic_scenarios.csv',320)]:
 rows=list(csv.DictReader((r/n).open(encoding='utf8')));assert len(rows)==count,(n,len(rows))
 if 'match_id' in rows[0]:assert all(row['match_id'] in {m['id'] for m in base['matches']} for row in rows)
for p in r.iterdir():
 if p.is_file() and p.suffix in ['.py','.md','.sql','.json','.csv']:
  raw=p.read_bytes();text=raw.decode('utf-8-sig');assert '\ufffd' not in text,p.name
  assert not raw.startswith(b'\xef\xbb\xbf'),p.name
print('PASS: Python AST, exact control, deterministic artifacts, four negative tests, row counts, match traceability, UTF-8/no BOM/no U+FFFD')
