import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  Plus, Edit2, Trash2, Loader2, FolderOpen, BarChart3,
  Send, Mail, Eye, MousePointer, AlertTriangle, ChevronRight,
  Link2, Unlink, Clock, GitBranch, Zap, Inbox, MailOpen, RefreshCw,
  Users
} from 'lucide-react';
import {
  emailService,
  type EmailCampaign,
  type EmailCadence,
  type SendStats,
} from '@/services/email.service';

interface CampaignWithStats extends EmailCampaign {
  stats?: SendStats & { enrollments: number };
  linkedCadences?: EmailCadence[];
}

export default function EmailCampaignsTab() {
  const [campaigns, setCampaigns] = useState<CampaignWithStats[]>([]);
  const [allCadences, setAllCadences] = useState<EmailCadence[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignWithStats | null>(null);

  // Dialogs
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<EmailCampaign | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showLinkDialog, setShowLinkDialog] = useState(false);

  // Form
  const [form, setForm] = useState({ name: '', description: '' });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [campaignsData, cadencesData] = await Promise.all([
        emailService.listCampaigns(),
        emailService.listCadences(),
      ]);

      // Enrich campaigns with their linked cadences
      const enriched: CampaignWithStats[] = campaignsData.map((camp: any) => {
        const linked = cadencesData.filter((c: any) => c.campaign_id === camp.id);
        return { ...camp, linkedCadences: linked };
      });

      // Load stats for each campaign
      const withStats = await Promise.all(
        enriched.map(async (camp) => {
          try {
            const stats = await emailService.getCampaignStats(camp.id);
            return { ...camp, stats };
          } catch {
            return { ...camp, stats: { total: 0, sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, failed: 0, enrollments: 0 } };
          }
        })
      );

      setCampaigns(withStats);
      setAllCadences(cadencesData);
      if (withStats.length > 0 && !selectedCampaign) {
        setSelectedCampaign(withStats[0]);
      } else if (selectedCampaign) {
        const updated = withStats.find(c => c.id === selectedCampaign.id);
        if (updated) setSelectedCampaign(updated);
      }
    } catch (err) {
      console.error('Erro ao carregar campanhas:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // CRUD
  const handleSave = async () => {
    try {
      if (editingCampaign) {
        await emailService.updateCampaign(editingCampaign.id, form);
        toast.success('Campanha atualizada!');
      } else {
        await emailService.createCampaign(form);
        toast.success('Campanha criada!');
      }
      setShowCreateDialog(false);
      setEditingCampaign(null);
      setForm({ name: '', description: '' });
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar campanha');
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await emailService.deleteCampaign(deleteId);
      toast.success('Campanha excluída!');
      if (selectedCampaign?.id === deleteId) setSelectedCampaign(null);
      setDeleteId(null);
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao excluir campanha');
    }
  };

  const handleLinkCadence = async (cadenceId: string) => {
    if (!selectedCampaign) return;
    try {
      await emailService.addCadenceToCampaign(selectedCampaign.id, cadenceId);
      toast.success('Cadência vinculada!');
      setShowLinkDialog(false);
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao vincular cadência');
    }
  };

  const handleUnlinkCadence = async (cadenceId: string) => {
    if (!selectedCampaign) return;
    try {
      await emailService.removeCadenceFromCampaign(selectedCampaign.id, cadenceId);
      toast.success('Cadência desvinculada!');
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao desvincular cadência');
    }
  };

  const unlinkedCadences = allCadences.filter(
    c => !(selectedCampaign?.linkedCadences || []).some(lc => lc.id === c.id)
  );

  const stats = selectedCampaign?.stats || { total: 0, sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, failed: 0, enrollments: 0 };

  const kpis = [
    { label: 'Enviados', value: stats.sent + stats.delivered, icon: Send, color: 'text-blue-400' },
    { label: 'Entregues', value: stats.delivered, icon: Mail, color: 'text-emerald-400' },
    { label: 'Abertos', value: stats.opened, icon: Eye, color: 'text-violet-400' },
    { label: 'Clicados', value: stats.clicked, icon: MousePointer, color: 'text-cyan-400' },
    { label: 'Inscritos', value: stats.enrollments, icon: Users, color: 'text-amber-400' },
    { label: 'Falhas', value: stats.bounced + stats.failed, icon: AlertTriangle, color: 'text-destructive' },
  ];

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Campaign selector + actions */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <FolderOpen className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold">Campanhas</h3>
          {campaigns.length > 0 && (
            <Select
              value={selectedCampaign?.id || ''}
              onValueChange={(v) => {
                const c = campaigns.find(c => c.id === v);
                if (c) setSelectedCampaign(c);
              }}
            >
              <SelectTrigger className="w-[220px] h-9">
                <SelectValue placeholder="Selecionar campanha..." />
              </SelectTrigger>
              <SelectContent>
                {campaigns.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${c.active ? 'bg-emerald-500' : 'bg-muted-foreground'}`} />
                      {c.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadData}>
            <RefreshCw className="w-4 h-4 mr-1" /> Atualizar
          </Button>
          <Button size="sm" onClick={() => {
            setEditingCampaign(null);
            setForm({ name: '', description: '' });
            setShowCreateDialog(true);
          }}>
            <Plus className="w-4 h-4 mr-1" /> Nova Campanha
          </Button>
        </div>
      </div>

      {campaigns.length === 0 ? (
        <Card className="card-gradient border-border/50">
          <CardContent className="py-12 text-center text-muted-foreground">
            <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">Nenhuma campanha criada</p>
            <p className="text-sm mt-1">Campanhas agrupam cadências sob um mesmo objetivo.</p>
            <Button size="sm" className="mt-4" onClick={() => { setForm({ name: '', description: '' }); setShowCreateDialog(true); }}>
              <Plus className="w-4 h-4 mr-1" /> Criar primeira campanha
            </Button>
          </CardContent>
        </Card>
      ) : selectedCampaign ? (
        <>
          {/* Campaign header */}
          <Card className="card-gradient border-border/50">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-lg font-semibold">{selectedCampaign.name}</h4>
                    <Badge variant={selectedCampaign.active ? 'default' : 'secondary'}>
                      {selectedCampaign.active ? 'Ativa' : 'Inativa'}
                    </Badge>
                  </div>
                  {selectedCampaign.description && (
                    <p className="text-sm text-muted-foreground">{selectedCampaign.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {(selectedCampaign.linkedCadences || []).length} cadência(s) vinculada(s)
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => {
                    setEditingCampaign(selectedCampaign);
                    setForm({ name: selectedCampaign.name, description: selectedCampaign.description || '' });
                    setShowCreateDialog(true);
                  }}>
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleteId(selectedCampaign.id)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {kpis.map(kpi => (
              <Card key={kpi.label} className="card-gradient border-border/50">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
                    <div>
                      <p className="text-xl font-bold">{kpi.value}</p>
                      <p className="text-[10px] text-muted-foreground">{kpi.label}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Linked Cadences */}
          <Card className="card-gradient border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Cadências da Campanha
                </CardTitle>
                <Button variant="outline" size="sm" onClick={() => setShowLinkDialog(true)} disabled={unlinkedCadences.length === 0}>
                  <Link2 className="w-4 h-4 mr-1" /> Vincular Cadência
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {(selectedCampaign.linkedCadences || []).length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Nenhuma cadência vinculada</p>
                  <p className="text-xs mt-1">Vincule cadências existentes para organizar sua campanha.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {(selectedCampaign.linkedCadences || []).map(cadence => (
                    <div key={cadence.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{cadence.name}</span>
                          <Badge variant={cadence.active ? 'default' : 'secondary'} className="text-[10px]">
                            {cadence.active ? 'Ativa' : 'Inativa'}
                          </Badge>
                          {cadence.steps && (
                            <Badge variant="outline" className="text-[10px]">
                              {cadence.steps.length} step(s)
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          {cadence.send_at_time && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" /> {cadence.send_at_time}
                            </span>
                          )}
                          {cadence.start_date && (
                            <span>Início: {new Date(cadence.start_date + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                          )}
                          {(cadence.rules || []).length > 0 && (
                            <span className="flex items-center gap-1">
                              <GitBranch className="w-3 h-3" /> {cadence.rules!.length} regra(s)
                            </span>
                          )}
                        </div>
                        {/* Steps preview */}
                        {cadence.steps && cadence.steps.length > 0 && (
                          <div className="flex items-center gap-1 mt-2 overflow-x-auto">
                            {cadence.steps.slice(0, 5).map((step, idx) => (
                              <div key={step.id} className="flex items-center gap-1">
                                <div className="px-2 py-0.5 rounded text-[10px] bg-background border border-border/50 whitespace-nowrap">
                                  Dia {step.day_number}
                                </div>
                                {idx < Math.min(cadence.steps!.length, 5) - 1 && (
                                  <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                                )}
                              </div>
                            ))}
                            {cadence.steps.length > 5 && (
                              <span className="text-[10px] text-muted-foreground">+{cadence.steps.length - 5}</span>
                            )}
                          </div>
                        )}
                        {/* Rules preview */}
                        {(cadence.rules || []).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {(cadence.rules || []).map(rule => (
                              <Badge key={rule.id} variant="outline" className="text-[10px] gap-1">
                                <Zap className="w-2.5 h-2.5" />
                                {rule.trigger_event === 'opened' ? 'Abriu' :
                                 rule.trigger_event === 'clicked' ? 'Clicou' :
                                 rule.trigger_event === 'not_opened' ? 'Não abriu' : 'Bounce'}
                                → {rule.target_cadence?.name || 'Cadência'}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => handleUnlinkCadence(cadence.id)} title="Desvincular cadência">
                        <Unlink className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}

      {/* Create/Edit Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCampaign ? 'Editar Campanha' : 'Nova Campanha'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Nome</label>
              <Input
                value={form.name}
                onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Ex: Black Friday 2026"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Descrição</label>
              <Textarea
                value={form.description}
                onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Objetivo da campanha..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!form.name.trim()}>
              {editingCampaign ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link Cadence Dialog */}
      <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vincular Cadência à Campanha</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {unlinkedCadences.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Todas as cadências já estão vinculadas a esta campanha.
              </p>
            ) : (
              unlinkedCadences.map(cadence => (
                <button
                  key={cadence.id}
                  className="w-full flex items-center justify-between p-3 rounded-lg border border-border/50 hover:bg-muted/50 transition-colors text-left"
                  onClick={() => handleLinkCadence(cadence.id)}
                >
                  <div>
                    <span className="font-medium text-sm">{cadence.name}</span>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                      {cadence.steps && <span>{cadence.steps.length} step(s)</span>}
                      <Badge variant={cadence.active ? 'default' : 'secondary'} className="text-[10px]">
                        {cadence.active ? 'Ativa' : 'Inativa'}
                      </Badge>
                    </div>
                  </div>
                  <Link2 className="w-4 h-4 text-primary" />
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir campanha?</AlertDialogTitle>
            <AlertDialogDescription>
              As cadências vinculadas não serão excluídas, apenas desvinculadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
