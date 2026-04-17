import { useState, useCallback, useRef } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, FileText, Send, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { parseCsv, detectColumns, buildLeadsFromCsv, type ParsedLeadRow } from './csvParser';
import type { ExtractedLead } from './types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (leads: ExtractedLead[]) => void;
}

export function CsvImportDialog({ open, onOpenChange, onConfirm }: Props) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [nameCol, setNameCol] = useState<string>('');
  const [phoneCol, setPhoneCol] = useState<string>('');
  const [parsed, setParsed] = useState<ParsedLeadRow[]>([]);

  const reset = useCallback(() => {
    setFileName(''); setHeaders([]); setRows([]);
    setNameCol(''); setPhoneCol(''); setParsed([]);
    if (inputRef.current) inputRef.current.value = '';
  }, []);

  const handleFile = useCallback(async (file: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast({ title: 'Formato inválido', description: 'Envie um arquivo .csv', variant: 'destructive' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'Arquivo muito grande', description: 'Limite de 5MB', variant: 'destructive' });
      return;
    }
    const text = await file.text();
    const { headers: h, rows: r } = parseCsv(text);
    if (h.length === 0 || r.length === 0) {
      toast({ title: 'CSV vazio ou inválido', variant: 'destructive' });
      return;
    }
    const detected = detectColumns(h);
    setFileName(file.name);
    setHeaders(h);
    setRows(r);
    setNameCol(detected.name || h[0]);
    setPhoneCol(detected.phone || h[1] || h[0]);
  }, [toast]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const recomputeParsed = useCallback(() => {
    if (!nameCol || !phoneCol || rows.length === 0) { setParsed([]); return; }
    setParsed(buildLeadsFromCsv(rows, nameCol, phoneCol));
  }, [nameCol, phoneCol, rows]);

  if (rows.length > 0 && parsed.length === 0 && nameCol && phoneCol) {
    recomputeParsed();
  }

  const valid = parsed.filter((p) => p.valid);
  const invalid = parsed.filter((p) => !p.valid);

  const handleConfirm = () => {
    if (valid.length === 0) {
      toast({ title: 'Nenhum contato válido', variant: 'destructive' });
      return;
    }
    const leads: ExtractedLead[] = valid.map((p, idx) => ({
      id: `csv-${idx}-${p.telefone}`,
      nome: p.nome,
      cidade: '',
      endereco: '',
      telefone: p.telefone,
    }));
    onConfirm(leads);
    reset();
  };

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar contatos via planilha</DialogTitle>
          <DialogDescription>
            Envie um arquivo CSV com colunas de nome e telefone. Telefones serão normalizados (formato brasileiro).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!fileName ? (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="w-full border-2 border-dashed border-border rounded-lg py-10 flex flex-col items-center justify-center hover:border-primary hover:bg-muted/30 transition"
            >
              <Upload className="w-8 h-8 text-muted-foreground mb-2" />
              <p className="text-sm font-medium">Clique para enviar um CSV</p>
              <p className="text-xs text-muted-foreground mt-1">
                Suporta delimitadores , ; ou tab · até 5MB
              </p>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={onFileChange}
              />
            </button>
          ) : (
            <>
              <div className="flex items-center justify-between p-3 border rounded-md bg-muted/30">
                <div className="flex items-center gap-2 text-sm">
                  <FileText className="w-4 h-4 text-primary" />
                  <span className="font-medium">{fileName}</span>
                  <Badge variant="secondary">{rows.length} linhas</Badge>
                </div>
                <Button variant="ghost" size="sm" onClick={reset}>Trocar</Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Coluna do nome</Label>
                  <Select
                    value={nameCol}
                    onValueChange={(v) => { setNameCol(v); setParsed([]); }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Coluna do telefone</Label>
                  <Select
                    value={phoneCol}
                    onValueChange={(v) => { setPhoneCol(v); setParsed([]); }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {parsed.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    <span><strong>{valid.length}</strong> válidos</span>
                    {invalid.length > 0 && (
                      <>
                        <AlertCircle className="w-4 h-4 text-destructive ml-3" />
                        <span><strong>{invalid.length}</strong> inválidos (serão ignorados)</span>
                      </>
                    )}
                  </div>
                  <div className="max-h-48 overflow-y-auto border rounded-md text-xs">
                    <table className="w-full">
                      <thead className="sticky top-0 bg-muted">
                        <tr>
                          <th className="text-left px-3 py-2">Nome</th>
                          <th className="text-left px-3 py-2">Telefone</th>
                          <th className="text-left px-3 py-2 w-20">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsed.slice(0, 50).map((p, i) => (
                          <tr key={i} className="border-t">
                            <td className="px-3 py-1.5 truncate max-w-[200px]">{p.nome}</td>
                            <td className="px-3 py-1.5 font-mono">{p.telefone}</td>
                            <td className="px-3 py-1.5">
                              {p.valid ? (
                                <Badge variant="outline" className="text-green-700 border-green-300">OK</Badge>
                              ) : (
                                <Badge variant="destructive" className="text-[10px]">{p.reason}</Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {parsed.length > 50 && (
                      <p className="text-center py-2 text-muted-foreground">
                        ...e mais {parsed.length - 50} linhas
                      </p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={valid.length === 0}>
            <Send className="w-4 h-4 mr-2" />
            Continuar com {valid.length} contato(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
