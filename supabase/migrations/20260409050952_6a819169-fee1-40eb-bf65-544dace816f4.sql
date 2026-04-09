
-- 1. Cadence branching rules table
CREATE TABLE IF NOT EXISTS public.email_cadence_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cadence_id UUID NOT NULL REFERENCES public.email_cadences(id) ON DELETE CASCADE,
  trigger_event VARCHAR(50) NOT NULL CHECK (trigger_event IN ('opened', 'clicked', 'replied', 'not_opened', 'bounced')),
  target_cadence_id UUID NOT NULL REFERENCES public.email_cadences(id) ON DELETE CASCADE,
  delay_hours INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_email_cadence_rules_cadence ON public.email_cadence_rules(cadence_id);
CREATE INDEX IF NOT EXISTS idx_email_cadence_rules_trigger ON public.email_cadence_rules(trigger_event);

-- RLS
ALTER TABLE public.email_cadence_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Account members can view email_cadence_rules"
  ON public.email_cadence_rules FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.email_cadences c
    WHERE c.id = email_cadence_rules.cadence_id
    AND public.is_account_member(c.account_id)
  ));

CREATE POLICY "Admin can manage email_cadence_rules"
  ON public.email_cadence_rules FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.email_cadences c
    WHERE c.id = email_cadence_rules.cadence_id
    AND public.is_account_admin(c.account_id)
  ));

CREATE POLICY "Super admin can manage email_cadence_rules"
  ON public.email_cadence_rules FOR ALL
  USING (public.is_super_admin());

-- 2. Rate limit config per account
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS email_batch_size INTEGER DEFAULT 100,
  ADD COLUMN IF NOT EXISTS email_delay_ms INTEGER DEFAULT 500;

-- 3. Updated_at trigger for rules
CREATE TRIGGER update_email_cadence_rules_updated_at
  BEFORE UPDATE ON public.email_cadence_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
