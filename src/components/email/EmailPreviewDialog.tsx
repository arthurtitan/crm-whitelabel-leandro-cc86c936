import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Eye, Send, Loader2, Monitor, Smartphone, Code } from 'lucide-react';
import { emailService } from '@/services/email.service';

interface EmailPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subject: string;
  bodyHtml: string;
  bodyText?: string;
}

export default function EmailPreviewDialog({
  open,
  onOpenChange,
  subject,
  bodyHtml,
  bodyText,
}: EmailPreviewDialogProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [activeTab, setActiveTab] = useState<'preview' | 'html' | 'test'>('preview');
  const [testEmail, setTestEmail] = useState('');
  const [sending, setSending] = useState(false);

  // Replace variables with sample values for preview
  const previewHtml = bodyHtml
    .replace(/\{nome\}/g, 'João Silva')
    .replace(/\{email\}/g, 'joao@exemplo.com')
    .replace(/\{empresa\}/g, 'Empresa Exemplo');

  useEffect(() => {
    if (!iframeRef.current || !open) return;
    const doc = iframeRef.current.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 16px; color: #333; background: #fff; }
          img { max-width: 100%; height: auto; }
          a { color: #6366F1; }
        </style>
      </head>
      <body>${previewHtml}</body>
      </html>
    `);
    doc.close();
  }, [previewHtml, open, viewMode]);

  const handleSendTest = async () => {
    if (!testEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail)) {
      toast.error('Digite um e-mail válido');
      return;
    }
    setSending(true);
    try {
      const settings = await emailService.getSettings();
      if (!settings.hasSendgridKey) {
        toast.error('SendGrid não configurado. Configure nas configurações da conta.');
        return;
      }
      const result = await emailService.testSendEmail(
        '__existing__',
        settings.sendgridFromEmail,
        settings.sendgridFromName || 'GoodLeads CRM',
        testEmail,
        {
          subject: `[TESTE] ${subject}`,
          html: bodyHtml,
          text: bodyText,
        }
      );
      if (result.success) {
        toast.success(`E-mail de teste enviado para ${testEmail}!`);
      } else {
        toast.error(result.error || 'Erro ao enviar e-mail de teste');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao enviar e-mail de teste');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5" />
            Preview do E-mail
          </DialogTitle>
          <DialogDescription>
            Visualize como o e-mail será exibido e envie um teste
          </DialogDescription>
        </DialogHeader>

        {/* Subject line */}
        <div className="px-4 py-2 bg-muted/30 rounded-lg border border-border/50">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground font-medium">Assunto:</span>
            <span className="font-medium">{subject}</span>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="preview" className="flex items-center gap-2">
              <Eye className="w-4 h-4" />
              Preview
            </TabsTrigger>
            <TabsTrigger value="html" className="flex items-center gap-2">
              <Code className="w-4 h-4" />
              HTML
            </TabsTrigger>
            <TabsTrigger value="test" className="flex items-center gap-2">
              <Send className="w-4 h-4" />
              Envio de Teste
            </TabsTrigger>
          </TabsList>

          {/* Preview Tab */}
          <TabsContent value="preview" className="flex-1 flex flex-col min-h-0 mt-4">
            <div className="flex items-center gap-2 mb-3">
              <Button
                variant={viewMode === 'desktop' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('desktop')}
              >
                <Monitor className="w-4 h-4 mr-1" /> Desktop
              </Button>
              <Button
                variant={viewMode === 'mobile' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('mobile')}
              >
                <Smartphone className="w-4 h-4 mr-1" /> Mobile
              </Button>
              <Badge variant="secondary" className="text-[10px] ml-auto">
                Variáveis substituídas por dados de exemplo
              </Badge>
            </div>
            <div className={`flex-1 border border-border rounded-lg overflow-hidden bg-white mx-auto transition-all ${
              viewMode === 'mobile' ? 'w-[375px]' : 'w-full'
            }`} style={{ minHeight: '300px', maxHeight: '400px' }}>
              <iframe
                ref={iframeRef}
                title="Email Preview"
                sandbox="allow-same-origin"
                className="w-full h-full border-0"
                style={{ minHeight: '300px', maxHeight: '400px' }}
              />
            </div>
          </TabsContent>

          {/* HTML Tab */}
          <TabsContent value="html" className="flex-1 min-h-0 mt-4">
            <pre className="bg-muted/30 border border-border rounded-lg p-4 text-xs overflow-auto max-h-[400px] font-mono whitespace-pre-wrap">
              {bodyHtml}
            </pre>
          </TabsContent>

          {/* Test Send Tab */}
          <TabsContent value="test" className="mt-4">
            <div className="space-y-4">
              <div className="p-4 bg-muted/30 rounded-lg border border-border/50">
                <p className="text-sm text-muted-foreground mb-3">
                  Envie este e-mail como teste para verificar a aparência e entrega.
                  <strong className="text-foreground"> Não afeta métricas</strong> da cadência.
                </p>
                <div className="flex gap-2">
                  <Input
                    type="email"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className="flex-1"
                  />
                  <Button onClick={handleSendTest} disabled={sending || !testEmail.trim()}>
                    {sending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4 mr-2" />
                    )}
                    Enviar Teste
                  </Button>
                </div>
              </div>

              {bodyText && (
                <div>
                  <p className="text-sm font-medium mb-2">Versão texto (fallback):</p>
                  <pre className="bg-muted/30 border border-border rounded-lg p-3 text-xs overflow-auto max-h-[200px] whitespace-pre-wrap">
                    {bodyText}
                  </pre>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
