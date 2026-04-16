import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import {
  Plus, Edit2, Trash2, Loader2, FolderOpen, BarChart3, Send, Mail,
  Eye, MousePointer, AlertTriangle, ChevronRight, Clock, GitBranch,
  Zap, Inbox, MailOpen, RefreshCw, Users, FileText, Sparkles,
  MoreHorizontal, ArrowLeft
} from 'lucide-react';
import {
  emailService,
  type EmailCampaign,
  type EmailCadence,
  type EmailCadenceStep,
  type EmailCadenceRule,
  type EmailTemplate,
  type SendStats,
} from '@/services/email.service';
import { supabase } from '@/integrations/supabase/client';
import EmailPreviewDialog from '@/components/email/EmailPreviewDialog';
import EmailRichEditor from '@/components/email/EmailRichEditor';
import EmailAIChat from '@/components/email/EmailAIChat';
import EmailTemplatesTab from '@/components/email/EmailTemplatesTab';
import EmailSendsTab from '@/components/email/EmailSendsTab';
import EmailInboxTab from '@/components/email/EmailInboxTab';

interface Audience {
  id: string;
  name: string;
  contact_count?: number;
}

interface CampaignFull extends EmailCampaign {
  audience_id?: string | null;
  audience?: Audience | null;
  stats?: SendStats & { enrollments: number };
  linkedCadences?: EmailCadence[];
}

async function getAccountId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Não autenticado');
  const { data: profile } = await supabase.from('profiles').select('account_id').eq('user_id', user.id).single();
  if (!profile?.account_id) throw new Error('Conta não encontrada');
  return profile.account_id;
}

export default function EmailCampaignsTab() {
  const [campaigns, setCampaigns] = useState<CampaignFull[]>([]);
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignFull | null>(null);
  const [innerTab, setInnerTab] = useState('cadences');

  // Campaign Dialogs
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<EmailCampaign | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '', audienceId: '' });

  // Cadence state
  const [selectedCadence, setSelectedCadence] = useState<EmailCadence | null>(null);
  const [showCadenceDialog, setShowCadenceDialog] = useState(false);
  const [editingCadence, setEditingCadence] = useState<EmailCadence | null>(null);
  const [cadenceForm, setCadenceForm] = useState({ name: '', description: '', sendAtTime: '09:00', startDate: new Date().toISOString().split('T')[0] });

  // Step state
  const [showStepDialog, setShowStepDialog] = useState(false);
  const [editingStep, setEditingStep] = useState<EmailCadenceStep | null>(null);
  const [stepForm, setStepForm] = useState({ dayNumber: 1, subject: '', bodyHtml: '', bodyText: '' });
  const [showStepAI, setShowStepAI] = useState(false);
  const [previewStep, setPreviewStep] = useState<EmailCadenceStep | null>(null);

  // Rule state
  const [showRuleDialog, setShowRuleDialog] = useState(false);
  const [ruleForm, setRuleForm] = useState({ triggerEvent: 'opened', targetCadenceId: '', delayHours: 0, timeoutHours: 48 });

  // Templates
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const accountId = await getAccountId();
      const [campaignsData, cadencesData, templatesData] = await Promise.all([
        emailService.listCampaigns(),
        emailService.listCadences(),
        emailService.listTemplates().catch(() => []),
      ]);

      // Load audiences
      const { data: audData } = await supabase
        .from('email_audiences')
        .select('id, name')
        .eq('account_id', accountId);
      const audList: Audience[] = (audData || []);

      // Get audience contact counts
      const audWithCounts = await Promise.all(audList.map(async (a) => {
        const { count } = await supabase
          .from('email_audience_contacts')
          .select('*', { count: 'exact', head: true })
          .eq('audience_id', a.id);
        return { ...a, contact_count: count || 0 };
      }));
      setAudiences(audWithCounts);

      // Enrich campaigns
      const enriched: CampaignFull[] = await Promise.all(campaignsData.map(async (camp: any) => {
        const linked = cadencesData.filter((c: any) => c.campaign_id === camp.id);
        const audience = camp.audience_id ? audWithCounts.find(a => a.id === camp.audience_id) || null : null;
        let stats = { total: 0, sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, failed: 0, enrollments: 0 };
        try { stats = await emailService.getCampaignStats(camp.id); } catch {}
        return { ...camp, linkedCadences: linked, audience, stats };
      }));

      setCampaigns(enriched);
      setTemplates(templatesData);

      if (enriched.length > 0 && !selectedCampaign) {
        setSelectedCampaign(enriched[0]);
        if (enriched[0].linkedCadences?.length) setSelectedCadence(enriched[0].linkedCadences[0]);
      } else if (selectedCampaign) {
        const updated = enriched.find(c => c.id === selectedCampaign.id);
        if (updated) {
          setSelectedCampaign(updated);
          if (selectedCadence) {
            const updCad = updated.linkedCadences?.find(c => c.id === selectedCadence.id);
            if (updCad) setSelectedCadence(updCad);
          }
        }
      }
    } catch (err: any) {
      console.error('Erro ao carregar campanhas:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ==================== CAMPAIGN CRUD ====================
  const handleSaveCampaign = async () => {
    try {
      if (editingCampaign) {
        await emailService.updateCampaign(editingCampaign.id, { name: form.name, description: form.description });
        // Update audience separately
        if (form.audienceId) {
          await supabase.from('email_campaigns').update({ audience_id: form.audienceId } as any).eq('id', editingCampaign.id);
        }
        toast.success('Campanha atualizada!');
      } else {
        const created = await emailService.createCampaign({ name: form.name, description: form.description });
        if (form.audienceId) {
          await supabase.from('email_campaigns').update({ audience_id: form.audienceId } as any).eq('id', created.id);
        }
        toast.success('Campanha criada!');
      }
      setShowCreateDialog(false);
      setEditingCampaign(null);
      setForm({ name: '', description: '', audienceId: '' });
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar campanha');
    }
  };

  const handleDeleteCampaign = async () => {
    if (!deleteId) return;
    try {
      await emailService.deleteCampaign(deleteId);
      toast.success('Campanha excluída!');
      if (selectedCampaign?.id === deleteId) { setSelectedCampaign(null); setSelectedCadence(null); }
      setDeleteId(null);
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao excluir');
    }
  };

  // ==================== CADENCE CRUD (inside campaign) ====================
  const handleSaveCadence = async () => {
    if (!selectedCampaign) return;
    try {
      if (editingCadence) {
        const updated = await emailService.updateCadence(editingCadence.id, cadenceForm);
        setSelectedCadence(updated);
        toast.success('Cadência atualizada!');
      } else {
        const created = await emailService.createCadence(cadenceForm);
        // Link to campaign
        await emailService.addCadenceToCampaign(selectedCampaign.id, created.id);
        setSelectedCadence(created);
        toast.success('Cadência criada e vinculada!');
      }
      setShowCadenceDialog(false);
      setCadenceForm({ name: '', description: '', sendAtTime: '09:00', startDate: new Date().toISOString().split('T')[0] });
      setEditingCadence(null);
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar cadência');
    }
  };

  const handleDeleteCadence = async (id: string) => {
    try {
      await emailService.deleteCadence(id);
      if (selectedCadence?.id === id) setSelectedCadence(null);
      toast.success('Cadência excluída!');
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao excluir');
    }
  };

  // ==================== STEP CRUD ====================
  const handleSaveStep = async () => {
    if (!selectedCadence) return;
    try {
      if (editingStep) {
        await emailService.updateStep(editingStep.id, stepForm);
        toast.success('Step atualizado!');
      } else {
        await emailService.createStep(selectedCadence.id, stepForm);
        toast.success('Step criado!');
      }
      setShowStepDialog(false);
      setStepForm({ dayNumber: 1, subject: '', bodyHtml: '', bodyText: '' });
      setEditingStep(null);
      setShowStepAI(false);
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar step');
    }
  };

  const handleDeleteStep = async (stepId: string) => {
    try {
      await emailService.deleteStep(stepId);
      toast.success('Step excluído!');
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao excluir');
    }
  };

  // ==================== RULES ====================
  const handleSaveRule = async () => {
    if (!selectedCadence || !ruleForm.targetCadenceId) return;
    try {
      await emailService.createRule(selectedCadence.id, ruleForm);
      toast.success('Regra criada!');
      setShowRuleDialog(false);
      setRuleForm({ triggerEvent: 'opened', targetCadenceId: '', delayHours: 0, timeoutHours: 48 });
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao criar regra');
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    try {
      await emailService.deleteRule(ruleId);
      toast.success('Regra excluída!');
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Erro');
    }
  };

  const handleLoadTemplate = (templateId: string) => {
    const t = templates.find(t => t.id === templateId);
    if (t) {
      setStepForm(prev => ({ ...prev, subject: t.subject, bodyHtml: t.body_html, bodyText: t.body_text || '' }));
      toast.info(`Template "${t.name}" carregado!`);
    }
  };

  const triggerLabels: Record<string, string> = {
    opened: '📬 Abriu', clicked: '🖱️ Clicou', not_opened: '🚫 Não abriu', bounced: '⚠️ Bounce',
  };

  const stats = selectedCampaign?.stats || { total: 0, sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, failed: 0, enrollments: 0 };
  const kpis = [
    { label: 'Enviados', value: stats.sent + stats.delivered, icon: Send, color: 'text-blue-400' },
    { label: 'Entregues', value: stats.delivered, icon: Mail, color: 'text-emerald-400' },
    { label: 'Abertos', value: stats.opened, icon: Eye, color: 'text-violet-400' },
    { label: 'Clicados', value: stats.clicked, icon: MousePointer, color: 'text-cyan-400' },
    { label: 'Inscritos', value: stats.enrollments, icon: Users, color: 'text-amber-400' },
    { label: 'Falhas', value: stats.bounced + stats.failed, icon: AlertTriangle, color: 'text-destructive' },
  ];

  const cadences = selectedCampaign?.linkedCadences || [];
  const steps = selectedCadence?.steps || [];

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  // ==================== CAMPAIGN LIST VIEW ====================
  if (!selectedCampaign) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FolderOpen className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold">Campanhas</h3>
          </div>
          <Button size="sm" onClick={() => { setEditingCampaign(null); setForm({ name: '', description: '', audienceId: '' }); setShowCreateDialog(true); }}>
            <Plus className="w-4 h-4 mr-1" /> Nova Campanha
          </Button>
        </div>

        {campaigns.length === 0 ? (
          <Card className="card-gradient border-border/50">
            <CardContent className="py-12 text-center text-muted-foreground">
              <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="font-medium">Nenhuma campanha criada</p>
              <p className="text-sm mt-1">Crie sua primeira campanha para organizar seus e-mails.</p>
              <Button size="sm" className="mt-4" onClick={() => { setForm({ name: '', description: '', audienceId: '' }); setShowCreateDialog(true); }}>
                <Plus className="w-4 h-4 mr-1" /> Criar primeira campanha
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {campaigns.map(camp => (
              <Card
                key={camp.id}
                className="card-gradient border-border/50 cursor-pointer hover:border-primary/50 transition-all"
                onClick={() => { setSelectedCampaign(camp); setSelectedCadence(camp.linkedCadences?.[0] || null); setInnerTab('cadences'); }}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className="font-semibold">{camp.name}</h4>
                      {camp.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{camp.description}</p>}
                    </div>
                    <Badge variant={camp.active ? 'default' : 'secondary'} className="text-[10px] flex-shrink-0">
                      {camp.active ? 'Ativa' : 'Inativa'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-3">
                    {camp.audience && (
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {camp.audience.name} ({camp.audience.contact_count})</span>
                    )}
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {camp.linkedCadences?.length || 0} cadência(s)</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    <div className="text-center"><p className="text-lg font-bold">{camp.stats?.sent || 0}</p><p className="text-[10px] text-muted-foreground">Enviados</p></div>
                    <div className="text-center"><p className="text-lg font-bold">{camp.stats?.opened || 0}</p><p className="text-[10px] text-muted-foreground">Abertos</p></div>
                    <div className="text-center"><p className="text-lg font-bold">{camp.stats?.enrollments || 0}</p><p className="text-[10px] text-muted-foreground">Inscritos</p></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Create Dialog */}
        {renderCampaignDialog()}
      </div>
    );
  }

  // ==================== CAMPAIGN DETAIL VIEW ====================
  return (
    <div className="space-y-4">
      {/* Back + Campaign header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => { setSelectedCampaign(null); setSelectedCadence(null); }}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">{selectedCampaign.name}</h3>
            <Badge variant={selectedCampaign.active ? 'default' : 'secondary'} className="text-[10px]">
              {selectedCampaign.active ? 'Ativa' : 'Inativa'}
            </Badge>
            {selectedCampaign.audience && (
              <Badge variant="outline" className="text-[10px] gap-1">
                <Users className="w-3 h-3" /> {selectedCampaign.audience.name} ({selectedCampaign.audience.contact_count})
              </Badge>
            )}
          </div>
          {selectedCampaign.description && <p className="text-sm text-muted-foreground">{selectedCampaign.description}</p>}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => {
            setEditingCampaign(selectedCampaign);
            setForm({ name: selectedCampaign.name, description: selectedCampaign.description || '', audienceId: (selectedCampaign as any).audience_id || '' });
            setShowCreateDialog(true);
          }}>
            <Edit2 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDeleteId(selectedCampaign.id)}>
            <Trash2 className="w-4 h-4 text-destructive" />
          </Button>
          <Button variant="outline" size="sm" onClick={loadData}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        {kpis.map(kpi => (
          <Card key={kpi.label} className="card-gradient border-border/50">
            <CardContent className="p-2.5">
              <div className="flex items-center gap-2">
                <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
                <div>
                  <p className="text-lg font-bold leading-tight">{kpi.value}</p>
                  <p className="text-[10px] text-muted-foreground">{kpi.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Inner Tabs */}
      <Tabs value={innerTab} onValueChange={setInnerTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="cadences" className="flex items-center gap-1.5 text-xs">
            <Clock className="w-3.5 h-3.5" /> Cadências
          </TabsTrigger>
          <TabsTrigger value="templates" className="flex items-center gap-1.5 text-xs">
            <FileText className="w-3.5 h-3.5" /> Templates
          </TabsTrigger>
          <TabsTrigger value="sends" className="flex items-center gap-1.5 text-xs">
            <Send className="w-3.5 h-3.5" /> Envios
          </TabsTrigger>
          <TabsTrigger value="inbox" className="flex items-center gap-1.5 text-xs">
            <Inbox className="w-3.5 h-3.5" /> Respostas
          </TabsTrigger>
          <TabsTrigger value="ai" className="flex items-center gap-1.5 text-xs">
            <Sparkles className="w-3.5 h-3.5" /> Assistente IA
          </TabsTrigger>
        </TabsList>

        {/* TAB: CADENCES */}
        <TabsContent value="cadences" className="mt-4 space-y-4">
          {/* Cadence list + selector */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              {cadences.length > 0 && (
                <Select
                  value={selectedCadence?.id || ''}
                  onValueChange={(v) => {
                    const c = cadences.find(c => c.id === v);
                    if (c) setSelectedCadence(c);
                  }}
                >
                  <SelectTrigger className="w-[200px] h-8 text-xs">
                    <SelectValue placeholder="Selecionar cadência..." />
                  </SelectTrigger>
                  <SelectContent>
                    {cadences.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        <span className="flex items-center gap-2">
                          <span className={`w-1.5 h-1.5 rounded-full ${c.active ? 'bg-emerald-500' : 'bg-muted-foreground'}`} />
                          {c.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <span className="text-xs text-muted-foreground">{cadences.length} cadência(s)</span>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => {
                setEditingCadence(null);
                setCadenceForm({ name: '', description: '', sendAtTime: '09:00', startDate: new Date().toISOString().split('T')[0] });
                setShowCadenceDialog(true);
              }}>
                <Plus className="w-4 h-4 mr-1" /> Nova Cadência
              </Button>
              {selectedCadence && (
                <>
                  <Button variant="ghost" size="sm" onClick={() => {
                    setEditingCadence(selectedCadence);
                    setCadenceForm({ name: selectedCadence.name, description: selectedCadence.description || '', sendAtTime: selectedCadence.send_at_time || '09:00', startDate: selectedCadence.start_date || new Date().toISOString().split('T')[0] });
                    setShowCadenceDialog(true);
                  }}>
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDeleteCadence(selectedCadence.id)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Steps timeline */}
          {selectedCadence ? (
            <Card className="card-gradient border-border/50">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Steps — {selectedCadence.name}
                    {selectedCadence.send_at_time && <span className="text-xs text-muted-foreground font-normal">às {selectedCadence.send_at_time}</span>}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-start gap-2 overflow-x-auto pb-2">
                  {steps.map((step, idx) => (
                    <div key={step.id} className="flex items-center gap-2">
                      <div className={`relative min-w-[130px] p-3 rounded-lg border-2 cursor-pointer transition-all ${
                        idx === 0 ? 'border-primary bg-primary/5' : 'border-border bg-muted/30'
                      }`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-semibold">Dia {step.day_number}</span>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-5 w-5 p-0"><MoreHorizontal className="w-3 h-3" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuItem onClick={() => setPreviewStep(step)}><Eye className="w-3 h-3 mr-2" /> Preview</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => {
                                setEditingStep(step);
                                setStepForm({ dayNumber: step.day_number, subject: step.subject, bodyHtml: step.body_html, bodyText: step.body_text || '' });
                                setShowStepAI(false); setShowStepDialog(true);
                              }}><Edit2 className="w-3 h-3 mr-2" /> Editar</DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteStep(step.id)}><Trash2 className="w-3 h-3 mr-2" /> Excluir</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{step.subject}</p>
                        <Badge variant={step.active ? 'default' : 'secondary'} className="mt-1 text-[10px]">{step.active ? '● Ativo' : '● Inativo'}</Badge>
                      </div>
                      {idx < steps.length - 1 && <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                    </div>
                  ))}
                  <button
                    className="min-w-[50px] h-[80px] rounded-lg border-2 border-dashed border-border flex items-center justify-center hover:bg-muted/50 transition-colors"
                    onClick={() => {
                      setEditingStep(null);
                      const nextDay = steps.length > 0 ? Math.max(...steps.map(s => s.day_number)) + 2 : 1;
                      setStepForm({ dayNumber: nextDay, subject: '', bodyHtml: '', bodyText: '' });
                      setShowStepAI(false); setShowStepDialog(true);
                    }}
                  >
                    <Plus className="w-5 h-5 text-muted-foreground" />
                  </button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="card-gradient border-border/50">
              <CardContent className="py-8 text-center text-muted-foreground">
                <Clock className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm font-medium">Nenhuma cadência nesta campanha</p>
                <p className="text-xs mt-1">Crie uma cadência para definir a sequência de e-mails.</p>
              </CardContent>
            </Card>
          )}

          {/* Branching Rules */}
          {selectedCadence && (
            <Card className="card-gradient border-border/50">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <GitBranch className="w-4 h-4" /> Ramificações
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => {
                    setRuleForm({ triggerEvent: 'opened', targetCadenceId: '', delayHours: 0, timeoutHours: 48 });
                    setShowRuleDialog(true);
                  }}>
                    <Plus className="w-4 h-4 mr-1" /> Nova Regra
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {(selectedCadence.rules || []).length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-3">Nenhuma regra configurada</p>
                ) : (
                  <div className="space-y-2">
                    {(selectedCadence.rules || []).map(rule => (
                      <div key={rule.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border border-border/50">
                        <div className="flex items-center gap-2 text-sm">
                          <Badge variant="outline" className="text-xs">{triggerLabels[rule.trigger_event] || rule.trigger_event}</Badge>
                          <ChevronRight className="w-3 h-3 text-muted-foreground" />
                          <span className="font-medium">{rule.target_cadence?.name || 'Cadência'}</span>
                          {rule.delay_hours > 0 && <Badge variant="secondary" className="text-[10px]">+{rule.delay_hours}h</Badge>}
                        </div>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => handleDeleteRule(rule.id)}>
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* TAB: TEMPLATES */}
        <TabsContent value="templates" className="mt-4">
          <EmailTemplatesTab />
        </TabsContent>

        {/* TAB: SENDS */}
        <TabsContent value="sends" className="mt-4">
          <EmailSendsTab />
        </TabsContent>

        {/* TAB: INBOX/REPLIES */}
        <TabsContent value="inbox" className="mt-4">
          <EmailInboxTab />
        </TabsContent>

        {/* TAB: AI ASSISTANT */}
        <TabsContent value="ai" className="mt-4">
          <Card className="card-gradient border-border/50">
            <CardContent className="p-4">
              <EmailAIChat
                onApply={(email) => {
                  setStepForm(prev => ({ ...prev, subject: email.subject || prev.subject, bodyHtml: email.bodyHtml, bodyText: email.bodyText }));
                  setShowStepDialog(true);
                  setInnerTab('cadences');
                  toast.info('Conteúdo aplicado — configure o step e salve!');
                }}
                context={{ currentSubject: '', currentBodyHtml: '' }}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ==================== DIALOGS ==================== */}
      {renderCampaignDialog()}

      {/* Cadence Dialog */}
      <Dialog open={showCadenceDialog} onOpenChange={setShowCadenceDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingCadence ? 'Editar Cadência' : 'Nova Cadência'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Nome</label>
              <Input value={cadenceForm.name} onChange={e => setCadenceForm(p => ({ ...p, name: e.target.value }))} placeholder="Ex: Cadência de Boas-vindas" />
            </div>
            <div>
              <label className="text-sm font-medium">Descrição</label>
              <Textarea value={cadenceForm.description} onChange={e => setCadenceForm(p => ({ ...p, description: e.target.value }))} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Data de início</label>
                <Input type="date" value={cadenceForm.startDate} onChange={e => setCadenceForm(p => ({ ...p, startDate: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium">Horário de envio</label>
                <Input type="time" value={cadenceForm.sendAtTime} onChange={e => setCadenceForm(p => ({ ...p, sendAtTime: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCadenceDialog(false)}>Cancelar</Button>
            <Button onClick={handleSaveCadence} disabled={!cadenceForm.name.trim()}>{editingCadence ? 'Salvar' : 'Criar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Step Dialog */}
      <Dialog open={showStepDialog} onOpenChange={(open) => { setShowStepDialog(open); if (!open) setShowStepAI(false); }}>
        <DialogContent className={`${showStepAI ? 'max-w-5xl' : 'max-w-2xl'} max-h-[90vh] overflow-hidden flex flex-col`}>
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>{editingStep ? 'Editar Step' : 'Novo Step'}</span>
              <Button variant={showStepAI ? 'default' : 'outline'} size="sm" className="text-xs" onClick={() => setShowStepAI(!showStepAI)}>
                <Sparkles className="w-3.5 h-3.5 mr-1" /> {showStepAI ? 'Fechar IA' : 'Gerar com IA'}
              </Button>
            </DialogTitle>
          </DialogHeader>
          <div className={`flex-1 min-h-0 overflow-y-auto ${showStepAI ? 'grid grid-cols-[1fr_320px] gap-0' : ''}`}>
            <div className={`space-y-4 ${showStepAI ? 'pr-4 overflow-y-auto' : ''}`}>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Dia do envio</label>
                  <Input type="number" min={1} value={stepForm.dayNumber} onChange={e => setStepForm(p => ({ ...p, dayNumber: parseInt(e.target.value) || 1 }))} />
                </div>
                {templates.length > 0 && (
                  <div>
                    <label className="text-sm font-medium">Usar template</label>
                    <Select onValueChange={handleLoadTemplate}>
                      <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                      <SelectContent>{templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <div>
                <label className="text-sm font-medium">Assunto</label>
                <Input value={stepForm.subject} onChange={e => setStepForm(p => ({ ...p, subject: e.target.value }))} placeholder="Assunto do e-mail" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Corpo do e-mail</label>
                <EmailRichEditor value={stepForm.bodyHtml} onChange={html => setStepForm(p => ({ ...p, bodyHtml: html }))} placeholder="Escreva o corpo do e-mail..." minHeight="200px" />
              </div>
            </div>
            {showStepAI && (
              <EmailAIChat
                onApply={(email) => { setStepForm(p => ({ ...p, subject: email.subject || p.subject, bodyHtml: email.bodyHtml, bodyText: email.bodyText })); toast.info('IA aplicada!'); }}
                onClose={() => setShowStepAI(false)}
                context={{ currentSubject: stepForm.subject, currentBodyHtml: stepForm.bodyHtml }}
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowStepDialog(false); setShowStepAI(false); }}>Cancelar</Button>
            {stepForm.bodyHtml.trim() && (
              <Button variant="secondary" onClick={() => setPreviewStep({ id: editingStep?.id || 'preview', cadence_id: selectedCadence?.id || '', day_number: stepForm.dayNumber, subject: stepForm.subject, body_html: stepForm.bodyHtml, body_text: stepForm.bodyText || null, ordem: 0, active: true, created_at: '', updated_at: '' })}>
                <Eye className="w-4 h-4 mr-1" /> Preview
              </Button>
            )}
            <Button onClick={handleSaveStep} disabled={!stepForm.subject.trim() || !stepForm.bodyHtml.trim()}>{editingStep ? 'Salvar' : 'Criar Step'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rule Dialog */}
      <Dialog open={showRuleDialog} onOpenChange={setShowRuleDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova Regra de Ramificação</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Quando o lead...</label>
              <Select value={ruleForm.triggerEvent} onValueChange={v => setRuleForm(p => ({ ...p, triggerEvent: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="opened">📬 Abrir o e-mail</SelectItem>
                  <SelectItem value="clicked">🖱️ Clicar no link</SelectItem>
                  <SelectItem value="not_opened">🚫 Não abrir (timeout)</SelectItem>
                  <SelectItem value="bounced">⚠️ Bounce</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {ruleForm.triggerEvent === 'not_opened' && (
              <div>
                <label className="text-sm font-medium">Timeout (horas)</label>
                <Input type="number" min={1} value={ruleForm.timeoutHours} onChange={e => setRuleForm(p => ({ ...p, timeoutHours: parseInt(e.target.value) || 48 }))} />
              </div>
            )}
            <div>
              <label className="text-sm font-medium">Mover para cadência:</label>
              <Select value={ruleForm.targetCadenceId} onValueChange={v => setRuleForm(p => ({ ...p, targetCadenceId: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {cadences.filter(c => c.id !== selectedCadence?.id).map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Delay antes de mover (horas)</label>
              <Input type="number" min={0} value={ruleForm.delayHours} onChange={e => setRuleForm(p => ({ ...p, delayHours: parseInt(e.target.value) || 0 }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRuleDialog(false)}>Cancelar</Button>
            <Button onClick={handleSaveRule} disabled={!ruleForm.targetCadenceId}>Criar Regra</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview */}
      <EmailPreviewDialog
        open={!!previewStep}
        onOpenChange={open => !open && setPreviewStep(null)}
        subject={previewStep?.subject || ''}
        bodyHtml={previewStep?.body_html || ''}
        bodyText={previewStep?.body_text || undefined}
      />

      {/* Delete Campaign */}
      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir campanha?</AlertDialogTitle>
            <AlertDialogDescription>As cadências vinculadas também serão excluídas.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCampaign} className="bg-destructive text-destructive-foreground">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  // ==================== RENDER HELPERS ====================
  function renderCampaignDialog() {
    return (
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingCampaign ? 'Editar Campanha' : 'Nova Campanha'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Nome</label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Ex: Black Friday 2026" />
            </div>
            <div>
              <label className="text-sm font-medium">Descrição</label>
              <Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} />
            </div>
            <div>
              <label className="text-sm font-medium">Público alvo</label>
              <Select value={form.audienceId} onValueChange={v => setForm(p => ({ ...p, audienceId: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecionar público..." /></SelectTrigger>
                <SelectContent>
                  {audiences.map(a => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} ({a.contact_count || 0} contatos)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {audiences.length === 0 && <p className="text-xs text-muted-foreground mt-1">Crie um público na aba "Públicos" primeiro.</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancelar</Button>
            <Button onClick={handleSaveCampaign} disabled={!form.name.trim()}>{editingCampaign ? 'Salvar' : 'Criar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
}
