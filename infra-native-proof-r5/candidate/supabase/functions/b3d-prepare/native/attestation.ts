// V2 explicitly separates legacy compatibility fields from native implementation identity.
import {object,type Context} from './engine.ts';
export function validateNativeIdentity(hash:string,context:Context):string{
 if(!/^[0-9a-f]{64}$/.test(hash)||hash===context.reference_worker_sha256||hash===context.reference_source_sha256)throw Error('NATIVE_IMPLEMENTATION_IDENTITY_REQUIRED');
 return hash;
}
export function withNativeAttestation(output:unknown,nativeHash:string,context:Context){
 validateNativeIdentity(nativeHash,context);const result=object(output),computed=object(result.computed);
 if(result.worker_sha256!==context.reference_worker_sha256||computed.source_code_sha256!==context.reference_source_sha256||computed.seal_version!=='B3_LOCAL_1'||Object.hasOwn(result,'attestation'))throw Error('LEGACY_REFERENCE_CONTRACT_DRIFT');
 return {...result,attestation:{version:2,protocol_version:'B3_LOCAL_1',protocol_reference_sha256:context.reference_worker_sha256,reference_source_sha256:context.reference_source_sha256,native_artifact_sha256:nativeHash}};
}
