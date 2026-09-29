BEGIN;

-- FUND04: atomic member collection. Existing single-payment/refund contracts stay intact.
CREATE OR REPLACE FUNCTION public.record_member_fund_payment(
    p_player_id uuid,
    p_amount numeric,
    p_paid_at timestamptz DEFAULT now(),
    p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_actor uuid := auth.uid();
    v_ids uuid[];
    v_row record;
    v_balances jsonb;
    v_allocations jsonb := '[]'::jsonb;
    v_result jsonb;
    v_total numeric;
    v_left numeric := p_amount;
    v_take numeric;
    v_batch_id uuid := gen_random_uuid();
BEGIN
    -- Match record_fund_payment ACL; manage-only is NOT collection permission.
    IF v_actor IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = v_actor AND p.is_active = true
          AND (upper(coalesce(p.role, '')) = 'ADMIN'
               OR coalesce(p.can_collect_fund, false))
    ) THEN
        RAISE EXCEPTION 'FUND_COLLECTION_PERMISSION_REQUIRED' USING ERRCODE = '42501';
    END IF;
    IF p_amount IS NULL OR p_amount <= 0
       OR p_amount::text IN ('NaN', 'Infinity', '-Infinity') THEN
        RAISE EXCEPTION 'BATCH_AMOUNT_MUST_BE_FINITE_POSITIVE';
    END IF;
    IF p_paid_at IS NULL OR NOT isfinite(p_paid_at) THEN
        RAISE EXCEPTION 'BATCH_PAID_AT_REQUIRED';
    END IF;

    -- Serialize batches for this player. NO KEY UPDATE does not block FK key-share
    -- checks when the single-payment engine inserts payments for the same player.
    PERFORM 1 FROM public.players WHERE id = p_player_id FOR NO KEY UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'BATCH_PLAYER_NOT_FOUND';
    END IF;
    SELECT coalesce(array_agg(c.id ORDER BY c.id), ARRAY[]::uuid[])
    INTO v_ids FROM public.fund_contributions c WHERE c.player_id = p_player_id;

    -- Lock source rows before obligations (source mutation workflows use this direction).
    -- This also prevents campaign cancellation/voiding during allocation.
    PERFORM m.id FROM public.matches m
    WHERE m.id IN (SELECT c.match_id FROM public.fund_contributions c WHERE c.id = ANY(v_ids))
    ORDER BY m.id FOR SHARE OF m;
    PERFORM camp.id FROM public.fund_obligation_campaigns camp
    WHERE camp.id IN (SELECT c.campaign_id FROM public.fund_contributions c WHERE c.id = ANY(v_ids))
    ORDER BY camp.id FOR SHARE OF camp;
    -- UUID lock order is independent of mutable source dates. Single payments and
    -- refunds take this same contribution row lock before reading/writing NET state.
    PERFORM c.id FROM public.fund_contributions c
    WHERE c.id = ANY(v_ids) ORDER BY c.id FOR UPDATE OF c;

    -- Fresh statement snapshot AFTER lock waits. Freeze the eligible, locked set;
    -- obligations created later belong to the next batch, not this one.
    SELECT coalesce(jsonb_agg(to_jsonb(b) ORDER BY
        coalesce(c.due_date, camp.period_month,
                 (m.played_at AT TIME ZONE 'Asia/Bangkok')::date,
                 (c.created_at AT TIME ZONE 'Asia/Bangkok')::date) ASC NULLS LAST,
        c.created_at ASC NULLS LAST, c.id), '[]'::jsonb),
        coalesce(sum(b.amount_remaining), 0)
    INTO v_balances, v_total
    FROM public.get_fund_collection_balances() b
    JOIN public.fund_contributions c ON c.id = b.contribution_id
    LEFT JOIN public.matches m ON m.id = c.match_id
    LEFT JOIN public.fund_obligation_campaigns camp ON camp.id = c.campaign_id
    WHERE c.id = ANY(v_ids) AND c.player_id = p_player_id
      AND b.player_id = p_player_id AND b.amount_remaining > 0;

    IF v_total <= 0 THEN RAISE EXCEPTION 'BATCH_NO_OUTSTANDING'; END IF;
    IF p_amount > v_total THEN RAISE EXCEPTION 'BATCH_OVERPAYMENT'; END IF;

    FOR v_row IN SELECT value AS balance FROM jsonb_array_elements(v_balances)
    LOOP
        EXIT WHEN v_left = 0;
        v_take := least(v_left, (v_row.balance->>'amount_remaining')::numeric);
        v_result := public._record_fund_payment_internal(
            (v_row.balance->>'contribution_id')::uuid, v_take,
            p_paid_at, p_note, v_actor);
        -- Do not silently accept anomalous legacy over-refunds or precision loss.
        IF (v_result->>'success')::boolean IS DISTINCT FROM true
           OR (v_result->>'paid_after')::numeric - (v_result->>'paid_before')::numeric
              IS DISTINCT FROM v_take THEN
            RAISE EXCEPTION 'BATCH_ALLOCATION_INTEGRITY_ERROR';
        END IF;
        v_allocations := v_allocations || jsonb_build_array(jsonb_build_object(
            'contribution_id', v_result->'contribution_id',
            'payment_id', v_result->'payment_id',
            'transaction_id', v_result->'transaction_id',
            'allocated_amount', v_take,
            'paid_before', v_result->'paid_before',
            'paid_after', v_result->'paid_after',
            'remaining', v_result->'remaining',
            'status', v_result->'status'));
        v_left := v_left - v_take;
    END LOOP;
    IF v_left <> 0 THEN RAISE EXCEPTION 'BATCH_ALLOCATION_INCOMPLETE'; END IF;

    v_result := jsonb_build_object(
        'success', true, 'batch_id', v_batch_id, 'player_id', p_player_id,
        'requested_amount', p_amount, 'total_outstanding_before', v_total,
        'total_outstanding_after', v_total - p_amount,
        'allocation_count', jsonb_array_length(v_allocations),
        'allocations', v_allocations);
    INSERT INTO public.audit_logs(
        user_id, action, table_name, record_id, old_data, new_data, reason, created_at)
    VALUES (v_actor, 'RECORD_MEMBER_FUND_PAYMENT', 'players', p_player_id,
        jsonb_build_object('total_outstanding_before', v_total),
        v_result || jsonb_build_object('actor', v_actor, 'paid_at', p_paid_at,
                                       'recorded_at', now(), 'note', p_note),
        'Thu gộp nghĩa vụ Quỹ CLB theo VĐV', now());
    RETURN v_result;
    -- No exception swallowing: any failure rolls back all allocations and audits.
END;
$function$;
REVOKE ALL ON FUNCTION public.record_member_fund_payment(uuid,numeric,timestamptz,text)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_member_fund_payment(uuid,numeric,timestamptz,text)
TO authenticated;
COMMENT ON FUNCTION public.record_member_fund_payment(uuid,numeric,timestamptz,text)
IS 'FUND04 atomic oldest-first NET collection; batch_id is an audit reference, not a payment id.';
COMMIT;
