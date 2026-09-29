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
    // Preserve deployed fallback behavior.
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

    let cleanup:
      | Record<string, unknown>
      | null = null

    let recoveryMode = false

    if (target) {
      if (target.role !== 'MEMBER') {
        return jsonResponse(
          { error: 'TARGET_MEMBER_REQUIRED' },
          404,
        )
      }
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
            error: 'MEMBER_HAS_REFERENCES',
            preview: snapshot,
          },
          409,
        )
      }

      /*
       * IMPORTANT:
       * public.profiles.id -> auth.users.id is ON DELETE CASCADE.
       * Therefore public blockers must be removed BEFORE auth.deleteUser().
       *
       * This RPC performs the authoritative eligibility re-check and
       * atomically deletes lifecycle audit + Profile + linked Player.
       */
      const {
        data: cleanupData,
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
                'MEMBER_HAS_REFERENCES',
            },
            409,
          )
        }

        return jsonResponse(
          {
            error:
              'PUBLIC_CLEANUP_FAILED',
          },
          500,
        )
      }

      cleanup =
        cleanupData &&
        typeof cleanupData === 'object'
          ? cleanupData
          : null
    } else {
      /*
       * Profile missing may mean a prior attempt completed public cleanup
       * but Auth deletion failed. Only a valid hard-delete tombstone permits
       * Auth-only recovery.
       */
      const {
        data: tombstone,
        error: tombstoneError,
      } = await admin
        .from('audit_logs')
        .select('id, record_id, old_data')
        .eq(
          'action',
          'HARD_DELETE_MEMBER_ACCOUNT',
        )
        .eq('table_name', 'profiles')
        .eq('record_id', profileId)
        .order('created_at', {
          ascending: false,
        })
        .limit(1)
        .maybeSingle()

      if (tombstoneError) {
        return jsonResponse(
          {
            error:
              'RECOVERY_TOMBSTONE_LOOKUP_FAILED',
          },
          500,
        )
      }

      if (!tombstone) {
        return jsonResponse(
          {
            error:
              'TARGET_MEMBER_REQUIRED',
          },
          404,
        )
      }

      recoveryMode = true
    }

    /*
     * Auth deletion happens only after public blockers are gone.
     *
     * If Auth deletion fails now, retry is safe because the tombstone allows
     * this function to enter Auth-only recovery mode.
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
      console.log(
        'IAM05E_AUTH_LOOKUP_ERROR',
        {
          message:
            authLookupError.message || null,
          status:
            authLookupError.status || null,
          name:
            authLookupError.name || null,
        },
      )

      return jsonResponse(
        {
          error:
            'PUBLIC_DELETED_AUTH_LOOKUP_FAILED',
          recovery_required: true,
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
        console.log(
          'IAM05E_AUTH_DELETE_ERROR',
          {
            message:
              authDeleteError.message || null,
            status:
              authDeleteError.status || null,
            name:
              authDeleteError.name || null,
          },
        )

        return jsonResponse(
          {
            error:
              'PUBLIC_DELETED_AUTH_DELETE_FAILED',
            auth_error:
              authDeleteError.message || null,
            recovery_required: true,
          },
          500,
        )
      }
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
      recovery_mode:
        recoveryMode,
    })
  } catch (error) {
    console.error(
      'IAM05E_UNHANDLED_ERROR',
      error,
    )

    return jsonResponse(
      { error: 'INTERNAL_ERROR' },
      500,
    )
  }
})