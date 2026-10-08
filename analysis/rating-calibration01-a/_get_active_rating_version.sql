CREATE OR REPLACE FUNCTION public._get_active_rating_version()
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    v_version text;
begin
    select rs.algorithm_version
    into v_version
    from public.rating_settings rs
    where rs.is_active = true
    order by rs.id desc
    limit 1;

    if v_version is null then
        raise exception 'ACTIVE_RATING_VERSION_NOT_CONFIGURED';
    end if;

    return v_version;
end;
$function$
