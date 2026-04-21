import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Bot, Save, Plus, Trash2, BrainCircuit } from 'lucide-react';

export default function AdminAgentsPage() {
  const { account } = useAuth();
  const { toast } = useToast();
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (account?.id) fetchAgents();
  }, [account?.id]);

  const fetchAgents = async () => {
    try {
      const { data, error } = await supabase
        .from('ai_agents')
        .select('*')
        .eq('account_id', account?.id)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      setAgents(data || []);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao carregar agentes', description: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (agent: any) => {
    try {
      const { error } = await supabase
        .from('ai_agents')
        .update({
          name: agent.name,
          system_prompt: agent.system_prompt,
          is_active: agent.is_active,
          model: agent.model,
          temperature: agent.temperature
        })
        .eq('id', agent.id);

      if (error) throw error;
      toast({ title: 'Sucesso', description: 'Agente atualizado com sucesso!' });
      fetchAgents();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao salvar', description: err.message });
    }
  };

  if (loading) return <div className="p-8 text-center">Carregando agentes...</div>;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BrainCircuit className="w-8 h-8 text-primary" />
            Agentes de I.A
          </h1>
          <p className="text-muted-foreground">Personalize o comportamento da sua inteligência artificial</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {agents.map((agent) => (
          <Card key={agent.id} className={!agent.is_active ? 'opacity-70' : ''}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bot className="w-5 h-5 text-primary" />
                  <CardTitle>{agent.name}</CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  <Switch 
                    checked={agent.is_active} 
                    onCheckedChange={(val) => {
                      const updated = { ...agent, is_active: val };
                      setAgents(agents.map(a => a.id === agent.id ? updated : a));
                      handleUpdate(updated);
                    }}
                  />
                  <Badge variant={agent.role === 'prospecting' ? 'secondary' : 'default'}>
                    {agent.role === 'prospecting' ? 'Prospecção' : 'Vendas'}
                  </Badge>
                </div>
              </div>
              <CardDescription>
                Defina as instruções específicas para este agente.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Nome do Agente</Label>
                <Input 
                  value={agent.name} 
                  onChange={(e) => setAgents(agents.map(a => a.id === agent.id ? { ...a, name: e.target.value } : a))}
                />
              </div>
              <div className="space-y-2">
                <Label>Instruções (System Prompt)</Label>
                <Textarea 
                  rows={5}
                  value={agent.system_prompt} 
                  onChange={(e) => setAgents(agents.map(a => a.id === agent.id ? { ...a, system_prompt: e.target.value } : a))}
                  placeholder="Ex: Você é um assistente focado em contornar objeções de preço..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Modelo</Label>
                  <Input value={agent.model} readOnly className="bg-muted" />
                </div>
                <div className="space-y-2">
                  <Label>Criatividade (0.0 a 1.0)</Label>
                  <Input 
                    type="number" 
                    step="0.1" 
                    min="0" 
                    max="1" 
                    value={agent.temperature} 
                    onChange={(e) => setAgents(agents.map(a => a.id === agent.id ? { ...a, temperature: parseFloat(e.target.value) } : a))}
                  />
                </div>
              </div>
              <Button className="w-full gap-2" onClick={() => handleUpdate(agent)}>
                <Save className="w-4 h-4" /> Salvar Configurações
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}