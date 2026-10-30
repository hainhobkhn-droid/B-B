// Immutable, server-selected context. Never accept a context/path/ref/hash from an HTTP caller.
import {object,type Context} from './engine.ts';
import {parsePythonJSON,sha256} from './python-json.ts';
export async function lockedContext(raw:Uint8Array,expectedHash:string,expectedRef:string):Promise<Context>{
 if(!/^[0-9a-f]{64}$/.test(expectedHash)||await sha256(raw)!==expectedHash)throw Error('BASELINE_ARTIFACT_DRIFT');
 const c=object(parsePythonJSON(new TextDecoder('utf-8',{fatal:true}).decode(raw))),id=object(c.identity);
 if(id.environment!=='production'||id.project_ref!==expectedRef)throw Error('BASELINE_ENVIRONMENT_MISMATCH');
 for(const key of ['frozen','baseline','config'])object(c[key]);
 for(const key of ['reference_worker_sha256','reference_source_sha256'])if(typeof c[key]!=='string'||!/^[0-9a-f]{64}$/.test(c[key] as string))throw Error('REFERENCE_PROVENANCE_INVALID');
 return c as unknown as Context;
}
