-- Tabela de públicos da prospecção
CREATE TABLE public.prospecting_audiences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name VARCHAR NOT NULL,
  description TEXT,
  keyword TEXT,
  location TEXT,
  total_leads INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_prospecting_audiences_account ON public.prospecting_audiences(account_id);

ALTER TABLE public.prospecting_audiences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Account members can view prospecting_audiences"
  ON public.prospecting_audiences FOR SELECT
  USING (public.is_account_member(account_id));

CREATE POLICY "Admin can manage prospecting_audiences"
  ON public.prospecting_audiences FOR ALL
  USING (public.is_account_admin(account_id));

CREATE POLICY "Super admin can manage prospecting_audiences"
  ON public.prospecting_audiences FOR ALL
  USING (public.is_super_admin());

CREATE TRIGGER update_prospecting_audiences_updated_at
  BEFORE UPDATE ON public.prospecting_audiences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Tabela de leads dos públicos
CREATE TABLE public.prospecting_audience_leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  audience_id UUID NOT NULL REFERENCES public.prospecting_audiences(id) ON DELETE CASCADE,
  name VARCHAR NOT NULL,
  phone VARCHAR,
  address TEXT,
  rating NUMERIC,
  website TEXT,
  category VARCHAR,
  raw_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_prospecting_audience_leads_audience ON public.prospecting_audience_leads(audience_id);

ALTER TABLE public.prospecting_audience_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Account members can view prospecting_audience_leads"
  ON public.prospecting_audience_leads FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.prospecting_audiences a
    WHERE a.id = prospecting_audience_leads.audience_id
      AND public.is_account_member(a.account_id)
  ));

CREATE POLICY "Admin can manage prospecting_audience_leads"
  ON public.prospecting_audience_leads FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.prospecting_audiences a
    WHERE a.id = prospecting_audience_leads.audience_id
      AND public.is_account_admin(a.account_id)
  ));

CREATE POLICY "Super admin can manage prospecting_audience_leads"
  ON public.prospecting_audience_leads FOR ALL
  USING (public.is_super_admin());