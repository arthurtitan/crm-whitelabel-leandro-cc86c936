import { useState, useEffect, useCallback } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Search, Loader2, Send, Users } from 'lucide-react';
import { useBackend } from '@/config/backend.config';
import { apiClient } from '@/api/client';
import { API_ENDPOINTS } from '@/api/endpoints';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { normalizePhoneBR } from './csvParser';
import type { ExtractedLead } from './types';

interface CrmContact {
  id: string;
  nome: string | null;
  telefone: string | null;
  email: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (leads: ExtractedLead[]) => void;
}

export function CrmContactsPickerDialog({ open, onOpenChange, onConfirm }: Props) {
  const { toast } = useToast();
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const load = useCallback(async (term: string) => {
    setLoading(true);
    try {
      let data: CrmContact[];
      if (useBackend) {
        const res = await apiClient.get<any>(
          `${API_ENDPOINTS.CONTACTS.LIST}?limit=200${term ? `&search=${encodeURIComponent(term)}` : ''}`
        );
        const payload = (res as any).data || res;
        data = Array.isArray(payload) ? payload : payload.data || payload.contacts || [];
      } else {
        let q = supabase
          .from('contacts')
          .select('id, nome, telefone, email')
          .not('telefone', 'is', null)
          .order('created_at', { ascending: false })
          .limit(200);
        if (term) q = q.or(`nome.ilike.%${term}%,telefone.ilike.%${term}%`);
        const { data: rows, error } = await q;
        if (error) throw error;
        data = rows || [];
      }
      // Keep only those with a phone
      setContacts(data.filter((c) => c.telefone && c.telefone.trim()));
    } catch (err: any) {
      toast({ title: 'Erro ao carregar contatos', description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!open) return;
    load('');
    setSelectedIds(new Set());
    setSearch('');
  }, [open, load]);

  // Debounced search
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => load(search), 350);
    return () => clearTimeout(id);
  }, [search, open, load]);

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === contacts.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(contacts.map((c) => c.id)));
  };

  const handleConfirm = () => {
    const selected = contacts.filter((c) => selectedIds.has(c.id));
    const leads: ExtractedLead[] = selected
      .map((c, idx) => {
        const phone = normalizePhoneBR(c.telefone || '');
        if (!phone) return null;
        return {
          id: c.id || `crm-${idx}`,
          nome: c.nome || 'Sem nome',
          cidade: '',
          endereco: '',
          telefone: phone,
        };
      })
      .filter((l): l is ExtractedLead => l !== null);

    if (leads.length === 0) {
      toast({ title: 'Nenhum contato com telefone válido', variant: 'destructive' });
      return;
    }
    onConfirm(leads);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" /> Selecionar contatos do CRM
          </DialogTitle>
          <DialogDescription>
            Apenas contatos com telefone cadastrado são exibidos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 flex-1 overflow-hidden flex flex-col py-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou telefone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={toggleAll}
              className="text-primary hover:underline"
              disabled={contacts.length === 0}
            >
              {selectedIds.size === contacts.length && contacts.length > 0 ? 'Desmarcar todos' : 'Selecionar todos'}
            </button>
            <Badge variant="secondary">
              {selectedIds.size} de {contacts.length} selecionado(s)
            </Badge>
          </div>

          <div className="flex-1 overflow-y-auto border rounded-md min-h-[300px]">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...
              </div>
            ) : contacts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm">
                Nenhum contato encontrado
              </div>
            ) : (
              <div className="divide-y">
                {contacts.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40 cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedIds.has(c.id)}
                      onCheckedChange={() => toggle(c.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.nome || 'Sem nome'}</p>
                      <p className="text-xs text-muted-foreground font-mono">{c.telefone}</p>
                    </div>
                    {c.email && (
                      <span className="text-xs text-muted-foreground hidden sm:inline truncate max-w-[160px]">
                        {c.email}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={selectedIds.size === 0}>
            <Send className="w-4 h-4 mr-2" />
            Continuar com {selectedIds.size} contato(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
