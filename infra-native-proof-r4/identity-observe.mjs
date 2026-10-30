// Observe exact candidate producer fields on a synthetic boundary; no network or private output.
import {readFileSync} from 'node:fs';
import {compute} from './candidate/supabase/functions/b3d-prepare/native/engine.ts';
import {parsePythonJSON} from './candidate/supabase/functions/b3d-prepare/native/python-json.ts';
const data=parsePythonJSON(readFileSync(new URL('./synthetic-goldens.json',import.meta.url),'utf8'));
const c=data.cases.find(x=>x.name==='prefix-2');const result=await compute(c.boundary,c.context);
console.log(JSON.stringify({worker_sha256:result.worker_sha256,source_code_sha256:result.computed.source_code_sha256}));
