-- PERM01B-4 Member Permissions
-- Generated from current production function definitions.

CREATE OR REPLACE FUNCTION public.create_player(p_full_name text, p_player_type text DEFAULT 'CLUB'::text, p_phone text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_initial_rating numeric DEFAULT NULL::numeric, p_joined_at date DEFAULT NULL::date, p_date_of_birth date DEFAULT NULL::date, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_actor uuid;
    v_name text;
    v_type text;
    v_player public.players%rowtype;

    v_default_rating numeric;
    v_min_rating numeric;
    v_max_rating numeric;
    v_initial_rating numeric;
begin
    v_actor := auth.uid();

    if v_actor is null then
        raise exception 'AUTH_REQUIRED';
    end if;

    if not exists (
        select 1
        from public.profiles p
        where p.id = v_actor
          and (
              upper(coalesce(p.role, '')) = 'ADMIN'
              or coalesce(p.can_manage_members, false)
          )
          and p.is_active = true
    ) then
        raise exception 'MEMBER_MANAGEMENT_PERMISSION_REQUIRED';
    end if;

    select
        rs.initial_rating,
        rs.min_rating,
        rs.max_rating
    into
        v_default_rating,
        v_min_rating,
        v_max_rating
    from public.rating_settings rs
    where rs.is_active = true;

    if not found then
        raise exception 'ACTIVE_RATING_SETTINGS_REQUIRED';
    end if;

    v_name :=
        nullif(
            trim(p_full_name),
            ''
        );

    if v_name is null then
        raise exception 'PLAYER_NAME_REQUIRED';
    end if;

    v_type :=
        upper(
            trim(
                coalesce(
                    p_player_type,
                    ''
                )
            )
        );

    if v_type not in (
        'CLUB',
        'GUEST'
    ) then
        raise exception 'INVALID_PLAYER_TYPE';
    end if;

    v_initial_rating :=
        coalesce(
            p_initial_rating,
            v_default_rating
        );

    if v_initial_rating < v_min_rating
       or v_initial_rating > v_max_rating then
        raise exception 'INVALID_INITIAL_RATING';
    end if;

    if p_date_of_birth is not null
       and p_date_of_birth > current_date then
        raise exception 'INVALID_DATE_OF_BIRTH';
    end if;

    insert into public.players (
        full_name,
        player_type,
        phone,
        email,
        initial_rating,
        current_rating,
        status,
        joined_at,
        date_of_birth,
        notes
    )
    values (
        v_name,
        v_type,
        nullif(trim(p_phone), ''),
        nullif(trim(p_email), ''),
        v_initial_rating,
        v_initial_rating,
        'ACTIVE',
        p_joined_at,
        p_date_of_birth,
        nullif(trim(p_notes), '')
    )
    returning *
    into v_player;

    insert into public.audit_logs (
        user_id,
        action,
        table_name,
        record_id,
        old_data,
        new_data,
        reason
    )
    values (
        v_actor,
        'CREATE_PLAYER',
        'players',
        v_player.id,
        null,
        to_jsonb(v_player),
        'PLAYER_WRITE_API_ACTIVE_RATING_SETTINGS'
    );

    return jsonb_build_object(
        'success', true,
        'player_id', v_player.id,
        'full_name', v_player.full_name,
        'player_type', v_player.player_type,
        'status', v_player.status,
        'initial_rating', v_player.initial_rating,
        'current_rating', v_player.current_rating,
        'date_of_birth', v_player.date_of_birth
    );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_admin_member_promotion_candidates()
 RETURNS TABLE(profile_id uuid, profile_full_name text, player_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_actor uuid;
    v_actor_profile public.profiles%rowtype;
begin
    v_actor := auth.uid();

    if v_actor is null then
        raise exception 'AUTH_REQUIRED';
    end if;

    select *
    into v_actor_profile
    from public.profiles
    where id = v_actor;

    if not found
       or v_actor_profile.is_active <> true
       or (
           upper(coalesce(v_actor_profile.role, '')) <> 'ADMIN'
           and coalesce(v_actor_profile.can_manage_members, false) = false
       ) then
        raise exception 'MEMBER_MANAGEMENT_PERMISSION_REQUIRED';
    end if;

    return query
    select
        p.id,
        p.full_name,
        p.player_id
    from public.profiles p
    where p.role = 'MEMBER'
      and p.is_active = true
      and p.player_id is not null
    order by p.full_name, p.id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_admin_member_promotion_preview(p_profile_id uuid, p_guest_player_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_actor uuid;
    v_actor_profile public.profiles%rowtype;
    v_profile public.profiles%rowtype;
    v_temp public.players%rowtype;
    v_guest public.players%rowtype;

    v_match_players bigint;
    v_rating_events bigint;
    v_rating_adjustments bigint;
    v_rating_adjustment_events bigint;
    v_fund_contributions bigint;
    v_fund_payments bigint;
    v_fund_transactions bigint;
    v_tournament_registrations bigint;
    v_tournament_payments bigint;
    v_awards bigint;

    v_guest_matches bigint;
    v_guest_ratings bigint;
    v_guest_links bigint;
begin
    -- Actor must be an authenticated, active ADMIN.
    v_actor := auth.uid();

    if v_actor is null then
        raise exception 'AUTH_REQUIRED';
    end if;

    select *
    into v_actor_profile
    from public.profiles
    where id = v_actor;

    if not found
       or v_actor_profile.is_active <> true
       or (
           upper(coalesce(v_actor_profile.role, '')) <> 'ADMIN'
           and coalesce(v_actor_profile.can_manage_members, false) = false
       ) then
        raise exception 'MEMBER_MANAGEMENT_PERMISSION_REQUIRED';
    end if;

    -- Target account must still be an active MEMBER linked to a Player.
    select *
    into v_profile
    from public.profiles
    where id = p_profile_id
      and role = 'MEMBER'
      and is_active = true
      and player_id is not null;

    if not found then
        raise exception 'MEMBER_NOT_ELIGIBLE';
    end if;

    -- Current/temp Player must still be CLUB ACTIVE.
    select *
    into v_temp
    from public.players
    where id = v_profile.player_id;

    if not found
       or v_temp.player_type <> 'CLUB'
       or v_temp.status <> 'ACTIVE' then
        raise exception 'TEMP_PLAYER_NOT_ELIGIBLE';
    end if;

    -- Guest must still be GUEST ACTIVE and different from temp Player.
    select *
    into v_guest
    from public.players
    where id = p_guest_player_id;

    if not found
       or v_guest.player_type <> 'GUEST'
       or v_guest.status <> 'ACTIVE'
       or v_guest.id = v_temp.id then
        raise exception 'GUEST_NOT_ELIGIBLE';
    end if;

    -- Authoritative business-data checks for the temp Player.
    select count(*) into v_match_players
    from public.match_players
    where player_id = v_temp.id;

    select count(*) into v_rating_events
    from public.rating_events
    where player_id = v_temp.id;

    select count(*) into v_rating_adjustments
    from public.rating_adjustments
    where player_id = v_temp.id;

    select count(*) into v_rating_adjustment_events
    from public.rating_adjustment_events
    where player_id = v_temp.id;

    select count(*) into v_fund_contributions
    from public.fund_contributions
    where player_id = v_temp.id;

    select count(*) into v_fund_payments
    from public.fund_payments
    where player_id = v_temp.id;

    select count(*) into v_fund_transactions
    from public.fund_transactions
    where player_id = v_temp.id;

    select count(*) into v_tournament_registrations
    from public.tournament_registrations
    where player_id = v_temp.id
       or partner_player_id = v_temp.id;

    select count(*) into v_tournament_payments
    from public.tournament_payments
    where player_id = v_temp.id;

    select count(*) into v_awards
    from public.awards
    where player_id = v_temp.id;

    -- Useful Guest history for preview.
    select count(*) into v_guest_matches
    from public.match_players
    where player_id = v_guest.id;

    select count(*) into v_guest_ratings
    from public.rating_events
    where player_id = v_guest.id;

    -- UNIQUE(player_id) should make this 0 or 1, but count defensively.
    select count(*) into v_guest_links
    from public.profiles
    where player_id = v_guest.id;

    return jsonb_build_object(
        'profile', jsonb_build_object(
            'id', v_profile.id,
            'full_name', v_profile.full_name,
            'player_id', v_profile.player_id
        ),
        'temp', jsonb_build_object(
            'id', v_temp.id,
            'full_name', v_temp.full_name,
            'player_type', v_temp.player_type,
            'status', v_temp.status,
            'current_rating', v_temp.current_rating
        ),
        'target', jsonb_build_object(
            'id', v_guest.id,
            'full_name', v_guest.full_name,
            'player_type', v_guest.player_type,
            'status', v_guest.status,
            'current_rating', v_guest.current_rating
        ),
        'counts', jsonb_build_array(
            v_match_players,
            v_rating_events,
            v_rating_adjustments,
            v_rating_adjustment_events,
            v_fund_contributions,
            v_fund_payments,
            v_fund_transactions,
            v_tournament_registrations,
            v_tournament_payments,
            v_awards
        ),
        'matches', v_guest_matches,
        'ratings', v_guest_ratings,
        'links', v_guest_links,
        'blocked',
            v_guest_links > 0
            or v_match_players > 0
            or v_rating_events > 0
            or v_rating_adjustments > 0
            or v_rating_adjustment_events > 0
            or v_fund_contributions > 0
            or v_fund_payments > 0
            or v_fund_transactions > 0
            or v_tournament_registrations > 0
            or v_tournament_payments > 0
            or v_awards > 0
    );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.promote_guest_player_to_member(p_profile_id uuid, p_guest_player_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_actor_id uuid := auth.uid();

    v_profile public.profiles%rowtype;
    v_temp public.players%rowtype;
    v_guest public.players%rowtype;

    v_business_count bigint;
begin
    if v_actor_id is null then
        raise exception 'AUTH_REQUIRED';
    end if;

    if not exists (
        select 1
        from public.profiles p
        where p.id = v_actor_id
          and p.is_active = true
          and (
              upper(coalesce(p.role, '')) = 'ADMIN'
              or coalesce(p.can_manage_members, false)
          )
    ) then
        raise exception 'MEMBER_MANAGEMENT_PERMISSION_REQUIRED';
    end if;

    select *
    into v_profile
    from public.profiles
    where id = p_profile_id
    for update;

    if not found then
        raise exception 'PROFILE_NOT_FOUND';
    end if;

    if v_profile.role <> 'MEMBER' then
        raise exception 'TARGET_PROFILE_MUST_BE_MEMBER';
    end if;

    if not v_profile.is_active then
        raise exception 'TARGET_PROFILE_INACTIVE';
    end if;

    if v_profile.player_id is null then
        raise exception 'TARGET_PROFILE_HAS_NO_TEMP_PLAYER';
    end if;

    if v_profile.player_id = p_guest_player_id then
        raise exception 'PROFILE_ALREADY_LINKED_TO_TARGET_PLAYER';
    end if;

    select *
    into v_temp
    from public.players
    where id = v_profile.player_id
    for update;

    if not found then
        raise exception 'TEMP_PLAYER_NOT_FOUND';
    end if;

    if v_temp.player_type <> 'CLUB'
       or v_temp.status <> 'ACTIVE' then
        raise exception 'TEMP_PLAYER_NOT_ACTIVE_CLUB';
    end if;

    select *
    into v_guest
    from public.players
    where id = p_guest_player_id
    for update;

    if not found then
        raise exception 'GUEST_PLAYER_NOT_FOUND';
    end if;

    if v_guest.player_type <> 'GUEST'
       or v_guest.status <> 'ACTIVE' then
        raise exception 'TARGET_PLAYER_NOT_ACTIVE_GUEST';
    end if;

    if exists (
        select 1
        from public.profiles p
        where p.player_id = p_guest_player_id
          and p.id <> p_profile_id
    ) then
        raise exception 'GUEST_PLAYER_ALREADY_LINKED';
    end if;

    select
          (select count(*) from public.match_players x
            where x.player_id = v_temp.id)

        + (select count(*) from public.rating_events x
            where x.player_id = v_temp.id)

        + (select count(*) from public.rating_adjustments x
            where x.player_id = v_temp.id)

        + (select count(*) from public.rating_adjustment_events x
            where x.player_id = v_temp.id)

        + (select count(*) from public.fund_contributions x
            where x.player_id = v_temp.id)

        + (select count(*) from public.fund_payments x
            where x.player_id = v_temp.id)

        + (select count(*) from public.fund_transactions x
            where x.player_id = v_temp.id)

        + (select count(*) from public.tournament_registrations x
            where x.player_id = v_temp.id
               or x.partner_player_id = v_temp.id)

        + (select count(*) from public.tournament_payments x
            where x.player_id = v_temp.id)

        + (select count(*) from public.awards x
            where x.player_id = v_temp.id)

    into v_business_count;

    if v_business_count <> 0 then
        raise exception 'TEMP_PLAYER_HAS_BUSINESS_DATA';
    end if;

    /*
     * Không thay initial_rating/current_rating của GUEST.
     * Không di chuyển Rating events.
     * Không di chuyển lịch sử trận.
     */

    update public.players
    set
        player_type = 'CLUB',
        updated_at = now()
    where id = v_guest.id;

    /*
     * Phải unlink trước vì profiles.player_id đang UNIQUE.
     */
    update public.profiles
    set player_id = null
    where id = v_profile.id;

    update public.players
    set
        status = 'INACTIVE',
        updated_at = now()
    where id = v_temp.id;

    update public.profiles
    set player_id = v_guest.id
    where id = v_profile.id;

    insert into public.audit_logs (
        user_id,
        action,
        table_name,
        record_id,
        old_data,
        new_data,
        reason
    )
    values (
        v_actor_id,
        'PROMOTE_GUEST_TO_MEMBER',
        'profiles',
        v_profile.id,
        jsonb_build_object(
            'profile_id', v_profile.id,
            'old_player_id', v_temp.id,
            'old_player_name', v_temp.full_name,
            'guest_player_id', v_guest.id,
            'guest_player_name', v_guest.full_name
        ),
        jsonb_build_object(
            'profile_id', v_profile.id,
            'player_id', v_guest.id,
            'player_type', 'CLUB',
            'preserved_rating', v_guest.current_rating,
            'temporary_player_id', v_temp.id,
            'temporary_player_status', 'INACTIVE'
        ),
        'ADMIN_CONFIRMED_EXISTING_GUEST_AS_MEMBER'
    );

    return jsonb_build_object(
        'ok', true,
        'profile_id', v_profile.id,
        'player_id', v_guest.id,
        'temporary_player_id', v_temp.id,
        'rating_preserved', v_guest.current_rating
    );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_player(p_player_id uuid, p_full_name text, p_player_type text, p_phone text, p_email text, p_status text, p_joined_at date, p_date_of_birth date, p_notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_actor uuid;
    v_name text;
    v_type text;
    v_status text;
    v_old public.players%rowtype;
    v_new public.players%rowtype;
begin
    v_actor := auth.uid();

    if v_actor is null then
        raise exception 'AUTH_REQUIRED';
    end if;

    if not exists (
        select 1
        from public.profiles p
        where p.id = v_actor
          and (
              upper(coalesce(p.role, '')) = 'ADMIN'
              or coalesce(p.can_manage_members, false)
          )
          and p.is_active = true
    ) then
        raise exception 'MEMBER_MANAGEMENT_PERMISSION_REQUIRED';
    end if;

    select *
    into v_old
    from public.players
    where id = p_player_id
    for update;

    if not found then
        raise exception 'PLAYER_NOT_FOUND';
    end if;

    v_name := nullif(trim(p_full_name), '');

    if v_name is null then
        raise exception 'PLAYER_NAME_REQUIRED';
    end if;

    v_type := upper(trim(coalesce(p_player_type, '')));

    if v_type not in ('CLUB', 'GUEST') then
        raise exception 'INVALID_PLAYER_TYPE';
    end if;

    v_status := upper(trim(coalesce(p_status, '')));

    if v_status not in ('ACTIVE', 'INACTIVE') then
        raise exception 'INVALID_PLAYER_STATUS';
    end if;

    if p_date_of_birth is not null
       and p_date_of_birth > current_date then
        raise exception 'INVALID_DATE_OF_BIRTH';
    end if;

    update public.players
    set
        full_name = v_name,
        player_type = v_type,
        phone = nullif(trim(p_phone), ''),
        email = nullif(trim(p_email), ''),
        status = v_status,
        joined_at = p_joined_at,
        date_of_birth = p_date_of_birth,
        notes = nullif(trim(p_notes), ''),
        updated_at = now()
    where id = p_player_id
    returning *
    into v_new;

    insert into public.audit_logs (
        user_id,
        action,
        table_name,
        record_id,
        old_data,
        new_data,
        reason
    )
    values (
        v_actor,
        'UPDATE_PLAYER',
        'players',
        v_new.id,
        to_jsonb(v_old),
        to_jsonb(v_new),
        'PLAYER_WRITE_API_V1'
    );

    return jsonb_build_object(
        'success', true,
        'player_id', v_new.id,
        'full_name', v_new.full_name,
        'player_type', v_new.player_type,
        'status', v_new.status,
        'date_of_birth', v_new.date_of_birth
    );
end;
$function$
;


CREATE OR REPLACE FUNCTION public.get_member_management_players()
RETURNS SETOF public.players
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_actor uuid;
    v_profile public.profiles%rowtype;
BEGIN
    v_actor := auth.uid();

    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED';
    END IF;

    SELECT *
    INTO v_profile
    FROM public.profiles
    WHERE id = v_actor;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PROFILE_NOT_FOUND';
    END IF;

    IF coalesce(v_profile.is_active, false) = false THEN
        RAISE EXCEPTION 'PROFILE_INACTIVE';
    END IF;

    IF NOT (
        upper(coalesce(v_profile.role, '')) = 'ADMIN'
        OR coalesce(v_profile.can_manage_members, false)
    ) THEN
        RAISE EXCEPTION 'MEMBER_MANAGEMENT_PERMISSION_REQUIRED';
    END IF;

    RETURN QUERY
    SELECT p.*
    FROM public.players p
    ORDER BY p.full_name ASC, p.id ASC;
END;
$function$;

REVOKE ALL
ON FUNCTION public.get_member_management_players()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.get_member_management_players()
FROM anon;

GRANT EXECUTE
ON FUNCTION public.get_member_management_players()
TO authenticated;
