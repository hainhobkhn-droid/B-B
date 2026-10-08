CREATE OR REPLACE FUNCTION public.correct_rating_adjustment(p_adjustment_id uuid, p_reason text, p_algorithm_version text DEFAULT 'V1.1'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_actor_user_id uuid;

    v_original_player_id uuid;
    v_original_player_name text;
    v_original_amount numeric;
    v_original_reason text;
    v_original_effective_at timestamptz;
    v_original_replay_order bigint;

    v_correction_id uuid;
    v_correction_replay_order bigint;
    v_correction_amount numeric;

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
    -- 2. AUTHORIZATION
    -- ACTIVE ADMIN ONLY
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
            'Bạn không có quyền correction Rating Adjustment.';
    end if;


    -- =====================================================
    -- 3. VALIDATE INPUT
    -- =====================================================

    if p_adjustment_id is null then
        raise exception
            'adjustment_id không được để trống.';
    end if;


    if p_reason is null
       or btrim(p_reason) = '' then
        raise exception
            'Lý do correction không được để trống.';
    end if;


    if p_algorithm_version is null
       or btrim(p_algorithm_version) = '' then
        raise exception
            'algorithm_version không được để trống.';
    end if;


    -- =====================================================
    -- 4. SERIALIZE ALL RATING WRITES
    -- =====================================================

    perform pg_advisory_xact_lock(726184501);


    -- =====================================================
    -- 5. VALIDATE ALGORITHM VERSION
    -- =====================================================

    if not exists (
        select 1
        from public.rating_settings rs
        where rs.algorithm_version = p_algorithm_version
    ) then
        raise exception
            'Không tồn tại algorithm_version %.',
            p_algorithm_version;
    end if;


    -- =====================================================
    -- 6. LOAD + LOCK ORIGINAL ADJUSTMENT
    -- =====================================================

    select
        ra.player_id,
        p.full_name,
        ra.amount,
        ra.reason,
        ra.effective_at,
        ra.replay_order
    into
        v_original_player_id,
        v_original_player_name,
        v_original_amount,
        v_original_reason,
        v_original_effective_at,
        v_original_replay_order

    from public.rating_adjustments ra

    join public.players p
        on p.id = ra.player_id

    where ra.id = p_adjustment_id

    for update of ra;


    if not found then
        raise exception
            'Không tìm thấy Rating Adjustment %.',
            p_adjustment_id;
    end if;


    -- =====================================================
    -- 7. PREVENT DUPLICATE DIRECT CORRECTION
    -- =====================================================

    if exists (
        select 1
        from public.rating_adjustments ra
        where ra.correction_of_adjustment_id =
            p_adjustment_id
    ) then
        raise exception
            'Rating Adjustment % đã có correction trực tiếp.',
            p_adjustment_id;
    end if;


    -- =====================================================
    -- 8. CALCULATE REVERSAL AMOUNT
    -- =====================================================

    v_correction_amount :=
        -v_original_amount;


    if v_correction_amount = 0 then
        raise exception
            'Correction amount không hợp lệ.';
    end if;


    -- =====================================================
    -- 9. INSERT APPEND-ONLY CORRECTION
    -- =====================================================
    --
    -- effective_at GIỐNG adjustment gốc.
    --
    -- replay_order mới sẽ lớn hơn adjustment gốc,
    -- nên trong unified timeline:
    --
    -- Original → Correction → các Match sau đó.
    --
    -- Không UPDATE/DELETE source ledger.
    -- =====================================================

    insert into public.rating_adjustments (
        player_id,
        amount,
        reason,
        created_by,
        effective_at,
        correction_of_adjustment_id
    )
    values (
        v_original_player_id,
        v_correction_amount,
        btrim(p_reason),
        v_actor_user_id,
        v_original_effective_at,
        p_adjustment_id
    )
    returning
        id,
        replay_order
    into
        v_correction_id,
        v_correction_replay_order;


    -- =====================================================
    -- 10. DEFENSIVE ORDER CHECK
    -- =====================================================

    if v_correction_replay_order
       <= v_original_replay_order then

        raise exception
            'Correction replay_order phải lớn hơn original replay_order.';
    end if;


    -- =====================================================
    -- 11. REBUILD FULL HISTORICAL TIMELINE
    -- =====================================================
    --
    -- Nếu rebuild lỗi:
    -- INSERT correction cũng rollback.
    -- =====================================================

    v_rebuild_result :=
        public._rebuild_ratings_internal(
            p_algorithm_version,
            v_actor_user_id
        );


    if coalesce(
        (v_rebuild_result ->> 'success')::boolean,
        false
    ) is not true then

        raise exception
            'Rating rebuild sau correction không thành công.';

    end if;


    -- =====================================================
    -- 12. READ DERIVED CORRECTION EVENT
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

    where rae.adjustment_id =
            v_correction_id

      and rae.algorithm_version =
            p_algorithm_version;


    if not found then
        raise exception
            'Không tìm thấy derived event của correction sau rebuild.';
    end if;


    -- =====================================================
    -- 13. AUDIT BUSINESS ACTION
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

        'CORRECT_RATING_ADJUSTMENT',

        'rating_adjustments',

        v_correction_id,

        jsonb_build_object(
            'original_adjustment_id',
                p_adjustment_id,

            'player_id',
                v_original_player_id,

            'player_name',
                v_original_player_name,

            'original_amount',
                v_original_amount,

            'original_reason',
                v_original_reason,

            'original_effective_at',
                v_original_effective_at,

            'original_replay_order',
                v_original_replay_order
        ),

        jsonb_build_object(
            'correction_adjustment_id',
                v_correction_id,

            'correction_of_adjustment_id',
                p_adjustment_id,

            'player_id',
                v_original_player_id,

            'player_name',
                v_original_player_name,

            'requested_amount',
                v_requested_amount,

            'applied_delta',
                v_applied_delta,

            'rating_before',
                v_rating_before,

            'rating_after',
                v_rating_after,

            'effective_at',
                v_original_effective_at,

            'replay_order',
                v_correction_replay_order,

            'algorithm_version',
                p_algorithm_version
        ),

        btrim(p_reason),

        now()
    );


    -- =====================================================
    -- 14. RETURN
    -- =====================================================

    return jsonb_build_object(
        'success',
            true,

        'original_adjustment_id',
            p_adjustment_id,

        'correction_adjustment_id',
            v_correction_id,

        'correction_of_adjustment_id',
            p_adjustment_id,

        'player_id',
            v_original_player_id,

        'player_name',
            v_original_player_name,

        'original_amount',
            v_original_amount,

        'correction_amount',
            v_requested_amount,

        'effective_at',
            v_original_effective_at,

        'original_replay_order',
            v_original_replay_order,

        'correction_replay_order',
            v_correction_replay_order,

        'rating_before_correction',
            v_rating_before,

        'applied_delta',
            v_applied_delta,

        'rating_after_correction',
            v_rating_after,

        'reason',
            btrim(p_reason),

        'algorithm_version',
            p_algorithm_version,

        'rebuild',
            v_rebuild_result
    );

end;
$function$
