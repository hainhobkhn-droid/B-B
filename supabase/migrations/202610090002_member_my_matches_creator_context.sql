-- Preparation only: additive read models; existing Match mutation RPCs unchanged.
BEGIN;

CREATE FUNCTION public.get_my_matches()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE v_player uuid; v_matches jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF NOT public.current_user_business_access_active() THEN
    RAISE EXCEPTION 'BUSINESS_ACCESS_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='MEMBER' AND is_active=true) THEN
    RAISE EXCEPTION 'MEMBER_REQUIRED' USING ERRCODE = '42501';
  END IF;
  v_player := public.current_user_player_id();
  IF v_player IS NULL THEN
    RETURN jsonb_build_object('player_id',NULL,'matches','[]'::jsonb);
  END IF;
  SELECT coalesce(jsonb_agg(q.record ORDER BY q.played_at DESC,q.id DESC),'[]'::jsonb)
  INTO v_matches FROM (
    SELECT m.id,m.played_at,jsonb_build_object(
      'id',m.id,'played_at',m.played_at,'match_number',m.match_number,
      'match_type',m.match_type,'score_mode',m.score_mode,
      'team_a_score',m.team_a_score,'team_b_score',m.team_b_score,
      'status',m.status,'opponent_rejected',m.opponent_rejected_by IS NOT NULL,
      'rejection_reason',m.opponent_rejection_reason,
      'my_team',(SELECT mp.team FROM public.match_players mp
        WHERE mp.match_id=m.id AND (mp.player_id=v_player OR mp.partner_player_id=v_player)
        ORDER BY mp.created_at,mp.id LIMIT 1),
      'players',coalesce((SELECT jsonb_agg(jsonb_build_object(
        'player_id',roster.player_id,'team',roster.team,'full_name',p.full_name)
        ORDER BY roster.team,roster.player_id)
        FROM (SELECT mp.team,mp.player_id FROM public.match_players mp WHERE mp.match_id=m.id
              UNION SELECT mp.team,mp.partner_player_id FROM public.match_players mp
                WHERE mp.match_id=m.id AND mp.partner_player_id IS NOT NULL) roster
        JOIN public.players p ON p.id=roster.player_id),'[]'::jsonb)
    ) AS record
    FROM public.matches m
    WHERE EXISTS (SELECT 1 FROM public.match_players mp WHERE mp.match_id=m.id
      AND (mp.player_id=v_player OR mp.partner_player_id=v_player))
  ) q;
  RETURN jsonb_build_object('player_id',v_player,'matches',v_matches);
END;
$function$;
REVOKE ALL ON FUNCTION public.get_my_matches() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_my_matches() TO authenticated,service_role;

CREATE FUNCTION public.get_match_creator_context()
RETURNS TABLE(match_id uuid,creator_name text,match_created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF NOT public.current_user_business_access_active() THEN
    RAISE EXCEPTION 'BUSINESS_ACCESS_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid()
    AND p.is_active=true AND (upper(coalesce(p.role,''))='ADMIN' OR p.can_approve_matches=true)) THEN
    RAISE EXCEPTION 'MATCH_APPROVAL_PERMISSION_REQUIRED' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT m.id,p.full_name,m.created_at
    FROM public.matches m LEFT JOIN public.profiles p ON p.id=m.created_by
    ORDER BY m.played_at DESC,m.id DESC;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_match_creator_context() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_match_creator_context() TO authenticated,service_role;
-- Align read eligibility with the unchanged production confirm/reject mutation.
DO $guard$
BEGIN
  IF md5(pg_get_functiondef('public.get_my_pending_match_confirmations()'::regprocedure))
     <> '26ba9e9dc74f7fdb14a37288ba748940' THEN
    RAISE EXCEPTION 'MATCH_CONFIRMATION_READ_MODEL_SOURCE_DRIFT';
  END IF;
END;
$guard$;
CREATE OR REPLACE FUNCTION public.get_my_pending_match_confirmations()
 RETURNS TABLE(match_id uuid, created_by uuid, can_confirm boolean, eligibility_reason text, opponent_confirmed_by uuid, opponent_confirmed_at timestamp with time zone, opponent_confirmer_name text, opponent_rejected_by uuid, opponent_rejected_at timestamp with time zone, opponent_rejection_reason text, opponent_rejector_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid;
  v_actor_player_id uuid;
begin
    -- ACC07B business access gate
    IF NOT public.current_user_business_access_active() THEN
        RAISE EXCEPTION 'BUSINESS_ACCESS_REQUIRED' USING ERRCODE = '42501';
    END IF;
  v_actor := auth.uid();

  if v_actor is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select pr.player_id
  into v_actor_player_id
  from public.profiles pr
  join public.players p on p.id = pr.player_id
  where pr.id = v_actor
    and pr.role = 'MEMBER'
    and pr.is_active = true
    and p.status = 'ACTIVE'
    and p.player_type = 'CLUB';

  if not found
     or v_actor_player_id is null then
    raise exception 'ACTIVE_MEMBER_PLAYER_REQUIRED';
  end if;

  return query
  with participant_matches as (
    select
      m.*,
      mine.team as actor_team,
      (
        al.new_data ->> 'member_player_id'
      )::uuid as creator_player_id

    from public.matches m

    join public.match_players mine
      on mine.match_id = m.id
     and mine.player_id = v_actor_player_id

    left join lateral (
      select a.new_data
      from public.audit_logs a
      where a.record_id = m.id
        and a.table_name = 'matches'
        and a.action = 'CREATE_MY_PENDING_MATCH'
        and a.user_id = m.created_by
      order by a.created_at asc
      limit 1
    ) al
      on true

    where m.status = 'PENDING'
  )

  select
    pm.id,
    pm.created_by,

    (
      pm.match_type in (
        'CLUB_RATED',
        'FRIENDLY_RATED'
      )
      and pm.tournament_id is null
      and pm.league_id is null
      and pm.created_by is distinct from v_actor
      and creator_mp.team is not null
      and creator_mp.team <> pm.actor_team
      and pm.opponent_rejected_by is null
    ) as can_confirm,

    case
      when pm.opponent_rejected_by is not null
        then 'REJECTED_WAITING_CREATOR_RESUBMIT'

      when pm.match_type not in (
        'CLUB_RATED',
        'FRIENDLY_RATED'
      )
        then 'MATCH_TYPE_NOT_ELIGIBLE'

      when pm.tournament_id is not null
        or pm.league_id is not null
        then 'COMPETITION_MATCH_NOT_ELIGIBLE'

      when pm.creator_player_id is null
        then 'MEMBER_CREATED_MATCH_REQUIRED'

      when pm.created_by = v_actor
        then 'CREATOR_CANNOT_CONFIRM'

      when creator_mp.team is null
        then 'CREATOR_PLAYER_NOT_IN_MATCH'

      when creator_mp.team = pm.actor_team
        then 'CREATOR_TEAM_CANNOT_CONFIRM'

      else 'ELIGIBLE'
    end,

    pm.opponent_confirmed_by,
    pm.opponent_confirmed_at,
    confirmer.full_name,

    pm.opponent_rejected_by,
    pm.opponent_rejected_at,
    pm.opponent_rejection_reason,
    rejector.full_name

  from participant_matches pm

  left join public.match_players creator_mp
    on creator_mp.match_id = pm.id
   and creator_mp.player_id =
       pm.creator_player_id

  left join public.profiles confirmer
    on confirmer.id =
       pm.opponent_confirmed_by

  left join public.profiles rejector
    on rejector.id =
       pm.opponent_rejected_by

  order by
    pm.played_at desc,
    pm.id;
end;
$function$
;
COMMIT;
