
-- 1. Create email_audiences table
CREATE TABLE public.email_audiences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_audiences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Account members can view email_audiences" ON public.email_audiences FOR SELECT USING (is_account_member(account_id));
CREATE POLICY "Admin can manage email_audiences" ON public.email_audiences FOR ALL USING (is_account_admin(account_id));
CREATE POLICY "Super admin can manage email_audiences" ON public.email_audiences FOR ALL USING (is_super_admin());

CREATE INDEX idx_email_audiences_account ON public.email_audiences(account_id);

-- 2. Create email_audience_contacts junction table
CREATE TABLE public.email_audience_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  audience_id UUID NOT NULL REFERENCES public.email_audiences(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(audience_id, contact_id)
);

ALTER TABLE public.email_audience_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Account members can view email_audience_contacts" ON public.email_audience_contacts FOR SELECT USING (EXISTS (SELECT 1 FROM public.email_audiences a WHERE a.id = email_audience_contacts.audience_id AND is_account_member(a.account_id)));
CREATE POLICY "Admin can manage email_audience_contacts" ON public.email_audience_contacts FOR ALL USING (EXISTS (SELECT 1 FROM public.email_audiences a WHERE a.id = email_audience_contacts.audience_id AND is_account_admin(a.account_id)));
CREATE POLICY "Super admin can manage email_audience_contacts" ON public.email_audience_contacts FOR ALL USING (is_super_admin());

CREATE INDEX idx_email_audience_contacts_audience ON public.email_audience_contacts(audience_id);
CREATE INDEX idx_email_audience_contacts_contact ON public.email_audience_contacts(contact_id);

-- 3. Add audience_id to email_campaigns
ALTER TABLE public.email_campaigns ADD COLUMN audience_id UUID REFERENCES public.email_audiences(id) ON DELETE SET NULL;

-- 4. Make campaign_id NOT NULL on email_cadences (first unlink orphans)
UPDATE public.email_cadences SET campaign_id = NULL WHERE campaign_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.email_campaigns WHERE id = email_cadences.campaign_id);

-- Add triggers for updated_at
CREATE TRIGGER update_email_audiences_updated_at BEFORE UPDATE ON public.email_audiences FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
