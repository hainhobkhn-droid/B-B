// Python json.loads / ensure_ascii=False canonical compatibility, including 1.0 and -0.0.
export class PyFloat{
 readonly value:number;
 constructor(value:number){if(!Number.isFinite(value))throw Error('NONFINITE_JSON');this.value=value;}
 valueOf():number{return this.value;}
 toString():string{return floatRepr(this.value);}
}
export function floatRepr(value:number):string{
 if(!Number.isFinite(value))throw Error('NONFINITE_JSON');
 if(Object.is(value,-0))return '-0.0';
 const a=Math.abs(value);
 if(a!==0&&(a<1e-4||a>=1e16)){
  const [m,e]=value.toExponential().split('e'),n=Number(e);
  return m+'e'+(n<0?'-':'+')+String(Math.abs(n)).padStart(2,'0');
 }
 const s=String(value);return Number.isInteger(value)?s+'.0':s;
}
function stringJSON(s:string):string{
 for(let i=0;i<s.length;i++){
  const c=s.charCodeAt(i);
  if(c>=0xd800&&c<=0xdbff){const d=s.charCodeAt(++i);if(!(d>=0xdc00&&d<=0xdfff))throw Error('INVALID_UNICODE');}
  else if(c>=0xdc00&&c<=0xdfff)throw Error('INVALID_UNICODE');
 }
 return JSON.stringify(s);
}
export function codepointOrder(a:string,b:string):number{
 const x=Array.from(a),y=Array.from(b);
 for(let i=0;i<Math.min(x.length,y.length);i++){const d=x[i].codePointAt(0)!-y[i].codePointAt(0)!;if(d)return d;}
 return x.length-y.length;
}
export function canonical(x:unknown):string{
 if(x===null)return 'null';if(x instanceof PyFloat)return x.toString();
 if(typeof x==='string')return stringJSON(x);if(typeof x==='boolean')return x?'true':'false';
 if(typeof x==='bigint')return String(x);
 if(typeof x==='number'){if(!Number.isFinite(x))throw Error('NONFINITE_JSON');return Number.isInteger(x)?String(x):floatRepr(x);}
 if(Array.isArray(x))return '['+x.map(canonical).join(',')+']';
 if(x&&typeof x==='object')return '{'+Object.keys(x).sort(codepointOrder).map(k=>stringJSON(k)+':'+canonical((x as Record<string,unknown>)[k])).join(',')+'}';
 throw Error('NON_JSON_VALUE');
}
export function parsePythonJSON(s:string):unknown{
 let i=0;
 const whitespace=()=>{while(/[\t\n\r ]/.test(s[i]??'!'))i++;};
 function parse():unknown{
  whitespace();const c=s[i];
  if(c==='"'){
   const start=i++;let escape=false;
   while(i<s.length){const ch=s[i++];if(!escape&&ch==='"')return JSON.parse(s.slice(start,i));if(!escape&&ch==='\\')escape=true;else escape=false;}
   throw Error('JSON_STRING');
  }
  if(c==='['){i++;const a:unknown[]=[];whitespace();if(s[i]===']'){i++;return a;}for(;;){a.push(parse());whitespace();if(s[i++]===']')return a;if(s[i-1]!==',')throw Error('JSON_ARRAY');}}
  if(c==='{'){
   i++;const o=Object.create(null) as Record<string,unknown>;whitespace();if(s[i]==='}'){i++;return o;}
   for(;;){whitespace();if(s[i]!=='"')throw Error('JSON_KEY');const k=parse();if(typeof k!=='string')throw Error('JSON_KEY');whitespace();if(s[i++]!==':')throw Error('JSON_OBJECT');o[k]=parse();whitespace();if(s[i++]==='}')return o;if(s[i-1]!==',')throw Error('JSON_OBJECT');}
  }
  for(const [word,v] of [['true',true],['false',false],['null',null]] as const)if(s.startsWith(word,i)){i+=word.length;return v;}
  const m=/-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(s.slice(i));
  if(!m||m.index!==0)throw Error('JSON_VALUE');i+=m[0].length;
  if(/[.eE]/.test(m[0]))return new PyFloat(Number(m[0]));
  const n=BigInt(m[0]);return n<=BigInt(Number.MAX_SAFE_INTEGER)&&n>=BigInt(Number.MIN_SAFE_INTEGER)?Number(n):n;
 }
 const result=parse();whitespace();if(i!==s.length)throw Error('JSON_TRAILING');return result;
}
export async function sha256(text:string|Uint8Array):Promise<string>{
 const bytes=typeof text==='string'?new TextEncoder().encode(text):text;
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes)))).map(x=>x.toString(16).padStart(2,'0')).join('');
}
export const digest=(value:unknown)=>sha256(canonical(value));
