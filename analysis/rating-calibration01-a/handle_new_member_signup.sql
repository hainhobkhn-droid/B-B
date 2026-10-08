CREATE OR REPLACE FUNCTION public.handle_new_member_signup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_full_name text;
    v_login_name text;
    v_phone text;
    v_date_of_birth date;
    v_initial_rating numeric;
    v_default_rating numeric;
    v_min_rating numeric;
    v_max_rating numeric;
    v_player_id uuid;
    v_must_change_password boolean := false;
    v_membership_status text := 'PENDING';
    v_created_by uuid;

begin
    -- raw_app_meta_data is writable only by the trusted Auth Admin API.
    -- Never trust signup user_metadata, email confirmation, or password flags.
    if new.raw_app_meta_data ->> 'membership_source' = 'ADMIN_CREATE_MEMBER' then
        begin
            v_created_by := (new.raw_app_meta_data ->> 'membership_created_by')::uuid;
        exception when invalid_text_representation then
            raise exception 'ADMIN_PROVISIONING_ACTOR_REQUIRED' using errcode = '42501';
        end;
        perform 1 from public.profiles
        where id = v_created_by and role = 'ADMIN' and is_active is true
        for share;
        if not found then
            raise exception 'ADMIN_PROVISIONING_ACTOR_REQUIRED' using errcode = '42501';
        end if;
        v_membership_status := 'APPROVED';
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

    v_full_name :=
        nullif(
            trim(
                coalesce(
                    new.raw_user_meta_data ->> 'full_name',
                    ''
                )
            ),
            ''
        );

    if v_full_name is null then
        raise exception 'FULL_NAME_REQUIRED';
    end if;

    v_login_name :=
        nullif(
            lower(
                trim(
                    coalesce(
                        new.raw_user_meta_data ->> 'login_name',
                        ''
                    )
                )
            ),
            ''
        );

    if v_login_name is not null then
        if length(v_login_name) < 3
           or length(v_login_name) > 32
           or v_login_name !~ '^[a-z0-9._-]+$'
        then
            raise exception 'INVALID_LOGIN_NAME';
        end if;

        if exists (
            select 1
            from public.profiles p
            where lower(p.login_name) = v_login_name
        ) then
            raise exception 'LOGIN_NAME_ALREADY_EXISTS';
        end if;
    end if;

    v_must_change_password :=
        coalesce(
            lower(
                trim(
                    coalesce(
                        new.raw_user_meta_data
                            ->> 'must_change_password',
                        'false'
                    )
                )
            ) = 'true',
            false
        );

    v_phone :=
        nullif(
            trim(
                coalesce(
                    new.raw_user_meta_data ->> 'phone',
                    ''
                )
            ),
            ''
        );

    begin
        v_date_of_birth :=
            nullif(
                trim(
                    coalesce(
                        new.raw_user_meta_data ->> 'date_of_birth',
                        ''
                    )
                ),
                ''
            )::date;
    exception
        when others then
            raise exception 'INVALID_DATE_OF_BIRTH';
    end;

    if v_date_of_birth is not null
       and v_date_of_birth > current_date then
        raise exception 'INVALID_DATE_OF_BIRTH';
    end if;

    begin
        v_initial_rating :=
            coalesce(
                nullif(
                    trim(
                        coalesce(
                            new.raw_user_meta_data
                                ->> 'initial_rating',
                            ''
                        )
                    ),
                    ''
                )::numeric,
                v_default_rating
            );
    exception
        when others then
            raise exception 'INVALID_INITIAL_RATING';
    end;

    if v_initial_rating < v_min_rating
       or v_initial_rating > v_max_rating then
        raise exception 'INVALID_INITIAL_RATING';
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
        date_of_birth
    )
    values (
        v_full_name,
        'CLUB',
        v_phone,
        new.email,
        v_initial_rating,
        v_initial_rating,
        'ACTIVE',
        current_date,
        v_date_of_birth
    )
    returning id
    into v_player_id;

    insert into public.profiles (
        id,
        full_name,
        login_name,
        role,
        is_active,
        player_id,
        can_collect_tournament_fee,
        must_change_password,
        membership_status,
        membership_reviewed_by,
        membership_reviewed_at
    )
    values (
        new.id,
        v_full_name,
        v_login_name,
        'MEMBER',
        v_membership_status = 'APPROVED',
        v_player_id,
        false,
        v_must_change_password,
        v_membership_status,
        v_created_by,
        case when v_created_by is not null then now() end
    );

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
        coalesce(v_created_by, new.id),
        'AUTO_PROVISION_MEMBER',
        'profiles',
        new.id,
        null,
        jsonb_build_object(
            'membership_status', v_membership_status,
            'created_by_admin', v_created_by,
            'profile_id', new.id,
            'player_id', v_player_id,
            'full_name', v_full_name,
            'login_name', v_login_name,
            'email', new.email,
            'phone', v_phone,
            'date_of_birth', v_date_of_birth,
            'initial_rating', v_initial_rating,
            'rating_min', v_min_rating,
            'rating_max', v_max_rating,
            'role', 'MEMBER',
            'player_type', 'CLUB',
            'must_change_password',
              v_must_change_password
        ),
        'MEMBER_SIGNUP_ACTIVE_RATING_SETTINGS'
    );

    return new;
end;
$function$
