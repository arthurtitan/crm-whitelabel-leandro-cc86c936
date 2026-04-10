import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  Mail, Plus, Send, Eye, MousePointer, AlertTriangle, Clock, Sparkles,
  Edit2, Trash2, MoreHorizontal, RefreshCw, Loader2, ChevronRight,
  GitBranch, Zap, AlertCircle, FileText, Users
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  emailService,
  type EmailCadence,
  type EmailCadenceStep,
  type EmailCadenceRule,
  type SendStats,
  type GeneratedEmail,
  type EmailSend,
} from '@/services/email.service';
import { useBackend } from '@/config/backend.config';
import { apiClient } from '@/api/client';
import { API_ENDPOINTS } from '@/api/endpoints';
import { supabase } from '@/integrations/supabase/client';
import EmailTemplatesTab from '@/components/email/EmailTemplatesTab';
import EmailEnrollmentsTab from '@/components/email/EmailEnrollmentsTab';
import EmailSendsTab from '@/components/email/EmailSendsTab';

// ==================== TYPES ====================
interface FunnelStage {
  id: string;
  name: string;
  color: string;
  contacts: { id: string; nome?: string; email?: string }[];
}

// ==================== COMPONENT ====================
export default function AdminEmailsPage() {
  // State
  const [cadences, setCadences] = useState<EmailCadence[]>([]);
  const [selectedCadence, setSelectedCadence] = useState<EmailCadence | null>(null);
  const [stats, setStats] = useState<SendStats>({ total: 0, sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, failed: 0 });
  const [funnelStages, setFunnelStages] = useState<FunnelStage[]>([]);
  const [selectedStage, setSelectedStage] = useState<FunnelStage | null>(null);
  const [loading, setLoading] = useState(true);
  const [credentialsConfigured, setCredentialsConfigured] = useState<boolean | null>(null);

  // Dialogs
  const [showCadenceDialog, setShowCadenceDialog] = useState(false);
  const [showStepDialog, setShowStepDialog] = useState(false);
  const [showRuleDialog, setShowRuleDialog] = useState(false);
  const [showEnrollConfirm, setShowEnrollConfirm] = useState(false);
  const [editingCadence, setEditingCadence] = useState<EmailCadence | null>(null);
  const [editingStep, setEditingStep] = useState<EmailCadenceStep | null>(null);

  // Rules
  const [ruleForm, setRuleForm] = useState({ triggerEvent: 'opened', targetCadenceId: '', delayHours: 0 });

  // AI Assistant
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [generatedEmail, setGeneratedEmail] = useState<GeneratedEmail | null>(null);
  const [selectedLead, setSelectedLead] = useState<{ nome?: string; email?: string } | null>(null);

  // Form state
  const [cadenceForm, setCadenceForm] = useState({ name: '', description: '' });
  const [stepForm, setStepForm] = useState({ dayNumber: 1, subject: '', bodyHtml: '', bodyText: '' });

  // ==================== CHECK CREDENTIALS ====================
  const checkCredentials = useCallback(async () => {
    try {
      const settings = await emailService.getSettings();
      setCredentialsConfigured(settings.hasSendgridKey);
    } catch {
      setCredentialsConfigured(false);
    }
  }, []);

  // ==================== DATA LOADING ====================
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [cadencesData, statsData] = await Promise.all([
        emailService.listCadences(),
        emailService.getSendStats().catch(() => ({ total: 0, sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, failed: 0 })),
      ]);
      setCadences(cadencesData);
      setStats(statsData);
      if (cadencesData.length > 0 && !selectedCadence) {
        setSelectedCadence(cadencesData[0]);
      }
    } catch (err: any) {
      console.error('Erro ao carregar dados de e-mail:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFunnelStages = useCallback(async () => {
    try {
      let tags: any[] = [];
      let leadTags: any[] = [];
      let contacts: any[] = [];

      if (useBackend) {
        const tagsRes = await apiClient.get<any>(API_ENDPOINTS.TAGS.LIST, { params: { type: 'stage', ativo: true } });
        tags = tagsRes?.data ?? tagsRes ?? [];
        const leadTagsRes = await apiClient.get<any>('/api/lead-tags');
        leadTags = leadTagsRes?.data ?? leadTagsRes ?? [];
        const contactsRes = await apiClient.get<any>(API_ENDPOINTS.CONTACTS.LIST);
        contacts = contactsRes?.data ?? contactsRes ?? [];
      } else {
        const { data: tagsData } = await supabase.from('tags').select('*').eq('type', 'stage').eq('ativo', true).order('ordem');
        tags = tagsData || [];
        const { data: ltData } = await supabase.from('lead_tags').select('*');
        leadTags = ltData || [];
        const { data: cData } = await supabase.from('contacts').select('id, nome, email');
        contacts = cData || [];
      }

      const contactMap = new Map(contacts.map((c: any) => [c.id, c]));

      const stages: FunnelStage[] = tags
        .sort((a: any, b: any) => (a.ordem ?? 0) - (b.ordem ?? 0))
        .map((tag: any) => {
          const tagContacts = leadTags
            .filter((lt: any) => (lt.tag_id ?? lt.tagId) === tag.id)
            .map((lt: any) => contactMap.get(lt.contact_id ?? lt.contactId))
            .filter(Boolean)
            .map((c: any) => ({ id: c.id, nome: c.nome, email: c.email }));
          return {
            id: tag.id,
            name: tag.name,
            color: tag.color || '#6366F1',
            contacts: tagContacts,
          };
        });

      setFunnelStages(stages);
      if (stages.length > 0 && !selectedStage) setSelectedStage(stages[0]);
    } catch (err) {
      console.error('Erro ao carregar funil:', err);
    }
  }, []);

  useEffect(() => {
    checkCredentials();
    loadData();
    loadFunnelStages();
  }, [checkCredentials, loadData, loadFunnelStages]);

  // ==================== CADENCE CRUD ====================
  const handleSaveCadence = async () => {
    try {
      if (editingCadence) {
        const updated = await emailService.updateCadence(editingCadence.id, cadenceForm);
        setCadences(prev => prev.map(c => c.id === updated.id ? updated : c));
        if (selectedCadence?.id === updated.id) setSelectedCadence(updated);
        toast.success('Cadência atualizada!');
      } else {
        const created = await emailService.createCadence(cadenceForm);
        setCadences(prev => [created, ...prev]);
        setSelectedCadence(created);
        toast.success('Cadência criada!');
      }
      setShowCadenceDialog(false);
      setCadenceForm({ name: '', description: '' });
      setEditingCadence(null);
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar cadência');
    }
  };

  const handleDeleteCadence = async (id: string) => {
    try {
      await emailService.deleteCadence(id);
      setCadences(prev => prev.filter(c => c.id !== id));
      if (selectedCadence?.id === id) setSelectedCadence(null);
      toast.success('Cadência excluída!');
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao excluir cadência');
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
      const updated = await emailService.getCadence(selectedCadence.id);
      setSelectedCadence(updated);
      setCadences(prev => prev.map(c => c.id === updated.id ? updated : c));
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar step');
    }
  };

  const handleDeleteStep = async (stepId: string) => {
    if (!selectedCadence) return;
    try {
      await emailService.deleteStep(stepId);
      const updated = await emailService.getCadence(selectedCadence.id);
      setSelectedCadence(updated);
      setCadences(prev => prev.map(c => c.id === updated.id ? updated : c));
      toast.success('Step excluído!');
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao excluir step');
    }
  };

  // ==================== AI GENERATION ====================
  const handleGenerateEmail = async () => {
    if (!aiPrompt.trim()) return;
    setAiGenerating(true);
    try {
      const result = await emailService.generateEmail(aiPrompt, {
        leadName: selectedLead?.nome,
        leadEmail: selectedLead?.email,
        stageName: selectedStage?.name,
      });
      setGeneratedEmail(result);
      toast.success('E-mail gerado com sucesso!');
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao gerar e-mail. Verifique as configurações.');
    } finally {
      setAiGenerating(false);
    }
  };

  const handleApplyGenerated = () => {
    if (!generatedEmail) return;
    setStepForm({
      dayNumber: stepForm.dayNumber || 1,
      subject: generatedEmail.subject,
      bodyHtml: generatedEmail.bodyHtml,
      bodyText: generatedEmail.bodyText,
    });
    setShowStepDialog(true);
    toast.info('Texto aplicado ao formulário de step!');
  };

  // ==================== ENROLL ====================
  const handleEnrollStageContacts = async () => {
    if (!selectedCadence || !selectedStage) return;
    const contactIds = selectedStage.contacts.filter(c => c.email).map(c => c.id);
    if (contactIds.length === 0) {
      toast.warning('Nenhum contato com e-mail nesta etapa.');
      return;
    }
    setShowEnrollConfirm(true);
  };

  const confirmEnroll = async () => {
    if (!selectedCadence || !selectedStage) return;
    const contactIds = selectedStage.contacts.filter(c => c.email).map(c => c.id);
    setShowEnrollConfirm(false);
    try {
      await emailService.enroll(selectedCadence.id, contactIds);
      toast.success(`${contactIds.length} contato(s) inscritos na cadência "${selectedCadence.name}"!`);
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao inscrever contatos');
    }
  };

  // ==================== RULES ====================
  const handleSaveRule = async () => {
    if (!selectedCadence || !ruleForm.targetCadenceId) return;
    try {
      await emailService.createRule(selectedCadence.id, ruleForm);
      toast.success('Regra de ramificação criada!');
      setShowRuleDialog(false);
      setRuleForm({ triggerEvent: 'opened', targetCadenceId: '', delayHours: 0 });
      const updated = await emailService.getCadence(selectedCadence.id);
      setSelectedCadence(updated);
      setCadences(prev => prev.map(c => c.id === updated.id ? updated : c));
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao criar regra');
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!selectedCadence) return;
    try {
      await emailService.deleteRule(ruleId);
      toast.success('Regra excluída!');
      const updated = await emailService.getCadence(selectedCadence.id);
      setSelectedCadence(updated);
      setCadences(prev => prev.map(c => c.id === updated.id ? updated : c));
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao excluir regra');
    }
  };

  const triggerEventLabels: Record<string, string> = {
    opened: '📬 Abriu o e-mail',
    clicked: '🖱️ Clicou no link',
    replied: '💬 Respondeu',
    not_opened: '🚫 Não abriu',
    bounced: '⚠️ Bounce',
  };

  const kpis = [
    { label: 'Enviados', value: stats.sent + stats.delivered, icon: Send, color: 'text-blue-400' },
    { label: 'Entregues', value: stats.delivered, icon: Mail, color: 'text-emerald-400' },
    { label: 'Abertos', value: stats.opened, icon: Eye, color: 'text-violet-400' },
    { label: 'Clicados', value: stats.clicked, icon: MousePointer, color: 'text-cyan-400' },
    { label: 'Falhas', value: stats.bounced + stats.failed, icon: AlertTriangle, color: 'text-destructive' },
  ];

  const steps = selectedCadence?.steps || [];

  return (
    <div className="page-container space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">E-mails</h1>
          <p className="text-muted-foreground">Automação de e-mails com cadências inteligentes</p>
        </div>
      </div>

      {/* Credentials Warning (white-label) */}
      {credentialsConfigured === false && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium">Módulo de e-mails não configurado</p>
              <p className="text-xs text-muted-foreground">
                As credenciais de envio de e-mail ainda não foram configuradas para sua conta.
                Entre em contato com o suporte para ativar este recurso.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="card-gradient border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-muted/50 flex items-center justify-center">
                  <kpi.icon className={`w-5 h-5 ${kpi.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold">{kpi.value}</p>
                  <p className="text-xs text-muted-foreground">{kpi.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="cadences" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="cadences" className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Cadências
          </TabsTrigger>
          <TabsTrigger value="templates" className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="enrollments" className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Inscrições
          </TabsTrigger>
          <TabsTrigger value="sends" className="flex items-center gap-2">
            <Send className="w-4 h-4" />
            Envios
          </TabsTrigger>
        </TabsList>

        {/* ==================== TAB: CADENCES ==================== */}
        <TabsContent value="cadences" className="mt-6">
          <div className="grid lg:grid-cols-3 gap-6">
            {/* LEFT: Cadence + Funnel */}
            <div className="lg:col-span-2 space-y-6">
              {/* Cadence Section */}
              <Card className="card-gradient border-border/50">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Clock className="w-5 h-5" />
                      Cadência de Disparo
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      {selectedCadence && cadences.length > 1 && (
                        <Select
                          value={selectedCadence.id}
                          onValueChange={(v) => {
                            const c = cadences.find(c => c.id === v);
                            if (c) setSelectedCadence(c);
                          }}
                        >
                          <SelectTrigger className="w-[200px] h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {cadences.map(c => (
                              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <Button size="sm" onClick={() => {
                        setEditingCadence(null);
                        setCadenceForm({ name: '', description: '' });
                        setShowCadenceDialog(true);
                      }}>
                        <Plus className="w-4 h-4 mr-1" /> Nova
                      </Button>
                      {selectedCadence && (
                        <Button variant="ghost" size="sm" onClick={() => {
                          setEditingCadence(selectedCadence);
                          setCadenceForm({ name: selectedCadence.name, description: selectedCadence.description || '' });
                          setShowCadenceDialog(true);
                        }}>
                          <Edit2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">Sequência automática de e-mails por dias</p>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                  ) : !selectedCadence ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Mail className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p className="font-medium">Nenhuma cadência criada</p>
                      <p className="text-sm mt-1">Crie sua primeira cadência para começar.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-start gap-2 overflow-x-auto pb-2">
                        {steps.map((step, idx) => (
                          <div key={step.id} className="flex items-center gap-2">
                            <div className={`relative min-w-[140px] p-3 rounded-lg border-2 cursor-pointer transition-all ${
                              idx === 0 ? 'border-primary bg-primary/5' : 'border-border bg-muted/30'
                            }`}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-sm font-semibold">Dia {step.day_number}</span>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0">
                                      <MoreHorizontal className="w-3 h-3" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent>
                                    <DropdownMenuItem onClick={() => {
                                      setEditingStep(step);
                                      setStepForm({
                                        dayNumber: step.day_number,
                                        subject: step.subject,
                                        bodyHtml: step.body_html,
                                        bodyText: step.body_text || '',
                                      });
                                      setShowStepDialog(true);
                                    }}>
                                      <Edit2 className="w-3 h-3 mr-2" /> Editar
                                    </DropdownMenuItem>
                                    <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteStep(step.id)}>
                                      <Trash2 className="w-3 h-3 mr-2" /> Excluir
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                              <p className="text-xs text-muted-foreground truncate">{step.subject}</p>
                              <Badge variant={step.active ? 'default' : 'secondary'} className="mt-1 text-[10px]">
                                {step.active ? '● Ativo' : '● Inativo'}
                              </Badge>
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
                            setShowStepDialog(true);
                          }}
                        >
                          <Plus className="w-5 h-5 text-muted-foreground" />
                        </button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Branching Rules */}
              {selectedCadence && (
                <Card className="card-gradient border-border/50">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <GitBranch className="w-5 h-5" />
                        Regras de Ramificação
                      </CardTitle>
                      <Button variant="ghost" size="sm" onClick={() => {
                        setRuleForm({ triggerEvent: 'opened', targetCadenceId: '', delayHours: 0 });
                        setShowRuleDialog(true);
                      }}>
                        <Plus className="w-4 h-4 mr-1" /> Nova Regra
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Mova leads automaticamente para outras cadências com base em ações
                    </p>
                  </CardHeader>
                  <CardContent>
                    {(selectedCadence.rules || []).length === 0 ? (
                      <div className="text-center py-4 text-muted-foreground">
                        <Zap className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">Nenhuma regra configurada</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {(selectedCadence.rules || []).map(rule => (
                          <div key={rule.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50">
                            <div className="flex items-center gap-3">
                              <Badge variant="outline" className="text-xs">
                                {triggerEventLabels[rule.trigger_event] || rule.trigger_event}
                              </Badge>
                              <ChevronRight className="w-4 h-4 text-muted-foreground" />
                              <span className="text-sm font-medium">
                                {rule.target_cadence?.name || 'Cadência'}
                              </span>
                              {rule.delay_hours > 0 && (
                                <Badge variant="secondary" className="text-[10px]">+{rule.delay_hours}h</Badge>
                              )}
                            </div>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleDeleteRule(rule.id)}>
                              <Trash2 className="w-3 h-3 text-destructive" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Funnel Section */}
              <Card className="card-gradient border-border/50">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Funil de Leads</CardTitle>
                    <Button variant="ghost" size="sm" onClick={loadFunnelStages}>
                      <RefreshCw className="w-4 h-4 mr-1" /> Atualizar
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">Selecione uma etapa para inscrever leads na cadência</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-3 overflow-x-auto pb-2">
                    {funnelStages.map(stage => (
                      <button
                        key={stage.id}
                        onClick={() => setSelectedStage(stage)}
                        className={`flex items-center gap-2 px-4 py-3 rounded-lg border-2 min-w-[100px] transition-all ${
                          selectedStage?.id === stage.id
                            ? 'border-primary bg-primary/5'
                            : 'border-border bg-muted/30 hover:bg-muted/50'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color }} />
                        <span className="text-lg font-bold">{stage.contacts.length}</span>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">{stage.name}</span>
                      </button>
                    ))}
                  </div>

                  {selectedStage && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: selectedStage.color }} />
                          {selectedStage.name} ({selectedStage.contacts.length})
                        </p>
                        {selectedCadence && (
                          <Button size="sm" variant="outline" onClick={handleEnrollStageContacts}>
                            <Mail className="w-3 h-3 mr-1" /> Inscrever na cadência
                          </Button>
                        )}
                      </div>
                      <div className="space-y-1 max-h-[200px] overflow-y-auto">
                        {selectedStage.contacts.slice(0, 10).map(contact => (
                          <div
                            key={contact.id}
                            className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 group cursor-pointer"
                            onClick={() => setSelectedLead(contact)}
                          >
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                                {(contact.nome || '?')[0].toUpperCase()}
                              </div>
                              <span className="text-sm">{contact.nome || 'Sem nome'}</span>
                            </div>
                          </div>
                        ))}
                        {selectedStage.contacts.length > 10 && (
                          <p className="text-xs text-muted-foreground text-center py-2">
                            + {selectedStage.contacts.length - 10} mais leads
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* RIGHT: AI Assistant */}
            <div className="space-y-4">
              <Card className="card-gradient border-border/50">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-violet-400" />
                    Assistente de IA
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">Gere e-mails personalizados com IA</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {generatedEmail ? (
                    <div className="space-y-3">
                      <div className="text-xs text-muted-foreground">PRÉVIA DO E-MAIL</div>
                      <div className="space-y-2">
                        <div className="flex gap-2 text-sm">
                          <span className="text-muted-foreground">Para:</span>
                          <span>{selectedLead?.email || '[Lead selecionado]'}</span>
                        </div>
                        <div className="flex gap-2 text-sm">
                          <span className="text-muted-foreground">Assunto:</span>
                          <span className="font-medium">{generatedEmail.subject}</span>
                        </div>
                      </div>
                      <Separator />
                      <div
                        className="prose prose-sm max-w-none text-sm p-3 rounded-lg bg-background border border-border max-h-[250px] overflow-y-auto"
                        dangerouslySetInnerHTML={{ __html: generatedEmail.bodyHtml }}
                      />
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline" className="cursor-pointer hover:bg-muted" onClick={() => setAiPrompt('Reescreva mais formal')}>Mais formal</Badge>
                        <Badge variant="outline" className="cursor-pointer hover:bg-muted" onClick={() => setAiPrompt('Reescreva mais curto')}>Mais curto</Badge>
                        <Badge variant="outline" className="cursor-pointer hover:bg-muted" onClick={() => setAiPrompt('Adicione um CTA claro')}>Adicionar CTA</Badge>
                      </div>
                      <Button className="w-full" onClick={handleApplyGenerated}>
                        <Send className="w-4 h-4 mr-2" />
                        Usar nesta cadência
                      </Button>
                    </div>
                  ) : (
                    <div className="p-4 rounded-lg bg-muted/30 border border-border/50 text-center">
                      <p className="text-xs text-muted-foreground mb-2">Gere um e-mail descrevendo o que deseja:</p>
                      <p className="text-sm italic text-muted-foreground">"Crie um e-mail de apresentação para clínicas de estética"</p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Textarea
                      placeholder="Ex: lead do setor educacional, tom formal..."
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      rows={2}
                      className="resize-none"
                    />
                    <Button
                      className="w-full"
                      onClick={handleGenerateEmail}
                      disabled={aiGenerating || !aiPrompt.trim()}
                    >
                      {aiGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                      {aiGenerating ? 'Gerando...' : 'Gerar'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ==================== TAB: TEMPLATES ==================== */}
        <TabsContent value="templates" className="mt-6">
          <EmailTemplatesTab />
        </TabsContent>

        {/* ==================== TAB: ENROLLMENTS ==================== */}
        <TabsContent value="enrollments" className="mt-6">
          <EmailEnrollmentsTab />
        </TabsContent>

        {/* ==================== TAB: SENDS ==================== */}
        <TabsContent value="sends" className="mt-6">
          <EmailSendsTab />
        </TabsContent>
      </Tabs>

      {/* ==================== DIALOGS ==================== */}

      {/* Cadence Dialog */}
      <Dialog open={showCadenceDialog} onOpenChange={setShowCadenceDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCadence ? 'Editar Cadência' : 'Nova Cadência'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Nome</label>
              <Input
                value={cadenceForm.name}
                onChange={(e) => setCadenceForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Ex: Cadência Onboarding"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Descrição</label>
              <Textarea
                value={cadenceForm.description}
                onChange={(e) => setCadenceForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Descrição da cadência..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCadenceDialog(false)}>Cancelar</Button>
            <Button onClick={handleSaveCadence} disabled={!cadenceForm.name.trim()}>
              {editingCadence ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Step Dialog */}
      <Dialog open={showStepDialog} onOpenChange={setShowStepDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingStep ? 'Editar Step' : 'Novo Step'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Dia do envio</label>
              <Input
                type="number"
                min={1}
                value={stepForm.dayNumber}
                onChange={(e) => setStepForm(prev => ({ ...prev, dayNumber: parseInt(e.target.value) || 1 }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Assunto</label>
              <Input
                value={stepForm.subject}
                onChange={(e) => setStepForm(prev => ({ ...prev, subject: e.target.value }))}
                placeholder="Assunto do e-mail"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Corpo do e-mail (HTML)</label>
              <Textarea
                value={stepForm.bodyHtml}
                onChange={(e) => setStepForm(prev => ({ ...prev, bodyHtml: e.target.value }))}
                placeholder="<p>Olá {nome}, ...</p>"
                rows={6}
              />
              <p className="text-xs text-muted-foreground mt-1">Use {'{'} nome {'}'} e {'{'} email {'}'} como variáveis.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStepDialog(false)}>Cancelar</Button>
            <Button onClick={handleSaveStep} disabled={!stepForm.subject.trim() || !stepForm.bodyHtml.trim()}>
              {editingStep ? 'Salvar' : 'Criar Step'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Enrollment Confirmation */}
      <AlertDialog open={showEnrollConfirm} onOpenChange={setShowEnrollConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar inscrição na cadência</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a inscrever{' '}
              <strong>{selectedStage?.contacts.filter(c => c.email).length || 0} contato(s)</strong>{' '}
              com e-mail da etapa <strong>"{selectedStage?.name}"</strong> na cadência{' '}
              <strong>"{selectedCadence?.name}"</strong>.
              <br /><br />
              Os e-mails serão disparados automaticamente de acordo com a programação da cadência.
              Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmEnroll}>
              Confirmar e Inscrever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rule Dialog */}
      <Dialog open={showRuleDialog} onOpenChange={setShowRuleDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Regra de Ramificação</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Quando o lead...</label>
              <Select
                value={ruleForm.triggerEvent}
                onValueChange={(v) => setRuleForm(prev => ({ ...prev, triggerEvent: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="opened">📬 Abrir o e-mail</SelectItem>
                  <SelectItem value="clicked">🖱️ Clicar no link</SelectItem>
                  <SelectItem value="replied">💬 Responder</SelectItem>
                  <SelectItem value="not_opened">🚫 Não abrir</SelectItem>
                  <SelectItem value="bounced">⚠️ Bounce</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Mover para cadência:</label>
              <Select
                value={ruleForm.targetCadenceId}
                onValueChange={(v) => setRuleForm(prev => ({ ...prev, targetCadenceId: v }))}
              >
                <SelectTrigger><SelectValue placeholder="Selecione uma cadência" /></SelectTrigger>
                <SelectContent>
                  {cadences.filter(c => c.id !== selectedCadence?.id).map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Aguardar (horas) antes de mover</label>
              <Input
                type="number"
                min={0}
                value={ruleForm.delayHours}
                onChange={(e) => setRuleForm(prev => ({ ...prev, delayHours: parseInt(e.target.value) || 0 }))}
              />
              <p className="text-xs text-muted-foreground mt-1">0 = mover imediatamente</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRuleDialog(false)}>Cancelar</Button>
            <Button onClick={handleSaveRule} disabled={!ruleForm.targetCadenceId}>
              Criar Regra
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
