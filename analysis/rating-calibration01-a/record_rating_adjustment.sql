CREATE OR REPLACE FUNCTION public.record_rating_adjustment(p_request_id uuid, p_player_id uuid, p_amount numeric, p_reason text, p_effective_at timestamp with time zone, p_algorithm_version text DEFAULT 'V1.1'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare

    v_actor_user_id uuid;

    v_player_name text;
    v_player_status text;

    v_adjustment_id uuid;
    v_replay_order bigint;

    v_existing_player_id uuid;
    v_existing_amount numeric;
    v_existing_reason text;
    v_existing_effective_at timestamptz;
    v_existing_created_by uuid;
    v_existing_algorithm_version text;
    v_existing_correction_of uuid;

    v_rebuild_result jsonb;

    v_rating_before numeric;
    v_requested_amount numeric;
    v_applied_delta numeric;
    v_rating_after numeric;

begin

    -- =====================================================
    -- 1. AUTHENTICATION
    -- =====================================================

    v_actor_user_id := auth.uid();

    if v_actor_user_id is null then
        raise exception
            'Bạn chưa đăng nhập.';
    end if;


    -- =====================================================
    -- 2. AUTHORIZATION: ACTIVE ADMIN ONLY
    -- =====================================================

    if not exists (
        select 1
        from public.profiles pr
        where pr.id = v_actor_user_id
          and (pr.role = 'ADMIN' OR (pr.role = 'MEMBER' AND pr.can_adjust_rating IS TRUE))
          and pr.is_active = true
          and public.current_user_business_access_active()
    ) then
        raise exception
            'Bạn không có quyền thực hiện Rating Adjustment.';
    end if;


    -- =====================================================
    -- 3. VALIDATE INPUT
    -- =====================================================

    if p_request_id is null then
        raise exception
            'request_id không được để trống.';
    end if;


    if p_player_id is null then
        raise exception
            'player_id không được để trống.';
    end if;


    if p_amount is null
       or p_amount = 0
       or p_amount::text IN ('NaN','Infinity','-Infinity') then
        raise exception
            'Adjustment amount phải khác 0.';
    end if;


    if p_reason is null
       or btrim(p_reason) = '' then
        raise exception
            'Lý do Adjustment không được để trống.';
    end if;


    if p_effective_at is null then
        raise exception
            'effective_at không được để trống.';
    end if;


    if p_algorithm_version is null
       or btrim(p_algorithm_version) = '' then
        raise exception
            'algorithm_version không được để trống.';
    end if;


    -- =====================================================
    -- 4. SERIALIZE RATING WRITES
    -- =====================================================

    perform pg_advisory_xact_lock(726184501);


    -- =====================================================
    -- 5. IDEMPOTENCY LOOKUP
    -- =====================================================
    --
    -- Cùng request_id:
    --
    --   Payload giống hệt
    --       -> trả lại Adjustment đã tồn tại
    --       -> KHÔNG INSERT
    --       -> KHÔNG REBUILD
    --
    --   Payload khác
    --       -> reject IDP_KEY_REUSE
    --
    -- Advisory lock + UNIQUE(request_id) là hai lớp bảo vệ.
    -- =====================================================

    select
        ra.id,
        ra.replay_order,
        ra.player_id,
        ra.amount,
        ra.reason,
        ra.effective_at,
        ra.created_by,
        ra.request_algorithm_version,
        ra.correction_of_adjustment_id
    into
        v_adjustment_id,
        v_replay_order,
        v_existing_player_id,
        v_existing_amount,
        v_existing_reason,
        v_existing_effective_at,
        v_existing_created_by,
        v_existing_algorithm_version,
        v_existing_correction_of
    from public.rating_adjustments ra
    where ra.request_id = p_request_id;


    if found then

        -- -------------------------------------------------
        -- request_id này phải thuộc đúng ADMIN đã tạo request
        -- -------------------------------------------------

        if v_existing_created_by is distinct from v_actor_user_id then
            raise exception
                'IDP_KEY_REUSE: request_id đã được sử dụng bởi một user khác.';
        end if;


        -- -------------------------------------------------
        -- record_rating_adjustment() chỉ tạo Adjustment gốc,
        -- không được trỏ đến correction row.
        -- -------------------------------------------------

        if v_existing_correction_of is not null then
            raise exception
                'IDP_KEY_REUSE: request_id đang trỏ đến một Correction Adjustment.';
        end if;


        -- -------------------------------------------------
        -- Validate exact logical payload
        -- -------------------------------------------------

        if v_existing_player_id is distinct from p_player_id
           or v_existing_amount is distinct from p_amount
           or v_existing_reason is distinct from btrim(p_reason)
           or v_existing_effective_at is distinct from p_effective_at
           or v_existing_algorithm_version is distinct from btrim(p_algorithm_version)
        then
            raise exception
                'IDP_KEY_REUSE: cùng request_id nhưng payload khác request ban đầu.';
        end if;


        -- -------------------------------------------------
        -- Read current derived event.
        --
        -- Không rebuild.
        -- Không tạo source adjustment mới.
        -- -------------------------------------------------

        select
            rae.rating_before,
            rae.requested_amount,
            rae.applied_delta,
            rae.rating_after
        into
            v_rating_before,
            v_requested_amount,
            v_applied_delta,
            v_rating_after
        from public.rating_adjustment_events rae
        where rae.adjustment_id = v_adjustment_id
          and rae.algorithm_version = v_existing_algorithm_version;


        if not found then
            raise exception
                'IDEMPOTENCY_STATE_ERROR: Adjustment tồn tại nhưng không tìm thấy derived Rating Adjustment Event.';
        end if;


        select
            p.full_name,
            p.status
        into
            v_player_name,
            v_player_status
        from public.players p
        where p.id = v_existing_player_id;


        if not found then
            raise exception
                'IDEMPOTENCY_STATE_ERROR: Không tìm thấy VĐV của Adjustment đã tồn tại.';
        end if;


        return jsonb_build_object(
            'success',
                true,

            'idempotent_replay',
                true,

            'request_id',
                p_request_id,

            'adjustment_id',
                v_adjustment_id,

            'replay_order',
                v_replay_order,

            'player_id',
                v_existing_player_id,

            'player_name',
                v_player_name,

            'player_status',
                v_player_status,

            'effective_at',
                v_existing_effective_at,

            'reason',
                v_existing_reason,

            'algorithm_version',
                v_existing_algorithm_version,

            'rating_before',
                v_rating_before,

            'requested_amount',
                v_requested_amount,

            'applied_delta',
                v_applied_delta,

            'rating_after',
                v_rating_after,

            'rebuild',
                jsonb_build_object(
                    'skipped',
                        true,

                    'reason',
                        'IDEMPOTENT_REPLAY'
                )
        );

    end if;


    -- =====================================================
    -- 6. VALIDATE ALGORITHM VERSION FOR NEW REQUEST
    -- =====================================================

    if not exists (
        select 1
        from public.rating_settings rs
        where rs.algorithm_version = btrim(p_algorithm_version)
    ) then
        raise exception
            'Không tồn tại algorithm_version %.',
            p_algorithm_version;
    end if;


    -- =====================================================
    -- 7. VALIDATE PLAYER
    -- =====================================================
    --
    -- Không bắt buộc ACTIVE.
    -- Adjustment backdated cho player INACTIVE vẫn có thể
    -- là một correction lịch sử hợp lệ.
    -- =====================================================

    select
        p.full_name,
        p.status
    into
        v_player_name,
        v_player_status
    from public.players p
    where p.id = p_player_id;


    if not found then
        raise exception
            'Không tìm thấy VĐV %.',
            p_player_id;
    end if;


    -- =====================================================
    -- 8. INSERT IMMUTABLE SOURCE ADJUSTMENT
    -- =====================================================

    insert into public.rating_adjustments (
        player_id,
        amount,
        reason,
        created_by,
        effective_at,
        request_id,
        request_algorithm_version
    )
    values (
        p_player_id,
        p_amount,
        btrim(p_reason),
        v_actor_user_id,
        p_effective_at,
        p_request_id,
        btrim(p_algorithm_version)
    )
    returning
        id,
        replay_order
    into
        v_adjustment_id,
        v_replay_order;


    -- =====================================================
    -- 9. REBUILD FULL TIMELINE
    -- =====================================================
    --
    -- Nếu rebuild lỗi:
    -- toàn bộ transaction rollback,
    -- bao gồm Adjustment vừa INSERT.
    -- =====================================================

    v_rebuild_result :=
        public._rebuild_ratings_internal(
            btrim(p_algorithm_version),
            v_actor_user_id
        );


    if coalesce(
        (v_rebuild_result ->> 'success')::boolean,
        false
    ) is not true then
        raise exception
            'Rating rebuild không thành công.';
    end if;


    -- =====================================================
    -- 10. READ DERIVED ADJUSTMENT EVENT
    -- =====================================================

    select
        rae.rating_before,
        rae.requested_amount,
        rae.applied_delta,
        rae.rating_after
    into
        v_rating_before,
        v_requested_amount,
        v_applied_delta,
        v_rating_after
    from public.rating_adjustment_events rae
    where rae.adjustment_id = v_adjustment_id
      and rae.algorithm_version = btrim(p_algorithm_version);


    if not found then
        raise exception
            'Không tìm thấy derived Rating Adjustment Event sau rebuild.';
    end if;


    -- =====================================================
    -- 11. AUDIT BUSINESS ACTION
    -- =====================================================

    insert into public.audit_logs (
        user_id,
        action,
        table_name,
        record_id,
        old_data,
        new_data,
        reason,
        created_at
    )
    values (
        v_actor_user_id,
        'RECORD_RATING_ADJUSTMENT',
        'rating_adjustments',
        v_adjustment_id,
        null,
        jsonb_build_object(
            'request_id',
                p_request_id,

            'player_id',
                p_player_id,

            'player_name',
                v_player_name,

            'player_status',
                v_player_status,

            'amount_requested',
                v_requested_amount,

            'amount_applied',
                v_applied_delta,

            'rating_before',
                v_rating_before,

            'rating_after',
                v_rating_after,

            'effective_at',
                p_effective_at,

            'replay_order',
                v_replay_order,

            'algorithm_version',
                btrim(p_algorithm_version),

            'idempotent_replay',
                false
        ),
        btrim(p_reason),
        now()
    );


    -- =====================================================
    -- 12. RETURN NEW REQUEST RESULT
    -- =====================================================

    return jsonb_build_object(
        'success',
            true,

        'idempotent_replay',
            false,

        'request_id',
            p_request_id,

        'adjustment_id',
            v_adjustment_id,

        'replay_order',
            v_replay_order,

        'player_id',
            p_player_id,

        'player_name',
            v_player_name,

        'player_status',
            v_player_status,

        'effective_at',
            p_effective_at,

        'reason',
            btrim(p_reason),

        'algorithm_version',
            btrim(p_algorithm_version),

        'rating_before',
            v_rating_before,

        'requested_amount',
            v_requested_amount,

        'applied_delta',
            v_applied_delta,

        'rating_after',
            v_rating_after,

        'rebuild',
            v_rebuild_result
    );

end;
$function$
