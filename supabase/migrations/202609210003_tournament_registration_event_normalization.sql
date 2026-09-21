-- MTR01 - Tournament registration event-name normalization
-- Store trimmed display value, compare normalized key case-insensitively.

alter table public.tournament_registrations
  drop constraint if exists tournament_registrations_event_name_max_length;

alter table public.tournament_registrations
  add constraint tournament_registrations_event_name_max_length
  check (char_length(btrim(event_name)) <= 200);

create or replace function public.guard_tournament_registration_players()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
    new.event_name := btrim(new.event_name);

    if new.event_name = '' then
        raise exception 'EVENT_NAME_REQUIRED';
    end if;

    if char_length(new.event_name) > 200 then
        raise exception 'EVENT_NAME_TOO_LONG';
    end if;

    -- Registration đã hủy không chiếm suất.
    if new.status = 'HUY' then
        return new;
    end if;

    -- Không cho player chính xuất hiện ở registration hoạt động khác
    -- cùng giải + cùng nội dung đã normalize.
    if exists (
        select 1
        from public.tournament_registrations tr
        where tr.tournament_id = new.tournament_id
          and lower(btrim(tr.event_name)) =
              lower(btrim(new.event_name))
          and tr.status <> 'HUY'
          and tr.id <> new.id
          and (
              tr.player_id = new.player_id
              or tr.partner_player_id = new.player_id
          )
    ) then
        raise exception
            'PLAYER_ALREADY_REGISTERED_FOR_EVENT';
    end if;

    -- Partner cũng chỉ được xuất hiện một lần
    -- trong cùng tournament + normalized event.
    if new.partner_player_id is not null
       and exists (
            select 1
            from public.tournament_registrations tr
            where tr.tournament_id = new.tournament_id
              and lower(btrim(tr.event_name)) =
                  lower(btrim(new.event_name))
              and tr.status <> 'HUY'
              and tr.id <> new.id
              and (
                  tr.player_id = new.partner_player_id
                  or tr.partner_player_id = new.partner_player_id
              )
       )
    then
        raise exception
            'PARTNER_ALREADY_REGISTERED_FOR_EVENT';
    end if;

    return new;
end;
$function$;

create or replace function public.create_my_tournament_registration(
    p_tournament_id uuid,
    p_event_name text,
    p_partner_player_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
    v_actor uuid;
    v_profile public.profiles%rowtype;
    v_tournament public.tournaments%rowtype;
    v_player public.players%rowtype;
    v_partner public.players%rowtype;
    v_registration public.tournament_registrations%rowtype;
    v_player_id uuid;
    v_event_name text;
    v_fee_due numeric;
begin
    v_actor := auth.uid();

    if v_actor is null then
        raise exception 'AUTH_REQUIRED';
    end if;

    select *
    into v_profile
    from public.profiles
    where id = v_actor;

    if not found then
        raise exception 'PROFILE_NOT_FOUND';
    end if;

    if v_profile.is_active is not true then
        raise exception 'ACCOUNT_INACTIVE';
    end if;

    if upper(coalesce(v_profile.role, '')) <> 'MEMBER' then
        raise exception 'MEMBER_ROLE_REQUIRED';
    end if;

    v_player_id := v_profile.player_id;

    if v_player_id is null then
        raise exception 'PLAYER_LINK_REQUIRED';
    end if;

    if p_tournament_id is null then
        raise exception 'TOURNAMENT_ID_REQUIRED';
    end if;

    v_event_name := nullif(btrim(p_event_name), '');

    if v_event_name is null then
        raise exception 'EVENT_NAME_REQUIRED';
    end if;

    if char_length(v_event_name) > 200 then
        raise exception 'EVENT_NAME_TOO_LONG';
    end if;

    select *
    into v_tournament
    from public.tournaments
    where id = p_tournament_id
    for share;

    if not found then
        raise exception 'TOURNAMENT_NOT_FOUND';
    end if;

    if v_tournament.status <> 'MO_DANG_KY' then
        raise exception
            'TOURNAMENT_NOT_OPEN_FOR_MEMBER_REGISTRATION: %',
            v_tournament.status;
    end if;

    select *
    into v_player
    from public.players
    where id = v_player_id;

    if not found then
        raise exception 'PLAYER_NOT_FOUND';
    end if;

    if upper(coalesce(v_player.status, '')) <> 'ACTIVE' then
        raise exception 'PLAYER_INACTIVE';
    end if;

    if upper(coalesce(v_player.player_type, '')) <> 'CLUB' then
        raise exception 'CLUB_PLAYER_REQUIRED';
    end if;

    if p_partner_player_id is not null then
        if p_partner_player_id = v_player_id then
            raise exception 'PARTNER_CANNOT_BE_SELF';
        end if;

        select *
        into v_partner
        from public.players
        where id = p_partner_player_id;

        if not found then
            raise exception 'PARTNER_NOT_FOUND';
        end if;

        if upper(coalesce(v_partner.status, '')) <> 'ACTIVE' then
            raise exception 'PARTNER_INACTIVE';
        end if;
    end if;

    v_fee_due :=
        coalesce(
            v_tournament.registration_fee,
            0
        );

    if v_fee_due < 0 then
        raise exception 'FEE_DUE_MUST_BE_NONNEGATIVE';
    end if;

    perform pg_advisory_xact_lock(
        hashtextextended(
            p_tournament_id::text || '|' ||
            lower(v_event_name),
            0
        )
    );

    if exists (
        select 1
        from public.tournament_registrations tr
        where tr.tournament_id = p_tournament_id
          and lower(btrim(tr.event_name)) =
              lower(v_event_name)
          and tr.status <> 'HUY'
          and (
              tr.player_id = v_player_id
              or tr.partner_player_id = v_player_id
          )
    ) then
        raise exception
            'PLAYER_ALREADY_REGISTERED_FOR_EVENT';
    end if;

    if p_partner_player_id is not null
       and exists (
            select 1
            from public.tournament_registrations tr
            where tr.tournament_id = p_tournament_id
              and lower(btrim(tr.event_name)) =
                  lower(v_event_name)
              and tr.status <> 'HUY'
              and (
                  tr.player_id = p_partner_player_id
                  or tr.partner_player_id =
                      p_partner_player_id
              )
       )
    then
        raise exception
            'PARTNER_ALREADY_REGISTERED_FOR_EVENT';
    end if;

    insert into public.tournament_registrations (
        tournament_id,
        player_id,
        event_name,
        partner_player_id,
        fee_due,
        status
    )
    values (
        p_tournament_id,
        v_player_id,
        v_event_name,
        p_partner_player_id,
        v_fee_due,
        'DANG_KY'
    )
    returning *
    into v_registration;

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
        'CREATE_MY_TOURNAMENT_REGISTRATION',
        'tournament_registrations',
        v_registration.id,
        null,
        to_jsonb(v_registration),
        'Thành viên tự đăng ký tham gia giải'
    );

    return jsonb_build_object(
        'success', true,
        'registration_id', v_registration.id,
        'tournament_id', v_registration.tournament_id,
        'player_id', v_registration.player_id,
        'event_name', v_registration.event_name,
        'partner_player_id',
            v_registration.partner_player_id,
        'fee_due', v_registration.fee_due,
        'status', v_registration.status,
        'created_at', v_registration.created_at
    );
end;
$function$;

create or replace function public.create_tournament_registration(
    p_tournament_id uuid,
    p_player_id uuid,
    p_event_name text,
    p_partner_player_id uuid default null,
    p_fee_due numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
    v_actor uuid;
    v_profile public.profiles%rowtype;
    v_tournament public.tournaments%rowtype;
    v_player public.players%rowtype;
    v_partner public.players%rowtype;
    v_registration public.tournament_registrations%rowtype;
    v_event_name text;
    v_fee_due numeric;
begin
    v_actor := auth.uid();

    if v_actor is null then
        raise exception 'AUTH_REQUIRED';
    end if;

    select *
    into v_profile
    from public.profiles
    where id = v_actor;

    if not found then
        raise exception 'PROFILE_NOT_FOUND';
    end if;

    if v_profile.is_active is not true then
        raise exception 'ACCOUNT_INACTIVE';
    end if;

    if upper(coalesce(v_profile.role, '')) <> 'ADMIN' then
        raise exception 'ADMIN_REQUIRED';
    end if;

    if p_tournament_id is null then
        raise exception 'TOURNAMENT_ID_REQUIRED';
    end if;

    if p_player_id is null then
        raise exception 'PLAYER_ID_REQUIRED';
    end if;

    v_event_name := nullif(btrim(p_event_name), '');

    if v_event_name is null then
        raise exception 'EVENT_NAME_REQUIRED';
    end if;

    if char_length(v_event_name) > 200 then
        raise exception 'EVENT_NAME_TOO_LONG';
    end if;

    select *
    into v_tournament
    from public.tournaments
    where id = p_tournament_id
    for share;

    if not found then
        raise exception 'TOURNAMENT_NOT_FOUND';
    end if;

    if v_tournament.status not in (
        'DU_KIEN',
        'MO_DANG_KY'
    ) then
        raise exception
            'TOURNAMENT_NOT_OPEN_FOR_REGISTRATION: %',
            v_tournament.status;
    end if;

    select *
    into v_player
    from public.players
    where id = p_player_id;

    if not found then
        raise exception 'PLAYER_NOT_FOUND';
    end if;

    if upper(coalesce(v_player.status, '')) <> 'ACTIVE' then
        raise exception 'PLAYER_INACTIVE';
    end if;

    if p_partner_player_id is not null then
        if p_partner_player_id = p_player_id then
            raise exception 'PARTNER_CANNOT_BE_SELF';
        end if;

        select *
        into v_partner
        from public.players
        where id = p_partner_player_id;

        if not found then
            raise exception 'PARTNER_NOT_FOUND';
        end if;

        if upper(coalesce(v_partner.status, '')) <> 'ACTIVE' then
            raise exception 'PARTNER_INACTIVE';
        end if;
    end if;

    v_fee_due :=
        coalesce(
            p_fee_due,
            v_tournament.registration_fee,
            0
        );

    if v_fee_due < 0 then
        raise exception 'FEE_DUE_MUST_BE_NONNEGATIVE';
    end if;

    perform pg_advisory_xact_lock(
        hashtextextended(
            p_tournament_id::text || '|' ||
            lower(v_event_name),
            0
        )
    );

    if exists (
        select 1
        from public.tournament_registrations tr
        where tr.tournament_id = p_tournament_id
          and lower(btrim(tr.event_name)) =
              lower(v_event_name)
          and tr.status <> 'HUY'
          and (
              tr.player_id = p_player_id
              or tr.partner_player_id = p_player_id
          )
    ) then
        raise exception
            'PLAYER_ALREADY_REGISTERED_FOR_EVENT';
    end if;

    if p_partner_player_id is not null
       and exists (
            select 1
            from public.tournament_registrations tr
            where tr.tournament_id = p_tournament_id
              and lower(btrim(tr.event_name)) =
                  lower(v_event_name)
              and tr.status <> 'HUY'
              and (
                  tr.player_id = p_partner_player_id
                  or tr.partner_player_id =
                      p_partner_player_id
              )
       )
    then
        raise exception
            'PARTNER_ALREADY_REGISTERED_FOR_EVENT';
    end if;

    insert into public.tournament_registrations (
        tournament_id,
        player_id,
        event_name,
        partner_player_id,
        fee_due,
        status
    )
    values (
        p_tournament_id,
        p_player_id,
        v_event_name,
        p_partner_player_id,
        v_fee_due,
        'DANG_KY'
    )
    returning *
    into v_registration;

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
        'CREATE_TOURNAMENT_REGISTRATION',
        'tournament_registrations',
        v_registration.id,
        null,
        to_jsonb(v_registration),
        'Đăng ký VĐV tham gia giải'
    );

    return jsonb_build_object(
        'success', true,
        'registration_id', v_registration.id,
        'tournament_id', v_registration.tournament_id,
        'player_id', v_registration.player_id,
        'event_name', v_registration.event_name,
        'partner_player_id',
            v_registration.partner_player_id,
        'fee_due', v_registration.fee_due,
        'status', v_registration.status,
        'created_at', v_registration.created_at
    );
end;
$function$;

revoke all on function public.guard_tournament_registration_players()
from public, anon, authenticated;

revoke all on function public.create_my_tournament_registration(
    uuid, text, uuid
) from public, anon;

grant execute on function public.create_my_tournament_registration(
    uuid, text, uuid
) to authenticated;

revoke all on function public.create_tournament_registration(
    uuid, uuid, text, uuid, numeric
) from public, anon;

grant execute on function public.create_tournament_registration(
    uuid, uuid, text, uuid, numeric
) to authenticated;
