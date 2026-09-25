-- ============================================================
-- FUND03A
-- Obligation campaigns / monthly club fund
--
-- Rules:
-- - Existing match-generated THUA/HOA obligations remain unchanged.
-- - Campaign obligations use match_id = NULL + campaign_id.
-- - No direct financial mutation is granted to frontend roles.
-- - ADMIN creates campaigns through SECURITY DEFINER RPC.
-- - MEMBER reads own obligations through get_my_fund_obligations().
-- ============================================================


-- ============================================================
-- 1. CAMPAIGN MASTER
-- ============================================================

CREATE TABLE public.fund_obligation_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  category text NOT NULL,

  title text NOT NULL,

  period_month date NULL,

  amount_due numeric NOT NULL,

  due_date date NULL,

  note text NULL,

  status text NOT NULL DEFAULT 'ACTIVE',

  created_by uuid NOT NULL
    REFERENCES public.profiles(id)
    ON DELETE RESTRICT,

  created_at timestamptz NOT NULL DEFAULT now(),

  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT fund_obligation_campaigns_category_chk
    CHECK (
      category IN (
        'MONTHLY_CLUB_FUND',
        'ACTIVITY_FEE',
        'EVENT_FEE',
        'OTHER'
      )
    ),

  CONSTRAINT fund_obligation_campaigns_amount_chk
    CHECK (amount_due > 0),

  CONSTRAINT fund_obligation_campaigns_status_chk
    CHECK (
      status IN (
        'ACTIVE',
        'CLOSED',
        'CANCELLED'
      )
    ),

  CONSTRAINT fund_obligation_campaigns_period_month_chk
    CHECK (
      period_month IS NULL
      OR period_month =
        date_trunc(
          'month',
          period_month
        )::date
    ),

  CONSTRAINT fund_obligation_campaigns_due_date_chk
    CHECK (
      due_date IS NULL
      OR period_month IS NULL
      OR due_date >= period_month
    )
);


CREATE UNIQUE INDEX
  fund_obligation_campaigns_monthly_uidx
ON public.fund_obligation_campaigns (
  period_month
)
WHERE
  category = 'MONTHLY_CLUB_FUND'
  AND status <> 'CANCELLED';


CREATE INDEX
  fund_obligation_campaigns_status_idx
ON public.fund_obligation_campaigns (
  status,
  period_month
);


ALTER TABLE
  public.fund_obligation_campaigns
ENABLE ROW LEVEL SECURITY;


CREATE POLICY
  fund_obligation_campaigns_authenticated_select
ON public.fund_obligation_campaigns
FOR SELECT
TO authenticated
USING (true);


REVOKE ALL
ON public.fund_obligation_campaigns
FROM PUBLIC, anon;

GRANT SELECT
ON public.fund_obligation_campaigns
TO authenticated;


-- ============================================================
-- 2. LINK CONTRIBUTIONS TO CAMPAIGN
-- ============================================================

ALTER TABLE public.fund_contributions
  ADD COLUMN campaign_id uuid NULL
    REFERENCES public.fund_obligation_campaigns(id)
    ON DELETE RESTRICT;


ALTER TABLE public.fund_contributions
  ADD COLUMN due_date date NULL;


CREATE UNIQUE INDEX
  fund_contributions_campaign_player_uidx
ON public.fund_contributions (
  campaign_id,
  player_id
)
WHERE campaign_id IS NOT NULL;


CREATE INDEX
  fund_contributions_campaign_id_idx
ON public.fund_contributions (
  campaign_id
)
WHERE campaign_id IS NOT NULL;


-- Match obligations and campaign obligations must not overlap.
ALTER TABLE public.fund_contributions
  ADD CONSTRAINT
    fund_contributions_source_chk
  CHECK (
    NOT (
      match_id IS NOT NULL
      AND campaign_id IS NOT NULL
    )
  );


-- ============================================================
-- 3. ADMIN CREATE CAMPAIGN + GENERATE OBLIGATIONS
-- ============================================================

CREATE OR REPLACE FUNCTION
public.create_fund_obligation_campaign(
  p_category text,
  p_title text,
  p_amount_due numeric,
  p_period_month date DEFAULT NULL,
  p_due_date date DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_category text;
  v_title text;
  v_period_month date;
  v_campaign_id uuid;
  v_reason text;
  v_count integer;
BEGIN

  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION
      'AUTH_REQUIRED'
      USING ERRCODE = '42501';
  END IF;


  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = v_user_id
      AND p.is_active = true
      AND p.role = 'ADMIN'
  ) THEN
    RAISE EXCEPTION
      'ADMIN_REQUIRED'
      USING ERRCODE = '42501';
  END IF;


  v_category :=
    upper(
      btrim(
        coalesce(
          p_category,
          ''
        )
      )
    );

  IF v_category NOT IN (
    'MONTHLY_CLUB_FUND',
    'ACTIVITY_FEE',
    'EVENT_FEE',
    'OTHER'
  ) THEN
    RAISE EXCEPTION
      'INVALID_CATEGORY';
  END IF;


  v_title :=
    btrim(
      coalesce(
        p_title,
        ''
      )
    );

  IF v_title = '' THEN
    RAISE EXCEPTION
      'TITLE_REQUIRED';
  END IF;


  IF p_amount_due IS NULL
     OR p_amount_due <= 0 THEN
    RAISE EXCEPTION
      'AMOUNT_MUST_BE_POSITIVE';
  END IF;


  IF p_period_month IS NOT NULL THEN
    v_period_month :=
      date_trunc(
        'month',
        p_period_month
      )::date;
  ELSE
    v_period_month := NULL;
  END IF;


  IF v_category = 'MONTHLY_CLUB_FUND'
     AND v_period_month IS NULL THEN
    RAISE EXCEPTION
      'PERIOD_MONTH_REQUIRED';
  END IF;


  IF p_due_date IS NOT NULL
     AND v_period_month IS NOT NULL
     AND p_due_date < v_period_month THEN
    RAISE EXCEPTION
      'INVALID_DUE_DATE';
  END IF;


  v_reason :=
    CASE v_category
      WHEN 'MONTHLY_CLUB_FUND'
        THEN 'QUY_THANG'
      WHEN 'ACTIVITY_FEE'
        THEN 'PHI_SINH_HOAT'
      WHEN 'EVENT_FEE'
        THEN 'PHI_SU_KIEN'
      ELSE 'KHAC'
    END;


  INSERT INTO
    public.fund_obligation_campaigns (
      category,
      title,
      period_month,
      amount_due,
      due_date,
      note,
      status,
      created_by
    )
  VALUES (
    v_category,
    v_title,
    v_period_month,
    p_amount_due,
    p_due_date,
    nullif(
      btrim(
        coalesce(
          p_note,
          ''
        )
      ),
      ''
    ),
    'ACTIVE',
    v_user_id
  )
  RETURNING id
  INTO v_campaign_id;


  INSERT INTO
    public.fund_contributions (
      match_id,
      campaign_id,
      player_id,
      reason,
      amount_due,
      due_date,
      status
    )
  SELECT
    NULL,
    v_campaign_id,
    target.player_id,
    v_reason,
    p_amount_due,
    p_due_date,
    'CHUA_DONG'
  FROM (
    SELECT DISTINCT
      profile.player_id
    FROM public.profiles profile
    JOIN public.players player
      ON player.id =
        profile.player_id
    WHERE profile.is_active = true
      AND profile.role IN (
        'MEMBER',
        'ADMIN'
      )
      AND profile.player_id IS NOT NULL
      AND player.status = 'ACTIVE'
      AND player.player_type = 'CLUB'
  ) target
  ON CONFLICT (
    campaign_id,
    player_id
  )
  WHERE campaign_id IS NOT NULL
  DO NOTHING;


  GET DIAGNOSTICS
    v_count = ROW_COUNT;


  RETURN jsonb_build_object(
    'campaign_id',
    v_campaign_id,
    'category',
    v_category,
    'title',
    v_title,
    'amount_due',
    p_amount_due,
    'period_month',
    v_period_month,
    'due_date',
    p_due_date,
    'obligation_count',
    v_count
  );

END;
$$;


REVOKE ALL
ON FUNCTION
public.create_fund_obligation_campaign(
  text,
  text,
  numeric,
  date,
  date,
  text
)
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION
public.create_fund_obligation_campaign(
  text,
  text,
  numeric,
  date,
  date,
  text
)
TO authenticated;


-- ============================================================
-- 5. MEMBER FUND OBLIGATION READ MODEL
-- ============================================================

DROP FUNCTION IF EXISTS
  public.get_my_fund_obligations();


CREATE FUNCTION
public.get_my_fund_obligations()
RETURNS TABLE (
  contribution_id uuid,
  match_id uuid,
  campaign_id uuid,
  obligation_title text,
  obligation_category text,
  due_date date,
  occurred_at timestamptz,
  reason text,
  amount_due numeric,
  collectible_amount numeric,
  payment_total numeric,
  refund_total numeric,
  amount_paid numeric,
  amount_remaining numeric,
  status text,
  is_collectible boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_player uuid;
BEGIN

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION
      'AUTH_REQUIRED'
      USING ERRCODE = '42501';
  END IF;


  SELECT p.player_id
  INTO v_player
  FROM public.profiles p
  WHERE p.id = auth.uid()
    AND p.is_active = true
    AND p.role IN (
      'MEMBER',
      'ADMIN'
    );


  IF v_player IS NULL THEN
    RAISE EXCEPTION
      'ACTIVE_LINKED_PROFILE_REQUIRED'
      USING ERRCODE = '42501';
  END IF;


  RETURN QUERY

  WITH payments AS (
    SELECT fp.*
    FROM public.fund_payments fp
    JOIN public.fund_contributions fc
      ON fc.id = fp.contribution_id
    WHERE fp.player_id = v_player
      AND fc.player_id = v_player
  ),

  payment_totals AS (
    SELECT
      p.contribution_id,
      sum(p.amount) AS amount
    FROM payments p
    GROUP BY p.contribution_id
  ),

  refunds AS (
    SELECT
      p.contribution_id,
      sum(ft.amount) AS amount
    FROM public.fund_transactions ft

    LEFT JOIN public.fund_transactions original
      ON original.id =
        ft.reversal_of_transaction_id
      AND original.player_id =
        v_player

    JOIN payments p
      ON p.id =
        coalesce(
          ft.payment_id,
          original.payment_id
        )

    WHERE ft.player_id =
      v_player

      AND ft.transaction_type =
        'HOAN_TIEN'

    GROUP BY
      p.contribution_id
  ),

  amounts AS (
    SELECT
      fc.*,

      camp.title
        AS campaign_title,

      camp.category
        AS campaign_category,

      camp.status
        AS campaign_status,

      coalesce(
        pt.amount,
        0
      ) AS paid,

      coalesce(
        rf.amount,
        0
      ) AS refunded,

      (
        fc.status NOT IN (
          'MIEN',
          'DIEU_CHINH'
        )

        AND (
          fc.match_id IS NULL
          OR coalesce(
            m.status,
            ''
          ) <> 'VOIDED'
        )

        AND (
          fc.campaign_id IS NULL
          OR coalesce(
            camp.status,
            ''
          ) <> 'CANCELLED'
        )
      ) AS collectible

    FROM public.fund_contributions fc

    LEFT JOIN public.matches m
      ON m.id = fc.match_id

    LEFT JOIN
      public.fund_obligation_campaigns camp
      ON camp.id = fc.campaign_id

    LEFT JOIN payment_totals pt
      ON pt.contribution_id =
        fc.id

    LEFT JOIN refunds rf
      ON rf.contribution_id =
        fc.id

    WHERE fc.player_id =
      v_player
  )

  SELECT
    a.id
      AS contribution_id,

    a.match_id,

    a.campaign_id,

    coalesce(
      a.campaign_title,

      CASE
        WHEN a.reason = 'THUA'
          THEN 'Quỹ thua trận'

        WHEN a.reason = 'HOA'
          THEN 'Quỹ hòa trận'

        WHEN a.reason = 'QUY_THANG'
          THEN 'Quỹ CLB tháng'

        WHEN a.reason = 'PHI_SINH_HOAT'
          THEN 'Phí sinh hoạt'

        WHEN a.reason = 'PHI_SU_KIEN'
          THEN 'Phí sự kiện'

        WHEN a.reason = 'KHAC'
          THEN 'Khoản phải đóng khác'

        ELSE a.reason
      END
    )
      AS obligation_title,

    a.campaign_category
      AS obligation_category,

    a.due_date,

    a.created_at
      AS occurred_at,

    a.reason,

    a.amount_due,

    CASE
      WHEN a.collectible
        THEN a.amount_due
      ELSE 0
    END
      AS collectible_amount,

    a.paid
      AS payment_total,

    a.refunded
      AS refund_total,

    a.paid - a.refunded
      AS amount_paid,

    CASE
      WHEN a.collectible
        THEN greatest(
          a.amount_due -
          a.paid +
          a.refunded,
          0
        )
      ELSE 0
    END
      AS amount_remaining,

    a.status,

    a.collectible
      AS is_collectible

  FROM amounts a

  ORDER BY
    coalesce(
      a.due_date,
      a.created_at::date
    ) DESC,
    a.created_at DESC,
    a.id;

END;
$$;


REVOKE ALL
ON FUNCTION
public.get_my_fund_obligations()
FROM PUBLIC, anon;


GRANT EXECUTE
ON FUNCTION
public.get_my_fund_obligations()
TO authenticated;



-- ============================================================
-- 6. COMMENTS
-- ============================================================

COMMENT ON TABLE
public.fund_obligation_campaigns
IS
'FUND03: administrative fund obligation campaigns such as monthly club fund.';


COMMENT ON COLUMN
public.fund_contributions.campaign_id
IS
'FUND03 campaign source. NULL for legacy/match-generated obligations.';


COMMENT ON FUNCTION
public.create_fund_obligation_campaign(
  text,
  text,
  numeric,
  date,
  date,
  text
)
IS
'ADMIN-only: creates a fund obligation campaign and obligations for active linked CLUB members.';


