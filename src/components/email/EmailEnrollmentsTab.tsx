import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Users, Loader2, UserMinus, UserPlus, Search } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { emailService, type EmailEnrollment, type EmailCadence } from '@/services/email.service';
import { useBackend } from '@/config/backend.config';
import { apiClient } from '@/api/client';
import { API_ENDPOINTS } from '@/api/endpoints';
import { supabase } from '@/integrations/supabase/client';

const statusLabels: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  active: { label: 'Ativo', variant: 'default' },
  paused: { label: 'Pausado', variant: 'secondary' },
  completed: { label: 'Concluído', variant: 'outline' },
  unsubscribed: { label: 'Removido', variant: 'destructive' },
  bounced: { label: 'Bounce', variant: 'destructive' },
};

interface ContactOption {
  id: string;
  nome: string | null;
  email: string | null;
}

export default function EmailEnrollmentsTab() {
  const [enrollments, setEnrollments] = useState<EmailEnrollment[]>([]);
  const [cadences, setCadences] = useState<EmailCadence[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCadence, setFilterCadence] = useState<string>('all');
  const [unenrollTarget, setUnenrollTarget] = useState<EmailEnrollment | null>(null);

  // Enroll dialog
  const [showEnrollDialog, setShowEnrollDialog] = useState(false);
  const [enrollCadenceId, setEnrollCadenceId] = useState<string>('');
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [contactSearch, setContactSearch] = useState('');
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [enrolling, setEnrolling] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [enrollData, cadenceData] = await Promise.all([
        emailService.listEnrollments(),
        emailService.listCadences(),
      ]);
      setEnrollments(enrollData);
      setCadences(cadenceData);
    } catch (err) {
      console.error('Erro ao carregar inscrições:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadContacts = async (search?: string) => {
    setLoadingContacts(true);
    try {
      if (useBackend) {
        const res = await apiClient.get<any>(API_ENDPOINTS.CONTACTS.LIST, {
          params: { search: search || '', limit: 50 },
        });
        const data = res?.data ?? res;
        const list = Array.isArray(data) ? data : (data?.contacts || data?.data || []);
        setContacts(list.filter((c: any) => c.email).map((c: any) => ({
          id: c.id,
          nome: c.nome || c.name || null,
          email: c.email || null,
        })));
      } else {
        let query = supabase.from('contacts').select('id, nome, email').not('email', 'is', null).limit(50);
        if (search) {
          query = query.or(`nome.ilike.%${search}%,email.ilike.%${search}%`);
        }
        const { data } = await query;
        setContacts((data || []).map(c => ({ id: c.id, nome: c.nome, email: c.email })));
      }
    } catch (err) {
      console.error('Erro ao carregar contatos:', err);
    } finally {
      setLoadingContacts(false);
    }
  };

  const handleOpenEnrollDialog = () => {
    setShowEnrollDialog(true);
    setEnrollCadenceId(cadences.length > 0 ? cadences[0].id : '');
    setSelectedContactIds([]);
    setContactSearch('');
    loadContacts();
  };

  const handleSearchContacts = () => {
    loadContacts(contactSearch);
  };

  const toggleContact = (id: string) => {
    setSelectedContactIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleEnroll = async () => {
    if (!enrollCadenceId || selectedContactIds.length === 0) return;
    setEnrolling(true);
    try {
      await emailService.enroll(enrollCadenceId, selectedContactIds);
      toast.success(`${selectedContactIds.length} contato(s) inscrito(s) com sucesso!`);
      setShowEnrollDialog(false);
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao inscrever contatos');
    } finally {
      setEnrolling(false);
    }
  };

  const handleUnenroll = async () => {
    if (!unenrollTarget) return;
    try {
      await emailService.unenroll(unenrollTarget.cadence_id, [unenrollTarget.contact_id]);
      setEnrollments(prev =>
        prev.map(e => e.id === unenrollTarget.id ? { ...e, status: 'unsubscribed' } : e)
      );
      setUnenrollTarget(null);
      toast.success('Contato removido da cadência!');
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao remover inscrição');
    }
  };

  const filtered = filterCadence === 'all'
    ? enrollments
    : enrollments.filter(e => e.cadence_id === filterCadence);

  const cadenceMap = new Map(cadences.map(c => [c.id, c.name]));

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Gerencie os leads inscritos em cadências de e-mail</p>
        <div className="flex items-center gap-2">
          <Select value={filterCadence} onValueChange={setFilterCadence}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Filtrar por cadência" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as cadências</SelectItem>
              {cadences.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={handleOpenEnrollDialog} disabled={cadences.length === 0}>
            <UserPlus className="w-4 h-4 mr-1" /> Inscrever
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="card-gradient border-border/50">
          <CardContent className="py-12 text-center">
            <Users className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
            <p className="font-medium text-muted-foreground">Nenhuma inscrição encontrada</p>
            <p className="text-sm text-muted-foreground mt-1">
              Clique em "Inscrever" para adicionar contatos a uma cadência.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {/* Header */}
          <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs font-medium text-muted-foreground uppercase">
            <div className="col-span-3">Contato</div>
            <div className="col-span-3">Cadência</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2">Etapa</div>
            <div className="col-span-2 text-right">Ações</div>
          </div>

          {filtered.map(enrollment => {
            const status = statusLabels[enrollment.status] || { label: enrollment.status, variant: 'secondary' as const };
            return (
              <Card key={enrollment.id} className="card-gradient border-border/50">
                <CardContent className="p-3">
                  <div className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-3">
                      <p className="text-sm font-medium truncate">
                        {enrollment.contact?.nome || 'Sem nome'}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {enrollment.contact?.email || '—'}
                      </p>
                    </div>
                    <div className="col-span-3">
                      <p className="text-sm truncate">
                        {cadenceMap.get(enrollment.cadence_id) || 'Cadência'}
                      </p>
                    </div>
                    <div className="col-span-2">
                      <Badge variant={status.variant} className="text-[10px]">
                        {status.label}
                      </Badge>
                    </div>
                    <div className="col-span-2">
                      <p className="text-sm">Step {enrollment.current_step}</p>
                      {enrollment.next_send_at && (
                        <p className="text-[10px] text-muted-foreground">
                          Próx: {new Date(enrollment.next_send_at).toLocaleDateString('pt-BR')}
                        </p>
                      )}
                    </div>
                    <div className="col-span-2 flex justify-end gap-1">
                      {enrollment.status === 'active' && (
                        <Button
                          variant="ghost" size="sm" className="h-7 w-7 p-0"
                          title="Remover da cadência"
                          onClick={() => setUnenrollTarget(enrollment)}
                        >
                          <UserMinus className="w-3 h-3 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Enroll Dialog */}
      <Dialog open={showEnrollDialog} onOpenChange={setShowEnrollDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Inscrever Contatos em Cadência</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Cadência</label>
              <Select value={enrollCadenceId} onValueChange={setEnrollCadenceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma cadência" />
                </SelectTrigger>
                <SelectContent>
                  {cadences.filter(c => c.active).map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium">Buscar contatos (com e-mail)</label>
              <div className="flex gap-2 mt-1">
                <Input
                  placeholder="Nome ou e-mail..."
                  value={contactSearch}
                  onChange={(e) => setContactSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearchContacts()}
                />
                <Button variant="outline" size="sm" onClick={handleSearchContacts}>
                  <Search className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="border rounded-lg max-h-[250px] overflow-y-auto">
              {loadingContacts ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : contacts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Nenhum contato com e-mail encontrado
                </p>
              ) : (
                contacts.map(contact => (
                  <label
                    key={contact.id}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer border-b last:border-b-0"
                  >
                    <Checkbox
                      checked={selectedContactIds.includes(contact.id)}
                      onCheckedChange={() => toggleContact(contact.id)}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{contact.nome || 'Sem nome'}</p>
                      <p className="text-xs text-muted-foreground truncate">{contact.email}</p>
                    </div>
                  </label>
                ))
              )}
            </div>

            {selectedContactIds.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {selectedContactIds.length} contato(s) selecionado(s)
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEnrollDialog(false)}>Cancelar</Button>
            <Button
              onClick={handleEnroll}
              disabled={enrolling || !enrollCadenceId || selectedContactIds.length === 0}
            >
              {enrolling ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />}
              Inscrever {selectedContactIds.length > 0 ? `(${selectedContactIds.length})` : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unenroll Confirmation */}
      <AlertDialog open={!!unenrollTarget} onOpenChange={(open) => !open && setUnenrollTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover inscrição</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover <strong>{unenrollTarget?.contact?.nome || 'este contato'}</strong> da cadência?
              Os e-mails pendentes não serão enviados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleUnenroll}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
