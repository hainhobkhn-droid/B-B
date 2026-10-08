import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    },
  )
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders,
    })
  }

  if (req.method !== 'POST') {
    return jsonResponse(
      { error: 'METHOD_NOT_ALLOWED' },
      405,
    )
  }

  try {
    const supabaseUrl =
      Deno.env.get('SUPABASE_URL')

    const secretKeysRaw =
      Deno.env.get('SUPABASE_SECRET_KEYS')

    const legacyServiceRoleKey =
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl) {
      return jsonResponse(
        { error: 'SERVER_CONFIG_ERROR' },
        500,
      )
    }

    let secretKey =
      legacyServiceRoleKey || ''

    if (secretKeysRaw) {
      try {
        const parsed =
          JSON.parse(secretKeysRaw)

        secretKey =
          parsed.default ||
          Object.values(parsed)[0] ||
          secretKey
      } catch {
        // keep fallback
      }
    }

    if (!secretKey) {
      return jsonResponse(
        { error: 'SERVER_CONFIG_ERROR' },
        500,
      )
    }

    const authHeader =
      req.headers.get('Authorization')

    if (!authHeader) {
      return jsonResponse(
        { error: 'UNAUTHORIZED' },
        401,
      )
    }

    const adminClient =
      createClient(
        supabaseUrl,
        secretKey,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        },
      )

    const token =
      authHeader.replace(
        /^Bearer\s+/i,
        '',
      )

    const {
      data: callerData,
      error: callerError,
    } =
      await adminClient.auth
        .getUser(token)

    const caller =
      callerData?.user

    if (
      callerError ||
      !caller
    ) {
      return jsonResponse(
        { error: 'UNAUTHORIZED' },
        401,
      )
    }

    const {
      data: callerProfile,
      error: callerProfileError,
    } =
      await adminClient
        .from('profiles')
        .select('role, is_active')
        .eq('id', caller.id)
        .maybeSingle()

    if (
      callerProfileError ||
      !callerProfile ||
      callerProfile.is_active !== true ||
      callerProfile.role !== 'ADMIN'
    ) {
      return jsonResponse(
        { error: 'FORBIDDEN' },
        403,
      )
    }

    let payload:
      | { user_id?: unknown }
      | null = null

    try {
      payload = await req.json()
    } catch {
      return jsonResponse(
        { error: 'INVALID_JSON' },
        400,
      )
    }

    const userId =
      typeof payload?.user_id === 'string'
        ? payload.user_id.trim()
        : ''

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        .test(userId)
    ) {
      return jsonResponse(
        { error: 'INVALID_USER_ID' },
        400,
      )
    }

    const {
      data: targetData,
      error: targetError,
    } =
      await adminClient.auth.admin
        .getUserById(userId)

    const target =
      targetData?.user

    if (
      targetError ||
      !target
    ) {
      return jsonResponse(
        { error: 'USER_NOT_FOUND' },
        404,
      )
    }

    if (target.email_confirmed_at) {
      return jsonResponse({
        ok: true,
        already_confirmed: true,
      })
    }

    const {
      error: updateError,
    } =
      await adminClient.auth.admin
        .updateUserById(
          userId,
          {
            email_confirm: true,
          },
        )

    if (updateError) {
      console.error(
        'ADMIN_CONFIRM_USER_ERROR',
        updateError,
      )

      return jsonResponse(
        { error: 'CONFIRM_USER_FAILED' },
        500,
      )
    }

    return jsonResponse({
      ok: true,
      already_confirmed: false,
    })
  } catch (error) {
    console.error(
      'ADMIN_CONFIRM_USER_INTERNAL_ERROR',
      error,
    )

    return jsonResponse(
      { error: 'INTERNAL_ERROR' },
      500,
    )
  }
})