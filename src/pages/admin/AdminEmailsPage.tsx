import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  Mail, Plus, Send, Eye, MousePointer, AlertTriangle, Clock, Sparkles,
  Edit2, Trash2, MoreHorizontal, RefreshCw, Loader2, ChevronRight,
  GitBranch, Zap
} from 'lucide-react';
import EmailSettingsPanel from '@/components/email/EmailSettingsPanel';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  emailApiService,
  type EmailCadence,
  type EmailCadenceStep,
  type EmailCadenceRule,
  type SendStats,
  type GeneratedEmail,
  type EmailSend,
} from '@/services/email.service';
import { apiClient } from '@/api/client';
import { API_ENDPOINTS } from '@/api/endpoints';

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
  const [recentSends, setRecentSends] = useState<EmailSend[]>([]);
  const [funnelStages, setFunnelStages] = useState<FunnelStage[]>([]);
  const [selectedStage, setSelectedStage] = useState<FunnelStage | null>(null);
  const [loading, setLoading] = useState(true);

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

  // ==================== DATA LOADING ====================
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [cadencesData, statsData, sendsData] = await Promise.all([
        emailApiService.listCadences(),
        emailApiService.getSendStats().catch(() => ({ total: 0, sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, failed: 0 })),
        emailApiService.listSends({ limit: 10 }).catch(() => []),
      ]);
      setCadences(cadencesData);
      setStats(statsData);
      setRecentSends(sendsData);
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
      const tagsRes = await apiClient.get<any>(API_ENDPOINTS.TAGS.LIST, { params: { type: 'stage', ativo: true } });
      const tags: any[] = tagsRes?.data ?? tagsRes ?? [];

      const leadTagsRes = await apiClient.get<any>('/api/lead-tags');
      const leadTags: any[] = leadTagsRes?.data ?? leadTagsRes ?? [];

      const contactsRes = await apiClient.get<any>(API_ENDPOINTS.CONTACTS.LIST);
      const contacts: any[] = contactsRes?.data ?? contactsRes ?? [];
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

  useEffect(() => { loadData(); loadFunnelStages(); }, [loadData, loadFunnelStages]);

  // ==================== CADENCE CRUD ====================
  const handleSaveCadence = async () => {
    try {
      if (editingCadence) {
        const updated = await emailApiService.updateCadence(editingCadence.id, cadenceForm);
        setCadences(prev => prev.map(c => c.id === updated.id ? updated : c));
        if (selectedCadence?.id === updated.id) setSelectedCadence(updated);
        toast.success('Cadência atualizada!');
      } else {
        const created = await emailApiService.createCadence(cadenceForm);
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
      await emailApiService.deleteCadence(id);
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
        await emailApiService.updateStep(editingStep.id, stepForm);
        toast.success('Step atualizado!');
      } else {
        await emailApiService.createStep(selectedCadence.id, stepForm);
        toast.success('Step criado!');
      }
      setShowStepDialog(false);
      setStepForm({ dayNumber: 1, subject: '', bodyHtml: '', bodyText: '' });
      setEditingStep(null);
      // Reload cadence
      const updated = await emailApiService.getCadence(selectedCadence.id);
      setSelectedCadence(updated);
      setCadences(prev => prev.map(c => c.id === updated.id ? updated : c));
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar step');
    }
  };

  const handleDeleteStep = async (stepId: string) => {
    if (!selectedCadence) return;
    try {
      await emailApiService.deleteStep(stepId);
      const updated = await emailApiService.getCadence(selectedCadence.id);
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
      const result = await emailApiService.generateEmail(aiPrompt, {
        leadName: selectedLead?.nome,
        leadEmail: selectedLead?.email,
        stageName: selectedStage?.name,
      });
      setGeneratedEmail(result);
      toast.success('E-mail gerado com sucesso!');
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao gerar e-mail. Verifique a chave OpenAI.');
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

  // ==================== ENROLL (with confirmation) ====================
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
      await emailApiService.enroll(selectedCadence.id, contactIds);
      toast.success(`${contactIds.length} contato(s) inscritos na cadência "${selectedCadence.name}"!`);
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao inscrever contatos');
    }
  };

  // ==================== RULES ====================
  const handleSaveRule = async () => {
    if (!selectedCadence || !ruleForm.targetCadenceId) return;
    try {
      await emailApiService.createRule(selectedCadence.id, ruleForm);
      toast.success('Regra de ramificação criada!');
      setShowRuleDialog(false);
      setRuleForm({ triggerEvent: 'opened', targetCadenceId: '', delayHours: 0 });
      const updated = await emailApiService.getCadence(selectedCadence.id);
      setSelectedCadence(updated);
      setCadences(prev => prev.map(c => c.id === updated.id ? updated : c));
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao criar regra');
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!selectedCadence) return;
    try {
      await emailApiService.deleteRule(ruleId);
      toast.success('Regra excluída!');
      const updated = await emailApiService.getCadence(selectedCadence.id);
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
    { label: 'Bounced', value: stats.bounced, icon: AlertTriangle, color: 'text-destructive' },
  ];

  const steps = selectedCadence?.steps || [];

  return (
    <div className="page-container space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">E-mails</h1>
          <p className="text-muted-foreground">Cadência automática com assistência de IA</p>
        </div>
        <Button
          className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
          onClick={() => { setEditingCadence(null); setCadenceForm({ name: '', description: '' }); setShowCadenceDialog(true); }}
        >
          <Plus className="w-4 h-4 mr-2" />
          Nova Cadência
        </Button>
      </div>

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

      {/* Main Content Grid */}
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
                {selectedCadence && (
                  <div className="flex items-center gap-2">
                    {cadences.length > 1 && (
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
                    <Button variant="ghost" size="sm" onClick={() => {
                      setEditingCadence(selectedCadence);
                      setCadenceForm({ name: selectedCadence.name, description: selectedCadence.description || '' });
                      setShowCadenceDialog(true);
                    }}>
                      <Edit2 className="w-4 h-4" />
                      <span className="ml-1 text-xs">Editar</span>
                    </Button>
                  </div>
                )}
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
                  {/* Steps timeline */}
                  <div className="flex items-start gap-2 overflow-x-auto pb-2">
                    {steps.map((step, idx) => (
                      <div key={step.id} className="flex items-center gap-2">
                        <div
                          className={`relative min-w-[140px] p-3 rounded-lg border-2 cursor-pointer transition-all ${
                            idx === 0 ? 'border-destructive bg-destructive/5' : 'border-border bg-muted/30'
                          }`}
                        >
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

                    {/* Add step button */}
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

          {/* Funnel Section */}
          <Card className="card-gradient border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Funil de Leads</CardTitle>
                <Button variant="ghost" size="sm" onClick={loadFunnelStages}>
                  <RefreshCw className="w-4 h-4 mr-1" /> Atualizar
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">Selecione uma etapa para ver os leads e respostas pré-definidas</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Stage pills */}
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

              {/* Selected stage contacts */}
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
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100">
                              <MoreHorizontal className="w-3 h-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem onClick={() => setSelectedLead(contact)}>
                              Selecionar para IA
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
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
              {/* Email preview */}
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
                    <Badge variant="outline" className="cursor-pointer hover:bg-muted" onClick={() => setAiPrompt('Tom mais amigável')}>Tom amigável</Badge>
                    <Badge variant="outline" className="cursor-pointer hover:bg-muted" onClick={() => setAiPrompt('Inclua prova social')}>Incluir prova social</Badge>
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
                <div className="flex gap-2">
                  <Button
                    className="flex-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                    onClick={handleGenerateEmail}
                    disabled={aiGenerating || !aiPrompt.trim()}
                  >
                    {aiGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                    {aiGenerating ? 'Gerando...' : 'Gerar'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Recent Sends */}
          <Card className="card-gradient border-border/50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Send className="w-5 h-5" />
                Últimos Envios
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentSends.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum envio registrado ainda.</p>
              ) : (
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {recentSends.map(send => (
                    <div key={send.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30 text-sm">
                      <div className="truncate flex-1">
                        <p className="font-medium truncate">{send.to_email}</p>
                        <p className="text-xs text-muted-foreground truncate">{send.subject}</p>
                      </div>
                      <Badge
                        variant={
                          send.status === 'sent' || send.status === 'delivered' ? 'default' :
                          send.status === 'opened' || send.status === 'clicked' ? 'default' :
                          send.status === 'bounced' || send.status === 'failed' ? 'destructive' : 'secondary'
                        }
                        className="text-[10px] ml-2"
                      >
                        {send.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Settings Panel */}
      <EmailSettingsPanel />

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
    </div>
  );
}
