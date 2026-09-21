-- MP01 part 2: preserve the six-column legacy consumer contract.
-- MEMBER receives only own-player ledger and non-private descriptions.
-- ADMIN retains club-wide financial administration access.
CREATE OR REPLACE FUNCTION public.get_member_fund_transactions()
RETURNS TABLE (
  id uuid, transaction_date timestamptz, transaction_type text,
  amount numeric, description text, match_id uuid
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text;
  v_player uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501';
  END IF;
  SELECT p.role,p.player_id INTO v_role,v_player
  FROM public.profiles p WHERE p.id=auth.uid() AND p.is_active;
  IF NOT FOUND OR v_role NOT IN ('ADMIN','MEMBER') THEN
    RAISE EXCEPTION 'ACTIVE_PROFILE_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF v_role='MEMBER' AND v_player IS NULL THEN
    RAISE EXCEPTION 'MEMBER_PLAYER_REQUIRED' USING ERRCODE='42501';
  END IF;

  RETURN QUERY
  SELECT ft.id,ft.transaction_date,ft.transaction_type,ft.amount,
    CASE WHEN v_role='ADMIN' THEN ft.description
      ELSE CASE ft.transaction_type
        WHEN 'THU_QUY_THUA_TRAN' THEN 'Thu quỹ thua trận'
        WHEN 'THU_QUY_HOA' THEN 'Thu quỹ trận hòa'
        WHEN 'UNG_HO' THEN 'Ủng hộ quỹ'
        WHEN 'TAI_TRO' THEN 'Tài trợ quỹ'
        WHEN 'THU_KHAC' THEN 'Thu khác'
        WHEN 'CHUYEN_VAO_QUY' THEN 'Chuyển vào quỹ'
        WHEN 'CHI_TIEU' THEN 'Chi quỹ'
        WHEN 'HOAN_TIEN' THEN 'Hoàn tiền'
        WHEN 'DIEU_CHINH' THEN 'Điều chỉnh quỹ'
        ELSE 'Giao dịch quỹ'
      END
    END,
    ft.match_id
  FROM public.fund_transactions ft
  WHERE v_role='ADMIN' OR ft.player_id=v_player
  ORDER BY ft.transaction_date ASC,ft.id ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_member_fund_transactions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_member_fund_transactions() TO authenticated;
