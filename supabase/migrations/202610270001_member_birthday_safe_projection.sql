-- MEMBER Birthday P3: bounded day/month projection; no DOB table or write path.
BEGIN;
DO $precondition$ BEGIN
 IF to_regprocedure('public.get_member_birthdays(integer,integer,integer)') IS NOT NULL THEN
  RAISE EXCEPTION 'BIRTHDAY_RPC_ALREADY_EXISTS';
 END IF;
END $precondition$;
CREATE FUNCTION public.get_member_birthdays(p_window_days integer DEFAULT 7, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO pg_catalog, public, pg_temp
AS $birthday$
DECLARE
 v_today date := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date;
 v_result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.current_user_business_access_active() THEN
  RAISE EXCEPTION 'BUSINESS_ACCESS_REQUIRED' USING ERRCODE='42501';
 END IF;
 IF p_window_days IS NULL OR p_window_days NOT BETWEEN 0 AND 7
    OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50
    OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000 THEN
  RAISE EXCEPTION 'INVALID_BIRTHDAY_PAGE' USING ERRCODE='22023';
 END IF;
 WITH eligible AS (
  SELECT p.id, p.full_name,
   extract(month FROM p.date_of_birth)::integer AS mm,
   extract(day FROM p.date_of_birth)::integer AS dd
  FROM public.players p
  WHERE p.status='ACTIVE' AND p.player_type='CLUB' AND p.date_of_birth IS NOT NULL
   AND EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.player_id=p.id
    AND pr.role='MEMBER' AND pr.is_active IS TRUE AND pr.membership_status='APPROVED')
 ), upcoming AS (
  SELECT e.*, b.next_day-v_today AS days
  FROM eligible e CROSS JOIN LATERAL (
   SELECT min(d) AS next_day FROM (
    SELECT CASE WHEN e.mm<>2 OR e.dd<>29 OR (y%4=0 AND (y%100<>0 OR y%400=0))
      THEN make_date(y,e.mm,e.dd) END AS d
    FROM generate_series(extract(year FROM v_today)::integer,extract(year FROM v_today)::integer+8) y
   ) calendar WHERE d>=v_today
  ) b
 ), page AS (
  SELECT * FROM upcoming WHERE days BETWEEN 0 AND p_window_days
  ORDER BY days,full_name,id LIMIT p_limit+1 OFFSET p_offset
 ), visible AS (
  SELECT * FROM page ORDER BY days,full_name,id LIMIT p_limit
 )
 SELECT jsonb_build_object(
  'birthdays',coalesce((SELECT jsonb_agg(jsonb_build_object(
   'player_id',id,'full_name',full_name,'birthday_day',dd,'birthday_month',mm,
   'is_birthday_today',days=0,'days_until_birthday',days) ORDER BY days,full_name,id) FROM visible),'[]'::jsonb),
  'has_more',(SELECT count(*)>p_limit FROM page),
  'window_days',p_window_days,'limit',p_limit,'offset',p_offset
 ) INTO v_result;
 RETURN v_result;
END
$birthday$;
REVOKE ALL ON FUNCTION public.get_member_birthdays(integer,integer,integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_member_birthdays(integer,integer,integer) TO authenticated, service_role;
COMMIT;
