import { useState, useEffect, useCallback, useContext } from 'react';
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
import { AuthContext } from '@/contexts/AuthContext';
import { useBackend } from '@/config/backend.config';
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

export default function EmailCampaignsTab() {
  const auth = useContext(AuthContext);
  const accountId = auth?.account?.id || auth?.user?.account_id || '';
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
      const [campaignsData, cadencesData, templatesData] = await Promise.all([
        emailService.listCampaigns(),
        emailService.listCadences(),
        emailService.listTemplates().catch(() => []),
      ]);

      let audWithCounts: Audience[] = [];
      if (!useBackend && accountId) {
        const { data: audData } = await supabase
          .from('email_audiences')
          .select('id, name')
          .eq('account_id', accountId);

        const audList: Audience[] = audData || [];
        audWithCounts = await Promise.all(audList.map(async (a) => {
          const { count } = await supabase
            .from('email_audience_contacts')
            .select('*', { count: 'exact', head: true })
            .eq('audience_id', a.id);
          return { ...a, contact_count: count || 0 };
        }));
      }

      setAudiences(audWithCounts);

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
  }, [accountId, selectedCampaign, selectedCadence]);

  useEffect(() => { loadData(); }, [loadData]);

  // ==================== CAMPAIGN CRUD ====================
  const handleSaveCampaign = async () => {
    try {
      if (editingCampaign) {
        await emailService.updateCampaign(editingCampaign.id, { name: form.name, description: form.description });
        if (!useBackend && form.audienceId) {
          await supabase.from('email_campaigns').update({ audience_id: form.audienceId } as any).eq('id', editingCampaign.id);
        }
        toast.success('Campanha atualizada!');
      } else {
        const created = await emailService.createCampaign({ name: form.name, description: form.description });
        if (!useBackend && form.audienceId) {
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
...
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
            {!useBackend && (
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
            )}
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
