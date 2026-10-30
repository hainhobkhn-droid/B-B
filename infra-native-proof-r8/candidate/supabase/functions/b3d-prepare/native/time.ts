export function stamp(value:unknown):bigint{
 if(typeof value!=='string')throw Error('TIMEZONE_REQUIRED');
 const m=/^(\d{4})-(\d{2})-(\d{2})[Tt ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
 if(!m)throw Error('TIMEZONE_REQUIRED');
 const [y,mo,d,h,mi,s]=m.slice(1,7).map(Number),ms=Date.UTC(y,mo-1,d,h,mi,s),dt=new Date(ms);
 if(dt.getUTCFullYear()!==y||dt.getUTCMonth()!==mo-1||dt.getUTCDate()!==d||h>23||mi>59||s>59)throw Error('TIMESTAMP_INVALID');
 let offset=0;if(m[8]!=='Z'){const hh=Number(m[8].slice(1,3)),mm=Number(m[8].slice(4));if(hh>23||mm>59)throw Error('TIMESTAMP_INVALID');offset=(hh*60+mm)*(m[8][0]==='-'?-1:1);}
 return BigInt(ms-offset*60000)*1000n+BigInt((m[7]??'').padEnd(6,'0'));
}
export function iso(us:bigint):string{
 let seconds=us/1000000n,micro=us%1000000n;if(micro<0){seconds--;micro+=1000000n;}
 return new Date(Number(seconds)*1000).toISOString().slice(0,19)+(micro?'.'+String(micro).padStart(6,'0'):'')+'+00:00';
}
export function utcDay(value:unknown):string{return iso(stamp(value)).slice(0,10);}
export function dayIndex(value:unknown):number{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error('DATE_INVALID');
 const t=Date.parse(value+'T00:00:00Z');if(!Number.isFinite(t)||new Date(t).toISOString().slice(0,10)!==value)throw Error('DATE_INVALID');return t/86400000;
}
