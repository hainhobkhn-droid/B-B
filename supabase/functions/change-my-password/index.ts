import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
function reply(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
}
function envKey(map: string, fallback: string) {
  let key = Deno.env.get(fallback) || ''
  try { const keys = JSON.parse(Deno.env.get(map) || '{}'); key = keys.default || Object.values(keys)[0] || key } catch { /* legacy key */ }
  return key
}
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return reply({ error: 'METHOD_NOT_ALLOWED' }, 405)
  let authConfirmed = false
  try {
    const url = Deno.env.get('SUPABASE_URL')
    const secret = envKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY')
    const publicKey = envKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY')
    if (!url || !secret || !publicKey) return reply({ error: 'SERVER_CONFIG_ERROR' }, 500)
    const header = req.headers.get('Authorization') || ''
    if (!/^Bearer \S+$/i.test(header)) return reply({ error: 'UNAUTHORIZED' }, 401)
    const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await admin.auth.getUser(header.replace(/^Bearer /i, ''))
    const caller = data?.user
    if (error || !caller?.id) return reply({ error: 'UNAUTHORIZED' }, 401)
    let body
    try { body = await req.json() } catch { return reply({ error: 'INVALID_JSON' }, 400) }
    // No target id or client-supplied completion evidence is accepted.
    const preflightOnly = body?.mode === 'preflight'
    const allowedKeys = preflightOnly ? ['mode'] : ['password', 'nonce']
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !allowedKeys.includes(k))) return reply({ error: 'INVALID_INPUT' }, 400)
    if (!preflightOnly && (typeof body.password !== 'string' || body.password.length < 8)) return reply({ error: 'weak_password' }, 400)
    if (body.nonce !== undefined && typeof body.nonce !== 'string') return reply({ error: 'INVALID_INPUT' }, 400)
    // Fail closed BEFORE Auth mutation; only verified self identity reaches readiness.
    let readiness
    try {
      readiness = await admin.rpc('get_forced_password_change_readiness_internal', { p_profile_id: caller.id })
    } catch { return reply({ error: 'PASSWORD_BACKEND_NOT_READY' }, 503) }
    const ready = readiness.data
    if (readiness.error || ready?.ready !== true || ready?.contract !== 'ACC06D_V1'
      || ready?.profile_id !== caller.id || typeof ready?.must_change_password !== 'boolean') {
      return reply({ error: 'PASSWORD_BACKEND_NOT_READY' }, 503)
    }
    // Authenticated self-only health check; never exposes catalog/grant details.
    if (preflightOnly) return reply({ ready: true })
    // User JWT (never admin.updateUserById): retain Auth password policy and reauthentication.
    const updated = await fetch(`${url}/auth/v1/user`, {
      method: 'PUT', headers: { apikey: publicKey, Authorization: header, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: body.password, ...(body.nonce ? { nonce: body.nonce } : {}) }),
    })
    const result = await updated.json()
    const authCode = result?.error_code || result?.code
    if (!updated.ok) return reply({ error: ['weak_password', 'same_password', 'reauthentication_needed', 'reauthentication_not_valid'].includes(authCode) ? authCode : 'PASSWORD_UPDATE_FAILED' }, updated.status === 429 ? 429 : 400)
    if (result?.id !== caller.id) return reply({ error: 'PASSWORD_UPDATE_UNCONFIRMED' }, 502)
    authConfirmed = true
    const completed = await admin.rpc('complete_forced_password_change_internal', { p_profile_id: caller.id })
    if (completed.error || completed.data?.success !== true || completed.data?.profile_id !== caller.id || completed.data?.must_change_password !== false) return reply({ error: 'PASSWORD_COMPLETION_PENDING' }, 503)
    return reply({ success: true, profile_id: caller.id, must_change_password: false })
  } catch {
    // Never log body, password, tokens or raw Auth errors.
    return reply({ error: authConfirmed ? 'PASSWORD_COMPLETION_PENDING' : 'PASSWORD_UPDATE_UNCONFIRMED' }, 503)
  }
})
