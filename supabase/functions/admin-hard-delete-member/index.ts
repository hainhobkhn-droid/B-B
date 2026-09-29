import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

function secretKey() {
  let key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

  try {
    const keys = JSON.parse(
      Deno.env.get('SUPABASE_SECRET_KEYS') || '{}',
    )

    key =
      keys.default ||
      Object.values(keys)[0] ||
      key
  } catch {
    // Preserve deployed legacy fallback.
  }

  return key
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse(
      { error: 'METHOD_NOT_ALLOWED' },
      405,
    )
  }

  try {
    const url = Deno.env.get('SUPABASE_URL')
    const key = secretKey()

    if (!url || !key) {
      return jsonResponse(
        { error: 'SERVER_CONFIG_ERROR' },
        500,
      )
    }

    const authorization =
      req.headers.get('Authorization')

    if (!authorization) {
      return jsonResponse(
        { error: 'UNAUTHORIZED' },
        401,
      )
    }

    const accessToken =
      authorization.replace(/^Bearer\s+/i, '')

    const admin = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })

    const {
      data: callerData,
      error: callerError,
    } = await admin.auth.getUser(accessToken)

    const caller = callerData?.user

    if (callerError || !caller) {
      return jsonResponse(
        { error: 'UNAUTHORIZED' },
        401,
      )
    }

    const {
      data: actor,
      error: actorError,
    } = await admin
      .from('profiles')
      .select('role, is_active')
      .eq('id', caller.id)
      .maybeSingle()

    if (
      actorError ||
      actor?.role !== 'ADMIN' ||
      actor.is_active !== true
    ) {
      return jsonResponse(
        { error: 'FORBIDDEN' },
        403,
      )
    }

    let payload: Record<string, unknown>

    try {
      payload = await req.json()
    } catch {
      return jsonResponse(
        { error: 'INVALID_JSON' },
        400,
      )
    }

    const profileId =
      typeof payload?.profile_id === 'string'
        ? payload.profile_id.trim()
        : ''

    const reason =
      typeof payload?.reason === 'string'
        ? payload.reason.trim()
        : ''

    if (!profileId) {
      return jsonResponse(
        { error: 'PROFILE_ID_REQUIRED' },
        400,
      )
    }

    if (profileId === caller.id) {
      return jsonResponse(
        { error: 'SELF_HARD_DELETE_FORBIDDEN' },
        400,
      )
    }

    if (
      !reason ||
      reason.length > 1000
    ) {
      return jsonResponse(
        { error: 'REASON_REQUIRED_MAX_1000' },
        400,
      )
    }

    const {
      data: target,
      error: targetError,
    } = await admin
      .from('profiles')
      .select(
        'id, role, player_id, login_name, full_name',
      )
      .eq('id', profileId)
      .maybeSingle()

    if (targetError) {
      return jsonResponse(
        { error: 'TARGET_LOOKUP_FAILED' },
        500,
      )
    }

    if (!target || target.role !== 'MEMBER') {
      return jsonResponse(
        { error: 'TARGET_MEMBER_REQUIRED' },
        404,
      )
    }

    /*
     * Informational pre-check only.
     *
     * The mutation RPC performs the authoritative
     * re-check inside its own transaction.
     */
    const {
      data: snapshot,
      error: snapshotError,
    } = await admin.rpc(
      'get_member_hard_delete_snapshot',
      {
        p_profile_id: profileId,
      },
    )

    if (snapshotError) {
      return jsonResponse(
        {
          error:
            'DELETION_SNAPSHOT_FAILED',
        },
        500,
      )
    }

    if (
      snapshot?.hard_delete_allowed !== true ||
      Number(snapshot?.reference_total || 0) !== 0
    ) {
      return jsonResponse(
        {
          error:
            'MEMBER_HAS_REFERENCES',
          preview: snapshot,
        },
        409,
      )
    }

    /*
     * Delete Auth first.
     *
     * If public cleanup subsequently fails,
     * business/public data is preserved and the
     * operation can be retried safely.
     */
    const {
      data: authLookup,
      error: authLookupError,
    } = await admin.auth.admin.getUserById(
      profileId,
    )

    const authNotFound =
      !!authLookupError &&
      (
        authLookupError.status === 404 ||
        (authLookupError.message || '')
          .toLowerCase()
          .includes('user not found')
      )

    if (
      authLookupError &&
      !authNotFound
    ) {
      return jsonResponse(
        {
          error:
            'AUTH_LOOKUP_FAILED',
        },
        500,
      )
    }

    const authUserExists =
      !authNotFound &&
      !!authLookup?.user

    if (authUserExists) {
      const {
        error: authDeleteError,
      } = await admin.auth.admin.deleteUser(
        profileId,
      )

      if (authDeleteError) {
        return jsonResponse(
          {
            error:
              'AUTH_DELETE_FAILED',
          },
          500,
        )
      }
    }

    /*
     * Authoritative transactional cleanup.
     *
     * RPC re-checks:
     * - actor is still active ADMIN
     * - target is still MEMBER
     * - Player/Profile business references
     * - non-whitelisted audit history
     */
    const {
      data: cleanup,
      error: cleanupError,
    } = await admin.rpc(
      'admin_hard_delete_member_public',
      {
        p_profile_id: profileId,
        p_actor_id: caller.id,
        p_reason: reason,
      },
    )

    if (cleanupError) {
      const message =
        cleanupError.message || ''

      if (
        message.includes(
          'MEMBER_HAS_REFERENCES',
        )
      ) {
        return jsonResponse(
          {
            error:
              'PUBLIC_CLEANUP_BLOCKED_AUTH_ALREADY_DELETED',
          },
          409,
        )
      }

      return jsonResponse(
        {
          error:
            'PUBLIC_CLEANUP_FAILED_AUTH_ALREADY_DELETED',
        },
        500,
      )
    }

    return jsonResponse({
      ok: true,
      profile_id: profileId,
      player_id:
        cleanup?.player_id || null,
      deleted_lifecycle_audit_logs:
        cleanup
          ?.deleted_lifecycle_audit_logs ||
        0,
      auth_user_deleted:
        authUserExists,
    })
  } catch {
    return jsonResponse(
      { error: 'INTERNAL_ERROR' },
      500,
    )
  }
})