import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Users, Loader2, Pause, Play, UserMinus } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { emailService, type EmailEnrollment, type EmailCadence } from '@/services/email.service';

const statusLabels: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  active: { label: 'Ativo', variant: 'default' },
  paused: { label: 'Pausado', variant: 'secondary' },
  completed: { label: 'Concluído', variant: 'outline' },
  unsubscribed: { label: 'Removido', variant: 'destructive' },
  bounced: { label: 'Bounce', variant: 'destructive' },
};

export default function EmailEnrollmentsTab() {
  const [enrollments, setEnrollments] = useState<EmailEnrollment[]>([]);
  const [cadences, setCadences] = useState<EmailCadence[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCadence, setFilterCadence] = useState<string>('all');
  const [unenrollTarget, setUnenrollTarget] = useState<EmailEnrollment | null>(null);

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
      </div>

      {filtered.length === 0 ? (
        <Card className="card-gradient border-border/50">
          <CardContent className="py-12 text-center">
            <Users className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
            <p className="font-medium text-muted-foreground">Nenhuma inscrição encontrada</p>
            <p className="text-sm text-muted-foreground mt-1">
              Inscreva leads em cadências pela aba "Cadências" → Funil de Leads.
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
