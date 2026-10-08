CREATE OR REPLACE FUNCTION public._rebuild_ratings_internal(p_algorithm_version text, p_actor_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_initial_rating numeric;
    v_min_rating numeric;
    v_max_rating numeric;
    v_k_factor numeric;
    v_expected_sensitivity numeric;
    v_provisional_matches integer;
    v_stable_matches integer;
    v_recency_half_life_days numeric;
    v_recency_floor numeric;
    v_delta_cap numeric;

    v_latest_match_date date;

    v_match_count integer := 0;
    v_event_count integer := 0;
    v_adjustment_count integer := 0;
    v_adjustment_event_count integer := 0;

    r_timeline record;

    v_count_total integer;
    v_count_a integer;
    v_count_b integer;

    v_team_a_rating numeric;
    v_team_b_rating numeric;

    v_match_weight numeric;
    v_recency_weight numeric;
    v_actual_a numeric;
    v_actual_b numeric;

    r_player record;

    v_rating_before numeric;
    v_team_rating numeric;
    v_opponent_team_rating numeric;
    v_expected_share numeric;
    v_actual_share numeric;
    v_performance_gap numeric;
    v_previous_matches integer;
    v_provisional_factor numeric;
    v_rating_delta numeric;
    v_rating_after numeric;

    v_adjustment_applied_delta numeric;

begin

    -- =====================================================
    -- 1. CONCURRENCY PROTECTION
    -- =====================================================

    perform pg_advisory_xact_lock(726184501);


    -- =====================================================
    -- 2. VALIDATE ALGORITHM VERSION
    -- =====================================================

    if p_algorithm_version is null
       or btrim(p_algorithm_version) = '' then

        raise exception
            'algorithm_version không được để trống.';

    end if;


    -- =====================================================
    -- 3. LOAD SETTINGS
    -- =====================================================

    select
        rs.initial_rating,
        rs.min_rating,
        rs.max_rating,
        rs.k_factor,
        rs.expected_sensitivity,
        rs.provisional_matches,
        rs.stable_matches,
        rs.recency_half_life_days,
        rs.recency_floor,
        rs.rating_delta_cap
    into
        v_initial_rating,
        v_min_rating,
        v_max_rating,
        v_k_factor,
        v_expected_sensitivity,
        v_provisional_matches,
        v_stable_matches,
        v_recency_half_life_days,
        v_recency_floor,
        v_delta_cap
    from public.rating_settings rs
    where rs.algorithm_version = p_algorithm_version
    order by rs.id desc
    limit 1;


    if not found then

        raise exception
            'Không tìm thấy rating_settings cho algorithm_version %.',
            p_algorithm_version;

    end if;


    -- =====================================================
    -- 4. VALIDATE SETTINGS
    -- =====================================================

    if v_initial_rating is null then
        raise exception 'initial_rating không được NULL.';
    end if;


    if v_min_rating is null
       or v_max_rating is null
       or v_min_rating >= v_max_rating then

        raise exception
            'Cấu hình min_rating/max_rating không hợp lệ.';

    end if;


    if v_initial_rating < v_min_rating
       or v_initial_rating > v_max_rating then

        raise exception
            'initial_rating phải nằm trong khoảng min_rating đến max_rating.';

    end if;


    if v_k_factor is null
       or v_k_factor <= 0 then

        raise exception 'k_factor phải lớn hơn 0.';

    end if;


    if v_expected_sensitivity is null
       or v_expected_sensitivity <= 0 then

        raise exception
            'expected_sensitivity phải lớn hơn 0.';

    end if;


    if v_provisional_matches is null
       or v_provisional_matches < 0 then

        raise exception
            'provisional_matches không hợp lệ.';

    end if;


    if v_stable_matches is null
       or v_stable_matches < v_provisional_matches then

        raise exception
            'stable_matches phải lớn hơn hoặc bằng provisional_matches.';

    end if;


    if v_recency_half_life_days is null
       or v_recency_half_life_days <= 0 then

        raise exception
            'recency_half_life_days phải lớn hơn 0.';

    end if;


    if v_recency_floor is null
       or v_recency_floor < 0
       or v_recency_floor > 1 then

        raise exception
            'recency_floor phải nằm trong khoảng 0 đến 1.';

    end if;


    if v_delta_cap is null
       or v_delta_cap <= 0 then

        raise exception
            'rating_delta_cap phải lớn hơn 0.';

    end if;


    -- =====================================================
    -- 5. VALIDATE PLAYER INITIAL RATINGS
    -- =====================================================

    if exists (
        select 1
        from public.players p
        where p.initial_rating < v_min_rating
           or p.initial_rating > v_max_rating
    ) then

        raise exception
            'Có player.initial_rating nằm ngoài min/max của algorithm_version %. Rebuild bị hủy.',
            p_algorithm_version;

    end if;


    -- =====================================================
    -- 6. FIND LATEST RATED MATCH DATE
    -- =====================================================

    select max(m.played_at::date)
    into v_latest_match_date
    from public.matches m
    join public.rating_match_weights mw
        on mw.match_type = m.match_type
    where m.status = 'APPROVED'
      and mw.weight > 0;


    -- =====================================================
    -- 7. RESET PLAYERS
    -- =====================================================

    update public.players
    set
        current_rating = initial_rating,
        updated_at = now()
    where current_rating is distinct from initial_rating;


    -- =====================================================
    -- 8. DELETE DERIVED EVENTS FOR THIS VERSION
    -- =====================================================
    --
    -- Chỉ xóa dữ liệu có thể rebuild.
    -- KHÔNG xóa rating_adjustments source ledger.
    --

    delete from public.rating_events
    where algorithm_version = p_algorithm_version;


    delete from public.rating_adjustment_events
    where algorithm_version = p_algorithm_version;


    -- =====================================================
    -- 9. REPLAY UNIFIED TIMELINE
    -- =====================================================

    for r_timeline in

        select *
        from (

            -- MATCH
            select
                'MATCH'::text as event_type,
                m.played_at as event_time,
                1::integer as event_type_order,

                m.id as event_id,

                m.id as match_id,
                m.match_number as match_number,
                m.match_type as match_type,
                m.score_mode as score_mode,
                m.team_a_score as team_a_score,
                m.team_b_score as team_b_score,
                mw.weight as configured_match_weight,

                null::uuid as adjustment_id,
                null::uuid as adjustment_player_id,
                null::numeric as adjustment_amount,
                null::bigint as replay_order

            from public.matches m

            join public.rating_match_weights mw
                on mw.match_type = m.match_type

            where m.status = 'APPROVED'
              and mw.weight > 0


            union all


            -- ADJUSTMENT
            select
                'ADJUSTMENT'::text as event_type,
                ra.effective_at as event_time,
                2::integer as event_type_order,

                ra.id as event_id,

                null::uuid as match_id,
                null::integer as match_number,
                null::text as match_type,
                null::text as score_mode,
                null::integer as team_a_score,
                null::integer as team_b_score,
                null::numeric as configured_match_weight,

                ra.id as adjustment_id,
                ra.player_id as adjustment_player_id,
                ra.amount as adjustment_amount,
                ra.replay_order as replay_order

            from public.rating_adjustments ra

        ) timeline

        order by
            event_time asc,
            event_type_order asc,
            match_number asc nulls last,
            replay_order asc nulls last,
            event_id asc

    loop


        -- =================================================
        -- 9A. MATCH
        -- =================================================

        if r_timeline.event_type = 'MATCH' then

            v_match_weight :=
                r_timeline.configured_match_weight;


            if v_match_weight is null
               or v_match_weight <= 0 then

                raise exception
                    'Match % có match weight không hợp lệ.',
                    r_timeline.match_id;

            end if;


            -- Validate 4 players / 2 vs 2

            select count(*)
            into v_count_total
            from public.match_players
            where match_id = r_timeline.match_id;


            select count(*)
            into v_count_a
            from public.match_players
            where match_id = r_timeline.match_id
              and team = 'A';


            select count(*)
            into v_count_b
            from public.match_players
            where match_id = r_timeline.match_id
              and team = 'B';


            if v_count_total <> 4
               or v_count_a <> 2
               or v_count_b <> 2 then

                raise exception
                    'Match % không hợp lệ: cần đúng 4 VĐV, Team A = 2, Team B = 2.',
                    r_timeline.match_id;

            end if;


            -- Team A snapshot BEFORE

            select avg(p.current_rating)
            into v_team_a_rating
            from public.match_players mp
            join public.players p
                on p.id = mp.player_id
            where mp.match_id = r_timeline.match_id
              and mp.team = 'A';


            -- Team B snapshot BEFORE

            select avg(p.current_rating)
            into v_team_b_rating
            from public.match_players mp
            join public.players p
                on p.id = mp.player_id
            where mp.match_id = r_timeline.match_id
              and mp.team = 'B';


            if v_team_a_rating is null
               or v_team_b_rating is null then

                raise exception
                    'Không tính được Team Rating cho match %.',
                    r_timeline.match_id;

            end if;


            -- Recency

            if v_latest_match_date is null then

                v_recency_weight := 1.0;

            else

                v_recency_weight :=
                    greatest(
                        v_recency_floor,
                        power(
                            0.5,
                            (
                                greatest(
                                    0,
                                    v_latest_match_date
                                    - r_timeline.event_time::date
                                )::numeric
                                /
                                v_recency_half_life_days
                            )
                        )
                    );

            end if;


            -- Actual performance

            if r_timeline.score_mode = 'POINTS' then

                if r_timeline.team_a_score is null
                   or r_timeline.team_b_score is null then

                    raise exception
                        'Match % dùng POINTS nhưng score bị NULL.',
                        r_timeline.match_id;

                end if;


                if r_timeline.team_a_score < 0
                   or r_timeline.team_b_score < 0 then

                    raise exception
                        'Match % có score âm.',
                        r_timeline.match_id;

                end if;


                if (
                    r_timeline.team_a_score
                    +
                    r_timeline.team_b_score
                ) <= 0 then

                    raise exception
                        'Match % dùng POINTS nhưng tổng điểm <= 0.',
                        r_timeline.match_id;

                end if;


                v_actual_a :=
                    r_timeline.team_a_score::numeric
                    /
                    (
                        r_timeline.team_a_score
                        +
                        r_timeline.team_b_score
                    )::numeric;


                v_actual_b :=
                    r_timeline.team_b_score::numeric
                    /
                    (
                        r_timeline.team_a_score
                        +
                        r_timeline.team_b_score
                    )::numeric;


            elsif r_timeline.score_mode = 'RESULT' then

                if r_timeline.team_a_score is null
                   or r_timeline.team_b_score is null then

                    raise exception
                        'Match % dùng RESULT nhưng score bị NULL.',
                        r_timeline.match_id;

                end if;


                if r_timeline.team_a_score < 0
                   or r_timeline.team_b_score < 0 then

                    raise exception
                        'Match % có score âm.',
                        r_timeline.match_id;

                end if;


                if r_timeline.team_a_score
                   > r_timeline.team_b_score then

                    v_actual_a := 1.0;
                    v_actual_b := 0.0;

                elsif r_timeline.team_a_score
                      < r_timeline.team_b_score then

                    v_actual_a := 0.0;
                    v_actual_b := 1.0;

                else

                    v_actual_a := 0.5;
                    v_actual_b := 0.5;

                end if;


            else

                raise exception
                    'score_mode không hợp lệ tại match %: %',
                    r_timeline.match_id,
                    r_timeline.score_mode;

            end if;


            -- Calculate all 4 players.
            -- Không update current_rating cho tới khi cả
            -- bốn rating_events đã được tạo.

            for r_player in

                select
                    mp.player_id,
                    mp.team,
                    p.current_rating

                from public.match_players mp

                join public.players p
                    on p.id = mp.player_id

                where mp.match_id = r_timeline.match_id

                order by
                    mp.team asc,
                    mp.player_id asc

            loop

                v_rating_before :=
                    r_player.current_rating;


                if r_player.team = 'A' then

                    v_team_rating :=
                        v_team_a_rating;

                    v_opponent_team_rating :=
                        v_team_b_rating;

                    v_actual_share :=
                        v_actual_a;


                elsif r_player.team = 'B' then

                    v_team_rating :=
                        v_team_b_rating;

                    v_opponent_team_rating :=
                        v_team_a_rating;

                    v_actual_share :=
                        v_actual_b;


                else

                    raise exception
                        'Player % trong match % có team không hợp lệ.',
                        r_player.player_id,
                        r_timeline.match_id;

                end if;


                v_expected_share :=
                    1.0
                    /
                    (
                        1.0
                        +
                        exp(
                            (
                                v_opponent_team_rating
                                -
                                v_team_rating
                            )
                            /
                            v_expected_sensitivity
                        )
                    );


                v_performance_gap :=
                    v_actual_share
                    -
                    v_expected_share;


                -- Chỉ MATCH events được tính vào provisional.

                select count(*)
                into v_previous_matches
                from public.rating_events re
                where re.player_id = r_player.player_id
                  and re.algorithm_version =
                      p_algorithm_version;


                if v_previous_matches
                   < v_provisional_matches then

                    v_provisional_factor := 1.25;

                elsif v_previous_matches
                      < v_stable_matches then

                    v_provisional_factor := 1.10;

                else

                    v_provisional_factor := 1.00;

                end if;


                v_rating_delta :=
                    v_performance_gap
                    *
                    v_k_factor
                    *
                    v_match_weight
                    *
                    v_recency_weight
                    *
                    v_provisional_factor;


                -- Match delta cap

                v_rating_delta :=
                    greatest(
                        -v_delta_cap,
                        least(
                            v_delta_cap,
                            v_rating_delta
                        )
                    );


                v_rating_after :=
                    greatest(
                        v_min_rating,
                        least(
                            v_max_rating,
                            v_rating_before
                            +
                            v_rating_delta
                        )
                    );


                insert into public.rating_events (
                    match_id,
                    player_id,
                    algorithm_version,
                    rating_before,
                    team_rating,
                    opponent_team_rating,
                    expected_share,
                    actual_share,
                    performance_gap,
                    match_weight,
                    recency_weight,
                    provisional_factor,
                    rating_delta,
                    rating_after
                )
                values (
                    r_timeline.match_id,
                    r_player.player_id,
                    p_algorithm_version,
                    v_rating_before,
                    v_team_rating,
                    v_opponent_team_rating,
                    v_expected_share,
                    v_actual_share,
                    v_performance_gap,
                    v_match_weight,
                    v_recency_weight,
                    v_provisional_factor,
                    v_rating_delta,
                    v_rating_after
                );


                v_event_count :=
                    v_event_count + 1;

            end loop;


            -- Sau khi đủ 4 events mới update players.

            update public.players p
            set
                current_rating = re.rating_after,
                updated_at = now()
            from public.rating_events re
            where re.match_id = r_timeline.match_id
              and re.algorithm_version =
                  p_algorithm_version
              and re.player_id = p.id;


            v_match_count :=
                v_match_count + 1;


        -- =================================================
        -- 9B. ADJUSTMENT
        -- =================================================

        elsif r_timeline.event_type = 'ADJUSTMENT' then


            if r_timeline.adjustment_id is null then

                raise exception
                    'Adjustment timeline có adjustment_id NULL.';

            end if;


            if r_timeline.adjustment_player_id is null then

                raise exception
                    'Adjustment % có player_id NULL.',
                    r_timeline.adjustment_id;

            end if;


            if r_timeline.adjustment_amount is null
               or r_timeline.adjustment_amount = 0 then

                raise exception
                    'Adjustment % có amount không hợp lệ.',
                    r_timeline.adjustment_id;

            end if;


            if r_timeline.replay_order is null then

                raise exception
                    'Adjustment % không có replay_order.',
                    r_timeline.adjustment_id;

            end if;


            -- Rating tại đúng vị trí lịch sử của Adjustment.

            select p.current_rating
            into v_rating_before
            from public.players p
            where p.id =
                r_timeline.adjustment_player_id;


            if not found then

                raise exception
                    'Không tìm thấy player % của adjustment %.',
                    r_timeline.adjustment_player_id,
                    r_timeline.adjustment_id;

            end if;


            -- Requested amount có thể lớn hơn phần thực tế
            -- áp dụng vì min/max clamp.

            v_rating_after :=
                greatest(
                    v_min_rating,
                    least(
                        v_max_rating,
                        v_rating_before
                        +
                        r_timeline.adjustment_amount
                    )
                );


            -- Applied delta là thay đổi THỰC TẾ sau clamp.

            v_adjustment_applied_delta :=
                v_rating_after
                -
                v_rating_before;


            -- Derived Adjustment Event.
            --
            -- Source rating_adjustments không bị sửa/xóa.

            insert into public.rating_adjustment_events (
                adjustment_id,
                player_id,
                algorithm_version,
                rating_before,
                requested_amount,
                applied_delta,
                rating_after
            )
            values (
                r_timeline.adjustment_id,
                r_timeline.adjustment_player_id,
                p_algorithm_version,
                v_rating_before,
                r_timeline.adjustment_amount,
                v_adjustment_applied_delta,
                v_rating_after
            );


            -- Sau khi derived event được ghi thành công
            -- mới cập nhật current projection.

            update public.players
            set
                current_rating = v_rating_after,
                updated_at = now()
            where id =
                r_timeline.adjustment_player_id;


            v_adjustment_count :=
                v_adjustment_count + 1;

            v_adjustment_event_count :=
                v_adjustment_event_count + 1;


        else

            raise exception
                'event_type không hợp lệ trong Rating timeline: %',
                r_timeline.event_type;

        end if;

    end loop;


    -- =====================================================
    -- 10. AUDIT REBUILD
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
        p_actor_user_id,
        'REBUILD_RATINGS',
        'rating_events',
        null,
        null,
        jsonb_build_object(
            'algorithm_version',
                p_algorithm_version,

            'matches_processed',
                v_match_count,

            'rating_events_created',
                v_event_count,

            'adjustments_processed',
                v_adjustment_count,

            'rating_adjustment_events_created',
                v_adjustment_event_count,

            'timeline_order',
                'event_time ASC, MATCH before ADJUSTMENT, business order, id',

            'engine',
                'V1.1_INTERNAL_ADJUSTMENT_EVENTS'
        ),
        'Rebuild toàn bộ Club Rating gồm Match và Rating Adjustment',
        now()
    );


    -- =====================================================
    -- 11. RETURN
    -- =====================================================

    return jsonb_build_object(
        'success',
            true,

        'algorithm_version',
            p_algorithm_version,

        'matches_processed',
            v_match_count,

        'rating_events_created',
            v_event_count,

        'adjustments_processed',
            v_adjustment_count,

        'rating_adjustment_events_created',
            v_adjustment_event_count
    );

end;
$function$
