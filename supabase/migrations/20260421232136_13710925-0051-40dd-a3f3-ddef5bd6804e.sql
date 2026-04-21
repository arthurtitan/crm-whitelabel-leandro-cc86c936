-- Create AI Agents table
CREATE TABLE IF NOT EXISTS public.ai_agents (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('prospecting', 'sales', 'support', 'general')),
    system_prompt TEXT NOT NULL,
    model TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    temperature FLOAT NOT NULL DEFAULT 0.7,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view agents from their account"
ON public.ai_agents
FOR SELECT
USING (auth.uid() IN (
    SELECT id FROM public.profiles WHERE account_id = ai_agents.account_id
));

CREATE POLICY "Admins can manage agents from their account"
ON public.ai_agents
FOR ALL
USING (auth.uid() IN (
    SELECT id FROM public.profiles WHERE account_id = ai_agents.account_id AND (role = 'admin' OR role = 'super_admin')
));

-- Trigger for updated_at
CREATE TRIGGER update_ai_agents_updated_at
BEFORE UPDATE ON public.ai_agents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default agents for existing accounts
INSERT INTO public.ai_agents (account_id, name, role, system_prompt, model)
SELECT 
    id as account_id,
    'Agente de Prospecção' as name,
    'prospecting' as role,
    'Você é um especialista em prospecção B2B. Sua função é analisar os dados de leads e criar abordagens personalizadas e altamente conversivas.' as system_prompt,
    'gpt-4o-mini' as model
FROM public.accounts
ON CONFLICT DO NOTHING;

INSERT INTO public.ai_agents (account_id, name, role, system_prompt, model)
SELECT 
    id as account_id,
    'Agente de Vendas' as name,
    'sales' as role,
    'Você é um mestre em fechamento de vendas. Sua função é responder leads interessados, contornar objeções e agendar reuniões.' as system_prompt,
    'gpt-4o-mini' as model
FROM public.accounts
ON CONFLICT DO NOTHING;
