// Native port of the frozen prepare call graph; no Python, filesystem, network or mutable global state.
import {PyDecimal as D,dec,min,max,sum} from './decimal.ts';
import {PyFloat,canonical,parsePythonJSON,digest,sha256,codepointOrder} from './python-json.ts';
import {stamp,iso,utcDay,dayIndex} from './time.ts';
type R=Record<string,unknown>;
export interface Context{identity:R;frozen:R;baseline:R;config:R;reference_worker_sha256:string;reference_source_sha256:string;}
export function object(x:unknown):R{if(!x||typeof x!=='object'||Array.isArray(x)||x instanceof PyFloat)throw Error('OBJECT_REQUIRED');return x as R;}
const rows=(x:R,k:string):R[]=>{if(!Array.isArray(x[k]))throw Error('ARRAY_REQUIRED:'+k);return (x[k] as unknown[]).map(object);};
const text=(x:unknown):string=>{if(typeof x!=='string')throw Error('STRING_REQUIRED');return x;};
const number=(x:unknown):number=>{const n=x instanceof PyFloat?x.value:typeof x==='bigint'?Number(x):x;if(typeof n!=='number'||!Number.isFinite(n))throw Error('NUMBER_REQUIRED');return n;};
const pyString=(x:unknown):string=>x instanceof PyFloat?x.toString():typeof x==='string'?x:String(x);
const eq=(a:unknown,b:unknown):boolean=>{
 if(a===b)return true;
 const numeric=(x:unknown)=>x instanceof PyFloat||typeof x==='number'||typeof x==='bigint';
 if(numeric(a)&&numeric(b))return dec(pyString(a)).cmp(dec(pyString(b)))===0;
 if(Array.isArray(a)&&Array.isArray(b))return a.length===b.length&&a.every((v,i)=>eq(v,b[i]));
 if(a&&b&&typeof a==='object'&&typeof b==='object'){
  const x=object(a),y=object(b),ks=Object.keys(x);return ks.length===Object.keys(y).length&&ks.every(k=>Object.hasOwn(y,k)&&eq(x[k],y[k]));
 }return false;
};
const teams=['A','B'];
const whitelist:Record<string,string>={
 players:'id initial_rating current_rating status player_type',matches:'id played_at played_date match_number match_type score_mode team_a_score team_b_score',lineups:'match_id player_id team',
 events:'id match_id player_id algorithm_version rating_before team_rating opponent_team_rating expected_share actual_share performance_gap match_weight recency_weight provisional_factor rating_delta rating_after',
 adjustments:'id player_id amount effective_at created_at replay_order correction_of_adjustment_id request_algorithm_version',adjustment_events:'id adjustment_id player_id algorithm_version rating_before requested_amount applied_delta rating_after',
 settings:'id algorithm_version created_at expected_sensitivity initial_rating is_active k_factor max_rating min_rating provisional_matches rating_delta_cap recency_floor recency_half_life_days stable_matches',weights:'match_type weight',column_types:'table column type'
};
export function safeSource(input:R):R{
 const allowed=new Set([...Object.keys(whitelist),'captured_at','timezone','function_hashes']);
 if(Object.keys(input).some(k=>!allowed.has(k)))throw Error('UNEXPECTED_SOURCE_FIELDS');
 const functions=object(input.function_hashes??{});
 if(Object.keys(functions).some(k=>!['_rebuild_ratings_internal','_approve_match_internal','_get_active_rating_version'].includes(k)))throw Error('UNEXPECTED_FUNCTION_METADATA');
 const result:R={};
 for(const [key,v] of Object.entries(input)){
  if(!Object.hasOwn(whitelist,key)){result[key]=v;continue;}
  const fields=new Set(whitelist[key].split(' '));
  result[key]=rows(input,key).map(row=>{
   const extras=Object.keys(row).filter(k=>!fields.has(k));if(extras.length&&!(key==='weights'&&extras.length===1&&extras[0]==='description'))throw Error('UNEXPECTED_ANALYTICAL_FIELDS:'+key);
   return Object.fromEntries(Object.entries(row).filter(([k])=>fields.has(k)));
  });
 }return result;
}
function timelineKey(kind:string,row:R):(string|number|boolean|bigint)[]{
 return kind==='MATCH'?[stamp(row.played_at),1,row.match_number===null,row.match_number===null?0:number(row.match_number),0,text(row.id)]:[stamp(row.effective_at),2,true,0,number(row.replay_order),text(row.id)];
}
function keyCompare(a:(string|number|boolean|bigint)[],b:(string|number|boolean|bigint)[]):number{
 for(let i=0;i<a.length;i++){if(a[i]===b[i])continue;if(typeof a[i]==='string')return codepointOrder(String(a[i]),String(b[i]));return a[i]<b[i]?-1:1;}return 0;
}
function timeline(data:R):{kind:string;row:R}[]{
 return [...rows(data,'matches').map(row=>({kind:'MATCH',row})),...rows(data,'adjustments').map(row=>({kind:'ADJUSTMENT',row}))].sort((a,b)=>keyCompare(timelineKey(a.kind,a.row),timelineKey(b.kind,b.row)));
}
interface Replay{ratings:Map<string,D>;events:R[];adjustment_events:R[];interventions:unknown[][];}
export function replay(data:R,frozen:R,model='A'):Replay{
 const cfg=object(frozen.common_parameters),candidate=object(object(frozen.candidates)[model]);
 const ratings=new Map(rows(data,'players').map(p=>[text(p.id),dec(p.initial_rating)])),counts=new Map<string,number>();
 const lineups=rows(data,'lineups'),matches=rows(data,'matches'),events:R[]=[],adjustments:R[]=[],interventions:unknown[][]=[];
 const latest=matches.length?Math.max(...matches.map(m=>dayIndex(m.played_date))):null;
 const lower=dec(cfg.min_rating),upper=dec(cfg.max_rating);
 for(const {kind,row} of timeline(data)){
  if(kind==='ADJUSTMENT'){
   const player=text(row.player_id),before=ratings.get(player);if(!before)throw Error('UNKNOWN_ADJUSTMENT_PLAYER');
   const amount=dec(row.amount),after=max(lower,min(upper,before.add(amount)));
   adjustments.push({adjustment_id:row.id,player_id:player,rating_before:before,requested_amount:amount,applied_delta:after.sub(before),rating_after:after});
   ratings.set(player,after.quant(number(cfg.rating_scale)));
   interventions.push([row.id,player,row.effective_at,row.replay_order,String(amount)]);continue;
  }
  const roster=Object.fromEntries(teams.map(t=>[t,lineups.filter(l=>l.match_id===row.id&&l.team===t).map(l=>text(l.player_id)).sort(codepointOrder)]));
  const means=Object.fromEntries(teams.map(t=>[t,sum(roster[t].map(id=>{const r=ratings.get(id);if(!r)throw Error('UNKNOWN_PARTICIPANT');return r;})).div(dec('2'))]));
  const expected=dec('1').div(dec('1').add(means.B.sub(means.A).div(dec(candidate.expected_sensitivity)).exp()));
  const sa=dec(row.team_a_score),sb=dec(row.team_b_score);
  const actual=row.score_mode==='POINTS'?sa.div(sa.add(sb)):dec(sa.cmp(sb)>0?'1':sa.cmp(sb)<0?'0':'0.5');
  const age=latest!-dayIndex(row.played_date),recency=max(dec(cfg.recency_floor),dec('.5').pow(dec(String(age)).div(dec(cfg.recency_half_life_days))));
  const updates=new Map<string,D>();
  for(const team of teams)for(const p of roster[team]){
   const before=ratings.get(p)!,exp=team==='A'?expected:dec('1').sub(expected),act=team==='A'?actual:dec('1').sub(actual),count=counts.get(p)??0;
   const mult=dec(count<number(cfg.provisional_matches)?cfg.provisional_factor:count<number(cfg.stable_matches)?cfg.transition_factor:cfg.established_factor);
   const weight=dec(object(cfg.match_weights)[text(row.match_type)]),gap=act.sub(exp);
   let delta=gap.mul(dec(cfg.k_factor)).mul(weight).mul(recency).mul(mult);
   const cap=dec(cfg.rating_delta_cap);delta=max(dec('-1').mul(cap),min(cap,delta));
   const after=max(lower,min(upper,before.add(delta))).quant(number(cfg.rating_scale));
   events.push({match_id:row.id,player_id:p,rating_before:before,team_rating:means[team].quant(3),opponent_team_rating:means[team==='A'?'B':'A'].quant(3),expected_share:exp.quant(5),actual_share:act.quant(5),performance_gap:gap.quant(5),match_weight:weight.quant(3),recency_weight:recency.quant(3),provisional_factor:mult.quant(3),rating_delta:delta.quant(5),rating_after:after});
   updates.set(p,after);counts.set(p,count+1);
  }
  for(const [p,r] of updates)ratings.set(p,r);
 }
 return {ratings,events,adjustment_events:adjustments,interventions};
}
function validateInputs(data:R,frozen:R,baseline:R):string[]{
 const errors:string[]=[],settings=rows(data,'settings').filter(s=>s.is_active===true),cfg=object(frozen.common_parameters);
 if(object(data.function_hashes)._rebuild_ratings_internal!==frozen.production_definition_md5)errors.push('ENGINE_SOURCE_DRIFT');
 if(settings.length!==1)return [...errors,'ACTIVE_SETTINGS_INVALID'];
 const active=settings[0];
 for(const k of ['initial_rating','min_rating','max_rating','k_factor','provisional_matches','stable_matches','recency_half_life_days','recency_floor','rating_delta_cap'])if(dec(active[k]).cmp(dec(cfg[k]))!==0)errors.push('SETTINGS_DRIFT:'+k);
 if(dec(active.expected_sensitivity).cmp(dec(object(object(frozen.candidates).A).expected_sensitivity))!==0)errors.push('CONTROL_DRIFT');
 if(!eq(Object.fromEntries(rows(data,'weights').map(w=>[text(w.match_type),w.weight])),cfg.match_weights))errors.push('WEIGHT_DRIFT');
 const playerRows=rows(data,'players'),players=new Map(playerRows.map(p=>[text(p.id),p]));if(players.size!==playerRows.length)errors.push('DUPLICATE_PLAYER');
 for(const p of players.values())for(const k of ['initial_rating','current_rating'])if(dec(p[k]).cmp(dec(cfg.min_rating))<0||dec(p[k]).cmp(dec(cfg.max_rating))>0)errors.push('PLAYER_RANGE');
 for(const p of rows(baseline,'players'))if(!players.has(text(p.id))||dec(players.get(text(p.id))!.initial_rating).cmp(dec(p.initial_rating))!==0)errors.push('FROZEN_SEED_DRIFT');
 const matchRows=rows(data,'matches'),matches=new Map(matchRows.map(m=>[text(m.id),m]));if(matches.size!==matchRows.length)errors.push('DUPLICATE_MATCH');
 for(const m of rows(baseline,'matches'))if(!eq(matches.get(text(m.id)),m))errors.push('BASELINE_MATCH_DRIFT');
 const cutoff=stamp(frozen.frozen_at),captured=stamp(data.captured_at),seen=new Set(),orders=new Set(),adjustments=new Map(rows(data,'adjustments').map(a=>[text(a.id),a]));
 for(const a of rows(data,'adjustments')){
  if(seen.has(a.id)||orders.has(canonical(a.replay_order)))errors.push('DUPLICATE_ADJUSTMENT_OR_ORDER');seen.add(a.id);orders.add(canonical(a.replay_order));
  if(stamp(a.effective_at)<=cutoff||stamp(a.created_at)<=cutoff)errors.push('PRE_CUTOFF_ADJUSTMENT_BASELINE_INCONSISTENCY');
  if(stamp(a.created_at)>captured||stamp(a.effective_at)>captured)errors.push('FUTURE_ADJUSTMENT');
  if(!players.has(text(a.player_id))||typeof a.replay_order!=='number'||!Number.isInteger(a.replay_order)||a.replay_order<=0||dec(a.amount).cmp(dec('0'))===0)errors.push('MALFORMED_ADJUSTMENT');
  if(a.request_algorithm_version!==null&&a.request_algorithm_version!==active.algorithm_version)errors.push('UNSUPPORTED_ADJUSTMENT_VERSION');
  if(a.correction_of_adjustment_id){const old=adjustments.get(text(a.correction_of_adjustment_id));if(!old||old.player_id!==a.player_id||old.effective_at!==a.effective_at||dec(old.amount).cmp(dec(a.amount).mul(dec('-1')))!==0||number(old.replay_order)>=number(a.replay_order))errors.push('MALFORMED_CORRECTION');}
 }
 const lineups=rows(data,'lineups');for(const l of lineups)if(!players.has(text(l.player_id))||!matches.has(text(l.match_id)))errors.push('ORPHAN_LINEUP');
 for(const m of matchRows){
  if(stamp(m.played_at)>captured)errors.push('FUTURE_MATCH');
  const ls=lineups.filter(l=>l.match_id===m.id);
  if(ls.length!==4||ls.filter(l=>l.team==='A').length!==2||ls.filter(l=>l.team==='B').length!==2||new Set(ls.map(l=>l.player_id)).size!==4)errors.push('LINEUP_CARDINALITY');
  const sa=m.team_a_score,sb=m.team_b_score;
  if(typeof sa!=='number'||!Number.isInteger(sa)||typeof sb!=='number'||!Number.isInteger(sb)||Math.min(sa,sb)<0||!['POINTS','RESULT'].includes(text(m.score_mode))||(m.score_mode==='POINTS'&&sa+sb===0))errors.push('MATCH_RESULT_INVALID');
 }
 const ids=new Set(frozen.baseline_match_ids as string[]);
 const baselineLineups=(x:R)=>rows(x,'lineups').filter(l=>ids.has(text(l.match_id))).map(l=>[l.match_id,l.team,l.player_id]).sort((a,b)=>codepointOrder(canonical(a),canonical(b)));
 if(!eq(baselineLineups(data),baselineLineups(baseline)))errors.push('BASELINE_LINEUP_DRIFT');
 return [...new Set(errors)].sort(codepointOrder);
}
function compareControl(result:Replay,data:R):string[]{
 const errors:string[]=[],active=rows(data,'settings').find(s=>s.is_active===true)!.algorithm_version;
 for(const [collection,key] of [['events','match_id'],['adjustment_events','adjustment_id']]){
  const source=rows(data,collection).filter(e=>e.algorithm_version===active),map=new Map(source.map(e=>[canonical([e[key],e.player_id]),e]));
  if(map.size!==source.length)errors.push('DUPLICATE_'+collection);
  const generated=collection==='events'?result.events:result.adjustment_events,expected=new Set(generated.map(e=>canonical([e[key],e.player_id])));
  if(expected.size!==map.size||[...expected].some(k=>!map.has(k)))errors.push('ORPHAN_OR_CARDINALITY_'+collection);
  for(const e of generated){const original=map.get(canonical([e[key],e.player_id]))??{};for(const [field,value] of Object.entries(e))if(field!==key&&field!=='player_id'&&(!Object.hasOwn(original,field)||dec(original[field]).cmp(value as D)!==0))errors.push('REPLAY_MISMATCH:'+collection+':'+text(e[key])+':'+field);}
 }
 for(const p of rows(data,'players'))if(result.ratings.get(text(p.id))!.cmp(dec(p.current_rating))!==0)errors.push('PROJECTION_MISMATCH:'+text(p.id));
 return [...new Set(errors)].sort(codepointOrder);
}
export async function compute(boundary:R,context:Context):Promise<R>{
 const required=['boundary_id','intent_id','roster','captured_at','source_text','source_hash','baseline_context'];
 if(!eq(boundary.baseline_context,context.identity))throw Error('BOUNDARY_BASELINE_MISMATCH');
 if(!eq(Object.keys(boundary).sort(),required.sort()))throw Error('BOUNDARY_FIELDS_INVALID');
 if(await sha256(text(boundary.source_text))!==boundary.source_hash)throw Error('BOUNDARY_HASH_MISMATCH');
 const source=object(parsePythonJSON(text(boundary.source_text)));if(source.captured_at!==boundary.captured_at)throw Error('CAPTURE_TIME_MISMATCH');
 const f=context.frozen,cfg=context.config,roster=object(boundary.roster),captured=stamp(boundary.captured_at),played=captured+1n;
 if(!eq(object(object(f.candidates).A).expected_sensitivity,new PyFloat(.9))||!eq(object(object(f.candidates)['D_S1.2']).expected_sensitivity,new PyFloat(1.2))||!f.no_retuning)throw Error('FROZEN_MODEL_CONFIG_DRIFT');
 if((f.baseline_match_ids as string[]).includes(text(boundary.intent_id))||played<=stamp(f.frozen_at))throw Error('HISTORICAL_PRE_CUTOFF_MATCH');
 if(!eq(Object.keys(roster).sort(),teams)||teams.some(t=>!Array.isArray(roster[t])||(roster[t] as unknown[]).length!==2)||new Set(teams.flatMap(t=>roster[t] as unknown[])).size!==4)throw Error('INCOMPLETE_PARTICIPANTS');
 const data=safeSource(source);if(captured<stamp(f.frozen_at)||captured>=played)throw Error('FORECAST BLOCKED — ORDER AMBIGUOUS');
 const validation=validateInputs(data,f,context.baseline);if(validation.length)throw Error('PRE_SEAL_QUALITY:'+validation.join(','));
 const a=replay(data,f,'A'),comparison=compareControl(a,data);if(comparison.length)throw Error('PRE_SEAL_QUALITY:'+comparison.join(','));
 if(rows(data,'matches').some(m=>m.id===boundary.intent_id||stamp(m.played_at)>=played))throw Error('FUTURE_OR_TARGET_RESULT_IN_SOURCE');
 if(rows(data,'adjustments').some(x=>stamp(x.created_at)>captured||stamp(x.effective_at)>captured))throw Error('INTERVENTION_NOT_AVAILABLE_AT_SEAL');
 const members=teams.flatMap(t=>(roster[t] as unknown[]).map(text));if(members.some(p=>!rows(data,'players').some(x=>x.id===p)))throw Error('UNKNOWN_PARTICIPANT');
 const d=replay(data,f,'D_S1.2');if(!eq(a.interventions,d.interventions))throw Error('UNEQUAL_INTERVENTIONS');
 const state=(result:Replay)=>Object.fromEntries(members.map(p=>[p,String(result.ratings.get(p))]));const states={A:state(a),D:state(d)},forecasts:R={},metrics:R={};
 for(const [model,key] of [['A','A'],['D','D_S1.2']] as const){
  const means=Object.fromEntries(teams.map(t=>[t,sum((roster[t] as string[]).map(p=>dec(states[model][p]))).div(dec('2'))]));
  forecasts[model]=String(dec('1').div(dec('1').add(means.B.sub(means.A).div(dec(object(object(f.candidates)[key]).expected_sensitivity)).exp())));
  metrics[model]={team_means:Object.fromEntries(teams.map(t=>[t,String(means[t])])),team_gap:String(means.A.sub(means.B).abs()),teammate_gaps:Object.fromEntries(teams.map(t=>{const ids=roster[t] as string[];return [t,String(dec(states[model][ids[0]]).sub(dec(states[model][ids[1]])).abs())];}))};
 }
 const prior=rows(data,'adjustments').filter(x=>members.includes(text(x.player_id))),sequence=timeline(data).map(({kind,row})=>({kind,id:row.id,time:kind==='MATCH'?row.played_at:row.effective_at,order:kind==='MATCH'?row.match_number:row.replay_order}));
 const gap=dec(object(metrics.A).team_gap),teammates=Object.values(object(object(metrics.A).teammate_gaps)).map(dec),edges=cfg.gap_edges as unknown[];
 let bucket:string|undefined;for(let i=0;i<edges.length-1;i++)if(dec(edges[i]).cmp(gap)<=0&&gap.cmp(dec(edges[i+1]))<0){bucket=String(Number(edges[i]))+'-'+String(Number(edges[i+1]));break;}
 if(bucket===undefined)throw Error('OUTSIDE_FROZEN_GAP_BUCKET');
 const comp=object(cfg.composition),balanced=dec(comp.balanced_teammate_gap_max),mixed=dec(comp.mixed_teammate_gap_min),tgMax=teammates.reduce(max),tgMin=teammates.reduce(min);
 const group=tgMax.cmp(balanced)<=0?'balanced-balanced':tgMin.cmp(mixed)>=0?'mixed-mixed':tgMax.cmp(mixed)>=0&&tgMin.cmp(balanced)<=0?'mixed-balanced':'intermediate';
 const asStrings=(result:Replay)=>result.adjustment_events.map(e=>Object.fromEntries(Object.entries(e).map(([k,v])=>[k,String(v)])));
 let latest:R|null=null;for(const x of sequence)if(!latest||stamp(x.time)>stamp(latest.time))latest=x;
 const computed={seal_version:'B3_LOCAL_1',evidence_class:'B3B_WORKER_OUTPUT_NOT_YET_SEALED',forecast_created_at:data.captured_at,match:{match_type:'CLUB_RATED',score_mode:'POINTS',teams:Object.fromEntries(teams.map(t=>[t,[...(roster[t] as string[])].sort(codepointOrder)]))},target_created_at:boundary.captured_at,baseline_sha256:f.baseline_dataset_sha256,manifest_sha256:context.identity.manifest_sha256,frozen_parameters:f,source_code_sha256:context.reference_source_sha256,source_prefix:data,source_prefix_sha256:await digest(data),pre_ratings:states,forecasts,team_metrics:metrics,coverage:{rating_gap_bucket:bucket,doubles_group:group,matched_mean:group==='mixed-balanced'&&gap.cmp(dec(comp.matched_team_mean_gap_max))<=0},intervention_ledger_sha256:await digest(data.adjustments),requested_interventions:a.interventions,applied_interventions:{A:asStrings(a),D:asStrings(d)},state_through_event_sequence:{count:sequence.length,sha256:await digest(sequence),last:sequence.at(-1)??null},source_max_event_timestamp:latest?.time??null,classification:prior.length?'ADJUSTED_STATE':'CLEAN',order_sensitive:prior.some(x=>utcDay(x.effective_at)===iso(played).slice(0,10)),outcome_absent_at_capture:true,independent_time_attestation:false,projection_reference_at:boundary.captured_at,baseline_context:context.identity,evidence_environment:context.identity.environment};
 return {boundary_id:boundary.boundary_id,intent_id:boundary.intent_id,source_hash:boundary.source_hash,roster:boundary.roster,manifest_sha256:computed.manifest_sha256,worker_sha256:context.reference_worker_sha256,computed};
}
