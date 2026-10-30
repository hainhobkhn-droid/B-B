// LOCAL DEPLOYMENT CANDIDATE ONLY. Activation/deploy requires separate approval.
import {createPrepareHandler} from './native/handler.ts';
import {supabaseTransport} from './native/transport.ts';
import {lockedContext} from './native/context.ts';
const ref='bflwaqlvnesuqoyikxar';
const context=await lockedContext(await Deno.readFile(new URL('./context.json',import.meta.url)),'73b9dc897cf8547575798ad153b2a7cd886cc4616bd860079ff45fe425ebdd84',ref);
const transport=supabaseTransport({url:Deno.env.get('SUPABASE_URL')??'',expectedProjectRef:ref,publishableKey:Deno.env.get('SUPABASE_ANON_KEY')??'',serviceKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??''});
const handler=createPrepareHandler({...transport,context,nativeArtifactHash:Deno.env.get('B3D_NATIVE_ARTIFACT_SHA256')??'',allowedOrigins:['https://hainhobkhn-droid.github.io']});
Deno.serve(req=>Deno.env.get('B3D_PREPARE_ENABLED')==='true'?handler(req):new Response(JSON.stringify({error:'PREPARATION_UNAVAILABLE'}),{status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}}));
