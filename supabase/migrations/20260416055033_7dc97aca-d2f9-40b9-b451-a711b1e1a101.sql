
-- Create email_campaigns table
CREATE TABLE public.email_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name VARCHAR NOT NULL,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add campaign_id to email_cadences
ALTER TABLE public.email_cadences ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES public.email_campaigns(id) ON DELETE SET NULL;

-- Enable RLS
ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Account members can view email_campaigns"
ON public.email_campaigns FOR SELECT
TO public
USING (is_account_member(account_id));

CREATE POLICY "Admin can manage email_campaigns"
ON public.email_campaigns FOR ALL
TO public
USING (is_account_admin(account_id));

CREATE POLICY "Super admin can manage email_campaigns"
ON public.email_campaigns FOR ALL
TO public
USING (is_super_admin());

-- Update trigger
CREATE TRIGGER update_email_campaigns_updated_at
  BEFORE UPDATE ON public.email_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Index for fast lookup
CREATE INDEX idx_email_cadences_campaign_id ON public.email_cadences(campaign_id);
CREATE INDEX idx_email_campaigns_account_id ON public.email_campaigns(account_id);
