import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  Mail, Plus, Send, Eye, MousePointer, AlertTriangle, Clock, Sparkles,
  Edit2, Trash2, MoreHorizontal, Loader2, ChevronRight,
  GitBranch, Zap, AlertCircle, FileText, Users, Inbox, FolderOpen
} from 'lucide-react';
import EmailPreviewDialog from '@/components/email/EmailPreviewDialog';
import EmailRichEditor from '@/components/email/EmailRichEditor';
import EmailAIChat from '@/components/email/EmailAIChat';
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
  type EmailTemplate,
} from '@/services/email.service';
import { useBackend } from '@/config/backend.config';
import { apiClient } from '@/api/client';
import { API_ENDPOINTS } from '@/api/endpoints';
import { supabase } from '@/integrations/supabase/client';
import EmailTemplatesTab from '@/components/email/EmailTemplatesTab';
import EmailEnrollmentsTab from '@/components/email/EmailEnrollmentsTab';
import EmailSendsTab from '@/components/email/EmailSendsTab';
import EmailInboxTab from '@/components/email/EmailInboxTab';
import EmailCampaignsTab from '@/components/email/EmailCampaignsTab';

export default function AdminEmailsPage() {
  // State
  const [cadences, setCadences] = useState<EmailCadence[]>([]);
  const [selectedCadence, setSelectedCadence] = useState<EmailCadence | null>(null);
  const [stats, setStats] = useState<SendStats>({ total: 0, sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, failed: 0 });
  const [loading, setLoading] = useState(true);
  const [credentialsConfigured, setCredentialsConfigured] = useState<boolean | null>(null);
  const [processingQueue, setProcessingQueue] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Dialogs
  const [showCadenceDialog, setShowCadenceDialog] = useState(false);
  const [showStepDialog, setShowStepDialog] = useState(false);
  const [showRuleDialog, setShowRuleDialog] = useState(false);
  const [previewStep, setPreviewStep] = useState<EmailCadenceStep | null>(null);
  const [showStepAI, setShowStepAI] = useState(false);

  const [editingCadence, setEditingCadence] = useState<EmailCadence | null>(null);
  const [editingStep, setEditingStep] = useState<EmailCadenceStep | null>(null);

  // Rules
  const [ruleForm, setRuleForm] = useState({ triggerEvent: 'opened', targetCadenceId: '', delayHours: 0, timeoutHours: 48 });

  // Templates for step integration
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);

  // Form state
  const [cadenceForm, setCadenceForm] = useState({ name: '', description: '', sendAtTime: '09:00', startDate: new Date().toISOString().split('T')[0] });
  const [stepForm, setStepForm] = useState({ dayNumber: 1, subject: '', bodyHtml: '', bodyText: '' });

  // Check credentials
  const checkCredentials = useCallback(async () => {
    try {
      const settings = await emailService.getSettings();
      setCredentialsConfigured(settings.hasSendgridKey);
    } catch {
      setCredentialsConfigured(false);
    }
  }, []);

  // Data loading
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [cadencesData, statsData, templatesData] = await Promise.all([
        emailService.listCadences(),
        emailService.getSendStats().catch(() => ({ total: 0, sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, failed: 0 })),
        emailService.listTemplates().catch(() => []),
      ]);
      setCadences(cadencesData);
      setStats(statsData);
      setTemplates(templatesData);
      if (cadencesData.length > 0 && !selectedCadence) {
        setSelectedCadence(cadencesData[0]);
      }
      // Load unread count
      emailService.getUnreadCount().then(setUnreadCount).catch(() => {});
    } catch (err: any) {
      console.error('Erro ao carregar dados de e-mail:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkCredentials();
    loadData();
  }, [checkCredentials, loadData]);

  // Cadence CRUD
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
      setCadenceForm({ name: '', description: '', sendAtTime: '09:00', startDate: new Date().toISOString().split('T')[0] });
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

  // Step CRUD
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

  // Load template into step
  const handleLoadTemplate = (templateId: string) => {
    const t = templates.find(t => t.id === templateId);
    if (t) {
      setStepForm(prev => ({
        ...prev,
        subject: t.subject,
        bodyHtml: t.body_html,
        bodyText: t.body_text || '',
      }));
      toast.info(`Template "${t.name}" carregado!`);
    }
  };

  // Rules
  const handleSaveRule = async () => {
    if (!selectedCadence || !ruleForm.targetCadenceId) return;
    try {
      await emailService.createRule(selectedCadence.id, ruleForm);
      toast.success('Regra de ramificação criada!');
      setShowRuleDialog(false);
      setRuleForm({ triggerEvent: 'opened', targetCadenceId: '', delayHours: 0, timeoutHours: 48 });
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

  // Process Queue
  const handleProcessQueue = async () => {
    if (!selectedCadence) {
      toast.info('Selecione uma cadência antes de disparar.');
      return;
    }
    setProcessingQueue(true);
    try {
      const result = await emailService.processQueue(selectedCadence.id);
      if (result.processed > 0) {
        toast.success(`${result.processed} e-mail(s) da cadência "${selectedCadence.name}" processado(s)!`);
      } else {
        toast.info(`Nenhum e-mail pendente na cadência "${selectedCadence.name}".`);
      }
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao processar fila de e-mails');
    } finally {
      setProcessingQueue(false);
    }
  };

  const triggerEventLabels: Record<string, string> = {
    opened: '📬 Abriu o e-mail',
    clicked: '🖱️ Clicou no link',
    not_opened: '🚫 Não abriu (timeout)',
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
        <Button
          variant="outline"
          size="sm"
          onClick={handleProcessQueue}
          disabled={processingQueue || !selectedCadence}
          title={selectedCadence ? `Disparar e-mails da cadência "${selectedCadence.name}"` : 'Selecione uma cadência primeiro'}
        >
          {processingQueue ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Send className="w-4 h-4 mr-2" />
          )}
          {selectedCadence ? `Disparar "${selectedCadence.name}"` : 'Disparar agora'}
        </Button>
      </div>

      {/* Credentials Warning */}
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
      <Tabs defaultValue="campaigns" className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="campaigns" className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4" />
            Campanhas
          </TabsTrigger>
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
          <TabsTrigger value="inbox" className="flex items-center gap-2 relative">
            <Inbox className="w-4 h-4" />
            Inbox
            {unreadCount > 0 && (
              <Badge variant="destructive" className="text-[10px] h-4 min-w-[16px] px-1 absolute -top-1 -right-1">
                {unreadCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* TAB: CAMPAIGNS */}
        <TabsContent value="campaigns" className="mt-6">
          <EmailCampaignsTab />
        </TabsContent>

        {/* TAB: CADENCES */}
        <TabsContent value="cadences" className="mt-6">
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-3 space-y-6">
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
                        setCadenceForm({ name: '', description: '', sendAtTime: '09:00', startDate: new Date().toISOString().split('T')[0] });
                        setShowCadenceDialog(true);
                      }}>
                        <Plus className="w-4 h-4 mr-1" /> Nova
                      </Button>
                      {selectedCadence && (
                        <Button variant="ghost" size="sm" onClick={() => {
                          setEditingCadence(selectedCadence);
                          setCadenceForm({ name: selectedCadence.name, description: selectedCadence.description || '', sendAtTime: selectedCadence.send_at_time || '09:00', startDate: selectedCadence.start_date || new Date().toISOString().split('T')[0] });
                          setShowCadenceDialog(true);
                        }}>
                          <Edit2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Sequência automática de e-mails por dias
                    {selectedCadence?.start_date && (
                      <span className="ml-2 inline-flex items-center gap-1">
                        📅 Início: {new Date(selectedCadence.start_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                      </span>
                    )}
                    {selectedCadence?.send_at_time && (
                      <span className="ml-2 inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        às {selectedCadence.send_at_time}
                      </span>
                    )}
                  </p>
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
                                    <DropdownMenuItem onClick={() => setPreviewStep(step)}>
                                      <Eye className="w-3 h-3 mr-2" /> Preview
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => {
                                      setEditingStep(step);
                                      setStepForm({
                                        dayNumber: step.day_number,
                                        subject: step.subject,
                                        bodyHtml: step.body_html,
                                        bodyText: step.body_text || '',
                                      });
                                      setShowStepAI(false);
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
                            setShowStepAI(false);
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
                        setRuleForm({ triggerEvent: 'opened', targetCadenceId: '', delayHours: 0, timeoutHours: 48 });
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
            </div>
          </div>
        </TabsContent>

        {/* TAB: TEMPLATES */}
        <TabsContent value="templates" className="mt-6">
          <EmailTemplatesTab />
        </TabsContent>

        {/* TAB: ENROLLMENTS */}
        <TabsContent value="enrollments" className="mt-6">
          <EmailEnrollmentsTab />
        </TabsContent>

        {/* TAB: SENDS */}
        <TabsContent value="sends" className="mt-6">
          <EmailSendsTab />
        </TabsContent>

        {/* TAB: INBOX */}
        <TabsContent value="inbox" className="mt-6">
          <EmailInboxTab />
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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Data de início</label>
                <Input
                  type="date"
                  value={cadenceForm.startDate}
                  onChange={(e) => setCadenceForm(prev => ({ ...prev, startDate: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground mt-1">Dia 1 da cadência</p>
              </div>
              <div>
                <label className="text-sm font-medium">Horário de disparo</label>
                <Input
                  type="time"
                  value={cadenceForm.sendAtTime}
                  onChange={(e) => setCadenceForm(prev => ({ ...prev, sendAtTime: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground mt-1">Horário de cada envio</p>
              </div>
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

      {/* Step Dialog - with Rich Editor, Template Integration & AI */}
      <Dialog open={showStepDialog} onOpenChange={(open) => { setShowStepDialog(open); if (!open) setShowStepAI(false); }}>
        <DialogContent className={`${showStepAI ? 'max-w-5xl' : 'max-w-2xl'} max-h-[90vh] overflow-hidden flex flex-col`}>
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>{editingStep ? 'Editar Step' : 'Novo Step'}</span>
              <Button
                variant={showStepAI ? 'default' : 'outline'}
                size="sm"
                className="text-xs"
                onClick={() => setShowStepAI(!showStepAI)}
              >
                <Sparkles className="w-3.5 h-3.5 mr-1" />
                {showStepAI ? 'Fechar IA' : 'Gerar com IA'}
              </Button>
            </DialogTitle>
          </DialogHeader>

          <div className={`flex-1 min-h-0 overflow-y-auto ${showStepAI ? 'grid grid-cols-[1fr_320px] gap-0' : ''}`}>
            <div className={`space-y-4 ${showStepAI ? 'pr-4 overflow-y-auto' : ''}`}>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Dia do envio</label>
                  <Input
                    type="number"
                    min={1}
                    value={stepForm.dayNumber}
                    onChange={(e) => setStepForm(prev => ({ ...prev, dayNumber: parseInt(e.target.value) || 1 }))}
                  />
                </div>
                {templates.length > 0 && (
                  <div>
                    <label className="text-sm font-medium">Usar template como base</label>
                    <Select onValueChange={handleLoadTemplate}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecionar template..." />
                      </SelectTrigger>
                      <SelectContent>
                        {templates.map(t => (
                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
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
                <label className="text-sm font-medium mb-1 block">Corpo do e-mail</label>
                <EmailRichEditor
                  value={stepForm.bodyHtml}
                  onChange={(html) => setStepForm(prev => ({ ...prev, bodyHtml: html }))}
                  placeholder="Comece a escrever o corpo do e-mail..."
                  minHeight="220px"
                />
              </div>
            </div>

            {/* AI Chat Panel */}
            {showStepAI && (
              <EmailAIChat
                onApply={(email) => {
                  setStepForm(prev => ({
                    ...prev,
                    subject: email.subject || prev.subject,
                    bodyHtml: email.bodyHtml,
                    bodyText: email.bodyText,
                  }));
                  toast.info('Conteúdo da IA aplicado ao step!');
                }}
                onClose={() => setShowStepAI(false)}
                context={{
                  currentSubject: stepForm.subject,
                  currentBodyHtml: stepForm.bodyHtml,
                }}
              />
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowStepDialog(false); setShowStepAI(false); }}>Cancelar</Button>
            {stepForm.bodyHtml.trim() && (
              <Button
                variant="secondary"
                onClick={() => setPreviewStep({
                  id: editingStep?.id || 'preview',
                  cadence_id: selectedCadence?.id || '',
                  day_number: stepForm.dayNumber,
                  subject: stepForm.subject,
                  body_html: stepForm.bodyHtml,
                  body_text: stepForm.bodyText || null,
                  ordem: 0,
                  active: true,
                  created_at: '',
                  updated_at: '',
                })}
              >
                <Eye className="w-4 h-4 mr-1" /> Preview
              </Button>
            )}
            <Button onClick={handleSaveStep} disabled={!stepForm.subject.trim() || !stepForm.bodyHtml.trim()}>
              {editingStep ? 'Salvar' : 'Criar Step'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                  <SelectItem value="not_opened">🚫 Não abrir (timeout)</SelectItem>
                  <SelectItem value="bounced">⚠️ Bounce</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {ruleForm.triggerEvent === 'not_opened' && (
              <div>
                <label className="text-sm font-medium">Tempo limite para considerar "não abriu" (horas)</label>
                <Input
                  type="number"
                  min={1}
                  value={ruleForm.timeoutHours}
                  onChange={(e) => setRuleForm(prev => ({ ...prev, timeoutHours: parseInt(e.target.value) || 48 }))}
                />
                <p className="text-xs text-muted-foreground mt-1">Ex: 48 = se não abrir em 48h após o envio, mover para outra cadência</p>
              </div>
            )}
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
              <p className="text-xs text-muted-foreground mt-1">0 = mover imediatamente após o evento</p>
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

      {/* Email Preview Dialog */}
      <EmailPreviewDialog
        open={!!previewStep}
        onOpenChange={(open) => !open && setPreviewStep(null)}
        subject={previewStep?.subject || ''}
        bodyHtml={previewStep?.body_html || ''}
        bodyText={previewStep?.body_text || undefined}
      />
    </div>
  );
}
