// Internal synthetic/local producer proof. Never log the payload in CI.
import {readFileSync} from 'node:fs';
import {compute} from './candidate/supabase/functions/b3d-prepare/native/engine.ts';
import {withNativeAttestation} from './candidate/supabase/functions/b3d-prepare/native/attestation.ts';
import {parsePythonJSON,canonical} from './candidate/supabase/functions/b3d-prepare/native/python-json.ts';
const context=parsePythonJSON(readFileSync(process.env.B3D_TEST_CONTEXT??new URL('./candidate/supabase/functions/b3d-prepare/context.json',import.meta.url),'utf8'));
const lock=JSON.parse(readFileSync(new URL('./candidate-lock.json',import.meta.url),'utf8'));
const boundary=parsePythonJSON(readFileSync(0,'utf8'));
process.stdout.write(canonical(withNativeAttestation(await compute(boundary,context),lock.native_artifact_hash,context)));
