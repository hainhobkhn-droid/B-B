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
function secretKey() {
  let key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}')
    key = keys.default || Object.values(keys)[0] || key
  } catch { /* Preserve deployed legacy fallback. */ }
  return key
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405)
  try {
    const url = Deno.env.get('SUPABASE_URL')
    const key = secretKey()
    if (!url || !key) return jsonResponse({ error: 'SERVER_CONFIG_ERROR' }, 500)
    const header = req.headers.get('Authorization')
    if (!header) return jsonResponse({ error: 'UNAUTHORIZED' }, 401)
    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: callerData, error: callerError } = await admin.auth.getUser(header.replace(/^Bearer\s+/i, ''))
    const caller = callerData?.user
    if (callerError || !caller) return jsonResponse({ error: 'UNAUTHORIZED' }, 401)
    const { data: actor, error: actorError } = await admin.from('profiles')
      .select('role, is_active').eq('id', caller.id).maybeSingle()
    if (actorError || actor?.role !== 'ADMIN' || actor.is_active !== true) {
      return jsonResponse({ error: 'FORBIDDEN' }, 403)
    }
    let payload
    try { payload = await req.json() } catch { return jsonResponse({ error: 'INVALID_JSON' }, 400) }
    const fullName = typeof payload?.full_name === 'string' ? payload.full_name.trim() : ''
    const loginName = typeof payload?.login_name === 'string' ? payload.login_name.trim().toLowerCase() : ''
    const email = typeof payload?.email === 'string' ? payload.email.trim().toLowerCase() : ''
    const password = typeof payload?.password === 'string' ? payload.password : ''
    const phone = typeof payload?.phone === 'string' ? payload.phone.trim() : ''
    const dateOfBirth = typeof payload?.date_of_birth === 'string' ? payload.date_of_birth.trim() : ''
    const initialRating = ['number', 'string'].includes(typeof payload?.initial_rating)
      ? String(payload.initial_rating).trim() : ''
    if (!fullName) return jsonResponse({ error: 'FULL_NAME_REQUIRED' }, 400)
    if (!/^[a-z0-9._-]{3,32}$/.test(loginName)) return jsonResponse({ error: 'INVALID_LOGIN_NAME' }, 400)
    if (!email || !email.includes('@')) return jsonResponse({ error: 'INVALID_EMAIL' }, 400)
    if (password.length < 8) return jsonResponse({ error: 'WEAK_PASSWORD' }, 400)
    const { data: existing, error: existingError } = await admin.from('profiles')
      .select('id').eq('login_name', loginName).maybeSingle()
    if (existingError) return jsonResponse({ error: 'LOGIN_NAME_CHECK_FAILED' }, 500)
    if (existing) return jsonResponse({ error: 'LOGIN_NAME_ALREADY_EXISTS' }, 409)
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      // IAM05D: caller input never supplies this trusted approval provenance.
      // Deploy before the migration: the old trigger safely ignores app_metadata.
      app_metadata: {
        membership_source: 'ADMIN_CREATE_MEMBER',
        membership_created_by: caller.id,
      },
      user_metadata: {
        full_name: fullName, login_name: loginName, phone: phone || null,
        date_of_birth: dateOfBirth || null, initial_rating: initialRating || null,
        must_change_password: true,
      },
    })
    if (createError || !created?.user) {
      if ((createError?.message || '').toLowerCase().includes('already')) {
        return jsonResponse({ error: 'EMAIL_ALREADY_EXISTS' }, 409)
      }
      return jsonResponse({ error: 'CREATE_USER_FAILED' }, 500)
    }
    return jsonResponse({ ok: true, user_id: created.user.id, login_name: loginName, must_change_password: true })
  } catch {
    return jsonResponse({ error: 'INTERNAL_ERROR' }, 500)
  }
})
