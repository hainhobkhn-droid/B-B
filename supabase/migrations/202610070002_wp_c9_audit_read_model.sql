-- WP-C9A: sanitized Audit read model; no table privilege/RLS expansion.
-- B&B PICK catalog 2026-10-07: audit_logs has exactly nine columns below,
-- authenticated SELECT=false, policies=[], no get_audit_events overload.
-- Recovery: rollback transaction; after deployment revoke/drop only this new RPC
-- in a reviewed forward migration. Historical audit rows are never rewritten.
BEGIN;
DO $preflight$
DECLARE actual text[];
BEGIN
  SELECT array_agg(a.attname||':'||format_type(a.atttypid,a.atttypmod) ORDER BY a.attnum)
  INTO actual FROM pg_attribute a WHERE a.attrelid='public.audit_logs'::regclass
    AND a.attnum>0 AND NOT a.attisdropped;
  IF actual IS DISTINCT FROM ARRAY['id:uuid','user_id:uuid','action:text','table_name:text',
    'record_id:uuid','old_data:jsonb','new_data:jsonb','reason:text','created_at:timestamp with time zone']
    OR NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.oid='public.audit_logs'::regclass
                   AND c.relrowsecurity AND NOT c.relforcerowsecurity AND pg_get_userbyid(c.relowner)='postgres')
    OR has_table_privilege('authenticated','public.audit_logs','SELECT')
    OR EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.audit_logs'::regclass)
    OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
               WHERE n.nspname='public' AND p.proname='get_audit_events')
    OR md5(pg_get_functiondef('public.current_user_business_access_active()'::regprocedure))
       IS DISTINCT FROM 'd5a196e9bfb9522d559e3422c6669c01'
  THEN RAISE EXCEPTION 'WP_C9_AUDIT_BASELINE_DRIFT'; END IF;
END;
$preflight$;

CREATE FUNCTION public.get_audit_events(
  p_limit integer DEFAULT 30,
  p_offset integer DEFAULT 0,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_actor_id uuid DEFAULT NULL,
  p_action text DEFAULT NULL,
  p_table_name text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=public,pg_temp
AS $function$
DECLARE
  actor uuid := auth.uid();
  page_size integer := least(coalesce(p_limit,30),50);
  page_offset integer := coalesce(p_offset,0);
  result jsonb;
  more boolean;
  allowed_actions constant text[] := ARRAY[
    'RECORD_RATING_ADJUSTMENT','CORRECT_RATING_ADJUSTMENT','REBUILD_RATINGS',
    'PLAYER_STATUS_CHANGED','PLAYER_HARD_DELETED','RECORD_FUND_PAYMENT',
    'REFUND_FUND_PAYMENT','RECORD_MEMBER_FUND_PAYMENT'];
  allowed_tables constant text[] := ARRAY['players','matches','rating_events',
    'rating_adjustments','fund_payments','fund_transactions','fund_contributions',
    'tournaments','tournament_registrations','tournament_payments','profiles'];
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
  IF NOT public.current_user_business_access_active() THEN
    RAISE EXCEPTION 'BUSINESS_ACCESS_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=actor AND p.is_active IS TRUE
    AND (p.role='ADMIN' OR (p.role='MEMBER' AND p.can_view_audit IS TRUE))) THEN
    RAISE EXCEPTION 'AUDIT_PERMISSION_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF page_size<1 OR page_offset<0 OR page_offset>10000
    OR (p_from IS NOT NULL AND p_to IS NOT NULL AND p_from>=p_to)
    OR (p_action IS NOT NULL AND NOT (p_action=ANY(allowed_actions) OR p_action='OTHER'))
    OR (p_table_name IS NOT NULL AND NOT (p_table_name=ANY(allowed_tables) OR p_table_name='OTHER'))
  THEN RAISE EXCEPTION 'AUDIT_FILTER_INVALID' USING ERRCODE='22023'; END IF;

  -- Static metadata projection only. Never read payload, reason, auth metadata,
  -- profile contact fields or user-entered display strings. Unknown codes redacted.
  WITH safe AS (
    SELECT a.id,a.created_at,a.user_id AS actor_id,a.record_id AS target_id,
      CASE WHEN a.action=ANY(allowed_actions) THEN a.action ELSE 'OTHER' END AS action,
      CASE WHEN a.table_name=ANY(allowed_tables) THEN a.table_name ELSE 'OTHER' END AS entity_type
    FROM public.audit_logs a
    WHERE (p_from IS NULL OR a.created_at>=p_from)
      AND (p_to IS NULL OR a.created_at<p_to)
      AND (p_actor_id IS NULL OR a.user_id=p_actor_id)
  ), page AS (
    SELECT * FROM safe WHERE (p_action IS NULL OR action=p_action)
      AND (p_table_name IS NULL OR entity_type=p_table_name)
    ORDER BY created_at DESC,id DESC LIMIT page_size+1 OFFSET page_offset
  ), numbered AS (
    SELECT *, row_number() OVER (ORDER BY created_at DESC,id DESC) AS rn FROM page
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'created_at',created_at,
    'actor_id',actor_id,'action',action,'entity_type',entity_type,'target_id',target_id,
    'summary',CASE action
      WHEN 'RECORD_RATING_ADJUSTMENT' THEN 'Ghi điều chỉnh Rating'
      WHEN 'CORRECT_RATING_ADJUSTMENT' THEN 'Ghi đảo điều chỉnh Rating'
      WHEN 'REBUILD_RATINGS' THEN 'Cập nhật projection Rating'
      WHEN 'PLAYER_STATUS_CHANGED' THEN 'Thay đổi trạng thái VĐV'
      WHEN 'PLAYER_HARD_DELETED' THEN 'Xóa VĐV không có tham chiếu'
      WHEN 'RECORD_FUND_PAYMENT' THEN 'Ghi thu Quỹ'
      WHEN 'REFUND_FUND_PAYMENT' THEN 'Ghi hoàn Quỹ'
      WHEN 'RECORD_MEMBER_FUND_PAYMENT' THEN 'Ghi thu Quỹ theo VĐV'
      ELSE 'Thao tác khác — chi tiết đã được ẩn' END)
    ORDER BY created_at DESC,id DESC) FILTER (WHERE rn<=page_size),'[]'::jsonb),
    coalesce(bool_or(rn>page_size),false) INTO result,more FROM numbered;
  RETURN jsonb_build_object('events',result,'page_size',page_size,'offset',page_offset,
    'has_more',more);
END;
$function$;
ALTER FUNCTION public.get_audit_events(integer,integer,timestamptz,timestamptz,uuid,text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_audit_events(integer,integer,timestamptz,timestamptz,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_audit_events(integer,integer,timestamptz,timestamptz,uuid,text,text) TO authenticated,service_role;
COMMIT;
