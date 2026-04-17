ALTER TABLE public.email_cadence_steps
ADD COLUMN IF NOT EXISTS template_id UUID NULL REFERENCES public.email_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_email_cadence_steps_template ON public.email_cadence_steps(template_id);