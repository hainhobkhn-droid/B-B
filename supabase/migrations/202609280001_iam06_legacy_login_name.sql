-- IAM06 — Legacy login_name claim / ADMIN assignment
-- Additive only. No data backfill. No schema rename.

create or replace function public.claim_my_nickname(
    p_nickname text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
    v_actor uuid;
    v_profile public.profiles%rowtype;
    v_login_name text;
begin
    v_actor := auth.uid();

    if v_actor is null then
        raise exception 'AUTH_REQUIRED';
    end if;

    select *
    into v_profile
    from public.profiles
    where id = v_actor
    for update;

    if not found then
        raise exception 'PROFILE_NOT_FOUND';
    end if;

    if coalesce(v_profile.is_active, false) is not true then
        raise exception 'ACCOUNT_INACTIVE';
    end if;

    if upper(coalesce(v_profile.role, '')) <> 'MEMBER' then
        raise exception 'MEMBER_ROLE_REQUIRED';
    end if;

    if nullif(btrim(v_profile.login_name), '') is not null then
        raise exception 'LOGIN_NAME_ALREADY_SET';
    end if;

    v_login_name := lower(btrim(coalesce(p_nickname, '')));

    if v_login_name = '' then
        raise exception 'LOGIN_NAME_REQUIRED';
    end if;

    if char_length(v_login_name) < 3
       or char_length(v_login_name) > 32 then
        raise exception 'LOGIN_NAME_INVALID_LENGTH';
    end if;

    if v_login_name !~ '^[a-z0-9._-]{3,32}$' then
        raise exception 'LOGIN_NAME_INVALID_FORMAT';
    end if;

    if exists (
        select 1
        from public.profiles p
        where p.login_name is not null
          and lower(p.login_name) = v_login_name
          and p.id <> v_actor
    ) then
        raise exception 'LOGIN_NAME_TAKEN';
    end if;

    begin
        update public.profiles
        set
            login_name = v_login_name,
            updated_at = now()
        where id = v_actor;
    exception
        when unique_violation then
            raise exception 'LOGIN_NAME_TAKEN';
    end;

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
        v_actor,
        'CLAIM_MY_NICKNAME',
        'profiles',
        v_actor,
        jsonb_build_object(
            'login_name', v_profile.login_name
        ),
        jsonb_build_object(
            'login_name', v_login_name
        ),
        'IAM06_MEMBER_LEGACY_LOGIN_NAME_CLAIM',
        now()
    );

    return jsonb_build_object(
        'success', true,
        'profile_id', v_actor,
        'login_name', v_login_name
    );
end;
$function$;


create or replace function public.admin_set_member_nickname(
    p_profile_id uuid,
    p_nickname text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
    v_actor uuid;
    v_actor_profile public.profiles%rowtype;
    v_target public.profiles%rowtype;
    v_login_name text;
begin
    v_actor := auth.uid();

    if v_actor is null then
        raise exception 'AUTH_REQUIRED';
    end if;

    select *
    into v_actor_profile
    from public.profiles
    where id = v_actor;

    if not found then
        raise exception 'PROFILE_NOT_FOUND';
    end if;

    if coalesce(v_actor_profile.is_active, false) is not true then
        raise exception 'ACCOUNT_INACTIVE';
    end if;

    if upper(coalesce(v_actor_profile.role, '')) <> 'ADMIN' then
        raise exception 'ADMIN_REQUIRED';
    end if;

    if p_profile_id is null then
        raise exception 'TARGET_PROFILE_REQUIRED';
    end if;

    select *
    into v_target
    from public.profiles
    where id = p_profile_id
    for update;

    if not found then
        raise exception 'TARGET_PROFILE_NOT_FOUND';
    end if;

    if upper(coalesce(v_target.role, '')) <> 'MEMBER' then
        raise exception 'TARGET_MUST_BE_MEMBER';
    end if;

    if coalesce(v_target.is_active, false) is not true then
        raise exception 'TARGET_ACCOUNT_INACTIVE';
    end if;

    if nullif(btrim(v_target.login_name), '') is not null then
        raise exception 'LOGIN_NAME_ALREADY_SET';
    end if;

    v_login_name := lower(btrim(coalesce(p_nickname, '')));

    if v_login_name = '' then
        raise exception 'LOGIN_NAME_REQUIRED';
    end if;

    if char_length(v_login_name) < 3
       or char_length(v_login_name) > 32 then
        raise exception 'LOGIN_NAME_INVALID_LENGTH';
    end if;

    if v_login_name !~ '^[a-z0-9._-]{3,32}$' then
        raise exception 'LOGIN_NAME_INVALID_FORMAT';
    end if;

    if exists (
        select 1
        from public.profiles p
        where p.login_name is not null
          and lower(p.login_name) = v_login_name
          and p.id <> p_profile_id
    ) then
        raise exception 'LOGIN_NAME_TAKEN';
    end if;

    begin
        update public.profiles
        set
            login_name = v_login_name,
            updated_at = now()
        where id = p_profile_id;
    exception
        when unique_violation then
            raise exception 'LOGIN_NAME_TAKEN';
    end;

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
        v_actor,
        'ADMIN_SET_MEMBER_NICKNAME',
        'profiles',
        p_profile_id,
        jsonb_build_object(
            'login_name', v_target.login_name,
            'role', v_target.role,
            'is_active', v_target.is_active
        ),
        jsonb_build_object(
            'login_name', v_login_name,
            'role', v_target.role,
            'is_active', v_target.is_active
        ),
        'IAM06_ADMIN_LEGACY_LOGIN_NAME_ASSIGNMENT',
        now()
    );

    return jsonb_build_object(
        'success', true,
        'profile_id', p_profile_id,
        'login_name', v_login_name
    );
end;
$function$;


revoke all on function public.claim_my_nickname(text) from public;
revoke all on function public.claim_my_nickname(text) from anon;
grant execute on function public.claim_my_nickname(text) to authenticated;

revoke all on function public.admin_set_member_nickname(uuid, text) from public;
revoke all on function public.admin_set_member_nickname(uuid, text) from anon;
grant execute on function public.admin_set_member_nickname(uuid, text) to authenticated;