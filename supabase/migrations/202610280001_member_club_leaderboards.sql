-- Public-safe club aggregates; personal Rating/Fund read contracts stay intact.
BEGIN;
CREATE FUNCTION public.get_member_club_leaderboard(
 p_board text DEFAULT 'rating', p_page integer DEFAULT 1,
 p_page_size integer DEFAULT 20, p_search text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO pg_catalog, public, pg_temp
AS $function$
DECLARE v_player uuid; v_version text; v_min integer; v_search text;
BEGIN
 IF NOT public.current_user_business_access_active() THEN
  RAISE EXCEPTION 'BUSINESS_ACCESS_REQUIRED' USING ERRCODE='42501';
 END IF;
 SELECT player_id INTO v_player FROM public.profiles
 WHERE id=auth.uid() AND role IN ('ADMIN','MEMBER');
 IF NOT FOUND THEN RAISE EXCEPTION 'BUSINESS_ROLE_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_board IS NULL OR p_board NOT IN ('rating','contribution','energetic','sleepy')
  OR p_page IS NULL OR p_page<1 OR p_page>10000
  OR p_page_size IS NULL OR p_page_size<1 OR p_page_size>50
  OR length(coalesce(p_search,''))>80 THEN
  RAISE EXCEPTION 'LEADERBOARD_ARGUMENT_INVALID' USING ERRCODE='22023';
 END IF;
 v_search:=lower(btrim(coalesce(p_search,'')));
 SELECT coalesce(nullif(algorithm_version,''),'V1.1'),
        CASE WHEN provisional_matches>=0 THEN provisional_matches ELSE 5 END
 INTO v_version,v_min FROM public.rating_settings WHERE is_active IS TRUE LIMIT 1;
 v_version:=coalesce(v_version,'V1.1'); v_min:=coalesce(v_min,5);
 RETURN (
 WITH rated AS (
  SELECT re.player_id,count(DISTINCT re.match_id) AS n
  FROM public.rating_events re
  WHERE p_board='rating' AND re.algorithm_version=v_version AND re.match_id IS NOT NULL
  GROUP BY re.player_id
 ), played AS (
  SELECT mp.player_id,count(DISTINCT mp.match_id) AS n
  FROM public.match_players mp JOIN public.matches m ON m.id=mp.match_id
  WHERE p_board<>'rating' AND m.status='APPROVED' GROUP BY mp.player_id
 ), contributions AS (
  SELECT fc.player_id,sum(fc.amount_due) AS amount,
         count(*) FILTER (WHERE upper(fc.reason)='THUA') AS losses
  FROM public.fund_contributions fc JOIN public.matches m ON m.id=fc.match_id
  WHERE p_board='contribution' AND m.status='APPROVED'
   AND upper(fc.reason) IN ('THUA','HOA')
   AND coalesce(upper(fc.status),'') NOT IN ('MIEN','DIEU_CHINH') AND fc.amount_due>0
  GROUP BY fc.player_id
 ), eligible AS (
  SELECT p.id,p.full_name,p.current_rating,
   CASE WHEN p_board='rating' THEN coalesce(r.n,0) ELSE coalesce(a.n,0) END AS match_count,
   coalesce(c.losses,0) AS losses,
   CASE WHEN p_board='rating' THEN p.current_rating
        WHEN p_board='contribution' THEN coalesce(c.amount,0)
        ELSE coalesce(a.n,0) END AS metric
  FROM public.players p LEFT JOIN rated r ON r.player_id=p.id
   LEFT JOIN played a ON a.player_id=p.id LEFT JOIN contributions c ON c.player_id=p.id
  WHERE upper(p.status)='ACTIVE' AND upper(p.player_type)='CLUB'
   AND CASE WHEN p_board='rating' THEN p.current_rating IS NOT NULL AND p.current_rating::text NOT IN ('NaN','Infinity','-Infinity') AND coalesce(r.n,0)>=v_min
            WHEN p_board='contribution' THEN coalesce(c.amount,0)>0
            ELSE coalesce(a.n,0)>0 END
 ), ranked AS MATERIALIZED (
  SELECT e.*,
   rank() OVER (ORDER BY CASE WHEN p_board='sleepy' THEN metric ELSE -metric END) AS rank,
   row_number() OVER (ORDER BY CASE WHEN p_board='sleepy' THEN metric ELSE -metric END,
    CASE WHEN p_board='contribution' THEN losses END DESC NULLS LAST,
    full_name COLLATE "vi-x-icu",id) AS position
  FROM eligible e
 ), filtered AS MATERIALIZED (
  SELECT * FROM ranked WHERE v_search='' OR strpos(lower(full_name),v_search)>0
 ), counts AS (
  SELECT count(*) AS total,
   greatest(1,ceil(count(*)::numeric/p_page_size)::integer) AS pages FROM filtered
 ), paged AS (
  SELECT f.* FROM filtered f ORDER BY position
  LIMIT p_page_size OFFSET (least(p_page,(SELECT pages FROM counts))-1)*p_page_size
 )
 SELECT jsonb_build_object(
  'board',p_board,'page',least(p_page,n.pages),'page_size',p_page_size,
  'total',n.total,'total_ranked',(SELECT count(*) FROM ranked),'total_pages',n.pages,
  'algorithm_version',v_version,'minimum_matches',v_min,
  'current_member',coalesce((SELECT jsonb_build_object(
   'eligible',true,'rank',r.rank,'display_name',r.full_name,'metric',r.metric,
   'rating',r.current_rating,'match_count',r.match_count,'is_current',true)
   FROM ranked r WHERE r.id=v_player),jsonb_build_object('eligible',false)),
  'rows',coalesce((SELECT jsonb_agg(jsonb_build_object(
   'rank',r.rank,'display_name',r.full_name,'metric',r.metric,
   'rating',r.current_rating,'match_count',r.match_count,
   'is_current',coalesce(r.id=v_player,false)) ORDER BY r.position) FROM paged r),'[]'::jsonb)
 ) FROM counts n
 );
END;
$function$;
REVOKE ALL ON FUNCTION public.get_member_club_leaderboard(text,integer,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_member_club_leaderboard(text,integer,integer,text) TO authenticated,service_role;
COMMIT;
