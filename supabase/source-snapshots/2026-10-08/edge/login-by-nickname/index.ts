import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
function envKey(mapName: string, fallbackName: string) {
  let key = Deno.env.get(fallbackName) || ''
  try {
    const keys = JSON.parse(Deno.env.get(mapName) || '{}')
    key = keys.default || Object.values(keys)[0] || key
  } catch { /* Preserve deployed legacy fallback. */ }
  return key
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405)
  try {
    const url = Deno.env.get('SUPABASE_URL')
    const secret = envKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY')
    const publicKey = envKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY')
    if (!url || !secret || !publicKey) return jsonResponse({ error: 'SERVER_CONFIG_ERROR' }, 500)
    let payload
    try { payload = await req.json() } catch { return jsonResponse({ error: 'INVALID_JSON' }, 400) }
    const loginName = typeof payload?.login_name === 'string' ? payload.login_name.trim().toLowerCase() : ''
    const password = typeof payload?.password === 'string' ? payload.password : ''
    if (!password || !/^[a-z0-9._-]{3,32}$/.test(loginName)) return jsonResponse({ error: 'INVALID_LOGIN' }, 401)
    const options = { auth: { persistSession: false, autoRefreshToken: false } }
    const admin = createClient(url, secret, options)
    // Escape LIKE metacharacters: '_' in a nickname is literal, never a wildcard.
    const { data: profile, error: profileError } = await admin.from('profiles')
      .select('id').ilike('login_name', loginName.replace(/_/g, '\\_')).maybeSingle()
    if (profileError || !profile) return jsonResponse({ error: 'INVALID_LOGIN' }, 401)
    const { data: userData, error: userError } = await admin.auth.admin.getUserById(profile.id)
    if (userError || !userData?.user?.email) return jsonResponse({ error: 'INVALID_LOGIN' }, 401)
    const auth = createClient(url, publicKey, options)
    const { data, error } = await auth.auth.signInWithPassword({ email: userData.user.email, password })
    if (error || !data?.session || !data.user || data.user.id !== profile.id) {
      return jsonResponse({ error: 'INVALID_LOGIN' }, 401)
    }
    // Read current status only AFTER proving password ownership. Never expose
    // pending/rejected/account state to an unauthenticated nickname probe.
    const { data: current, error: currentError } = await admin.from('profiles')
      .select('role, is_active, membership_status').eq('id', profile.id).maybeSingle()
    const allowed = current?.membership_status === 'APPROVED' && current?.is_active === true
    const waiting = current?.role === 'MEMBER' && current?.is_active === false &&
      ['PENDING', 'REJECTED'].includes(current?.membership_status)
    if (currentError || (!allowed && !waiting)) {
      await auth.auth.signOut({ scope: 'local' })
      return jsonResponse({ error: 'INVALID_LOGIN' }, 401)
    }
    // Pending/rejected sessions can read only their own profile. DB RLS/RPC
    // guards enforce this even when clients bypass the frontend status screen.
    return jsonResponse({
      ok: true,
      session: {
        access_token: data.session.access_token, refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at, expires_in: data.session.expires_in,
        token_type: data.session.token_type,
      },
      user: { id: data.user.id },
    })
  } catch {
    return jsonResponse({ error: 'INTERNAL_ERROR' }, 500)
  }
})
