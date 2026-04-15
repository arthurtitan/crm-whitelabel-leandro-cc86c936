import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  Inbox, Mail, MailOpen, Reply, Loader2, ChevronLeft, User, Clock, Send,
  RefreshCw
} from 'lucide-react';
import {
  emailService,
  type EmailInboxMessage,
} from '@/services/email.service';
import EmailRichEditor from './EmailRichEditor';

export default function EmailInboxTab() {
  const [messages, setMessages] = useState<EmailInboxMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMessage, setSelectedMessage] = useState<EmailInboxMessage | null>(null);
  const [showReply, setShowReply] = useState(false);
  const [replySubject, setReplySubject] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const loadMessages = useCallback(async () => {
    setLoading(true);
    try {
      const readFilter = filter === 'unread' ? false : undefined;
      const data = await emailService.listInboxMessages({ read: readFilter, limit: 100 });
      setMessages(data);
    } catch (err) {
      console.error('Erro ao carregar inbox:', err);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { loadMessages(); }, [loadMessages]);

  const handleSelectMessage = async (msg: EmailInboxMessage) => {
    setSelectedMessage(msg);
    setShowReply(false);

    if (!msg.read) {
      try {
        await emailService.markInboxRead(msg.id);
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, read: true } : m));
      } catch {}
    }
  };

  const handleReply = async () => {
    if (!selectedMessage || !replyBody.trim()) return;
    setSending(true);
    try {
      await emailService.replyToMessage(selectedMessage.id, {
        subject: replySubject || `Re: ${selectedMessage.subject}`,
        bodyHtml: replyBody,
      });
      toast.success('Resposta enviada!');
      setShowReply(false);
      setReplyBody('');
      setReplySubject('');
      setSelectedMessage(prev => prev ? { ...prev, replied: true, replied_at: new Date().toISOString() } : null);
      setMessages(prev => prev.map(m => m.id === selectedMessage.id ? { ...m, replied: true } : m));
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao enviar resposta');
    } finally {
      setSending(false);
    }
  };

  const unreadCount = messages.filter(m => !m.read).length;

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffH = diffMs / (1000 * 60 * 60);

    if (diffH < 1) return `${Math.floor(diffMs / 60000)}min`;
    if (diffH < 24) return `${Math.floor(diffH)}h`;
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Detail View
  if (selectedMessage) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => { setSelectedMessage(null); setShowReply(false); }}>
            <ChevronLeft className="w-4 h-4 mr-1" /> Voltar
          </Button>
          {selectedMessage.replied && (
            <Badge variant="secondary" className="text-xs">✓ Respondido</Badge>
          )}
        </div>

        <Card className="card-gradient border-border/50">
          <CardContent className="p-6 space-y-4">
            {/* Header */}
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-foreground">{selectedMessage.subject}</h3>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <User className="w-4 h-4" />
                  <span className="font-medium text-foreground">
                    {selectedMessage.contact?.nome || selectedMessage.from_email}
                  </span>
                  <span>{'<'}{selectedMessage.from_email}{'>'}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>{new Date(selectedMessage.received_at).toLocaleString('pt-BR')}</span>
                </div>
              </div>
            </div>

            <Separator />

            {/* Body */}
            <div className="min-h-[200px]">
              {selectedMessage.body_html ? (
                <div
                  className="prose prose-sm max-w-none text-foreground"
                  dangerouslySetInnerHTML={{ __html: selectedMessage.body_html }}
                />
              ) : (
                <pre className="whitespace-pre-wrap text-sm text-foreground">
                  {selectedMessage.body_text || '(Sem conteúdo)'}
                </pre>
              )}
            </div>

            <Separator />

            {/* Reply section */}
            {!showReply ? (
              <Button onClick={() => {
                setShowReply(true);
                setReplySubject(`Re: ${selectedMessage.subject}`);
              }}>
                <Reply className="w-4 h-4 mr-2" /> Responder
              </Button>
            ) : (
              <div className="space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <Reply className="w-4 h-4" /> Responder
                </h4>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Assunto</label>
                  <Input
                    value={replySubject}
                    onChange={(e) => setReplySubject(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Mensagem</label>
                  <EmailRichEditor
                    value={replyBody}
                    onChange={setReplyBody}
                    placeholder="Escreva sua resposta..."
                    minHeight="150px"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={() => setShowReply(false)}>
                    Cancelar
                  </Button>
                  <Button size="sm" onClick={handleReply} disabled={sending || !replyBody.trim()}>
                    {sending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
                    Enviar
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // List View
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">
            Respostas recebidas dos leads
            {unreadCount > 0 && (
              <Badge variant="destructive" className="ml-2 text-xs">{unreadCount} não lida{unreadCount > 1 ? 's' : ''}</Badge>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setFilter('all')}
          >
            Todas
          </Button>
          <Button
            variant={filter === 'unread' ? 'default' : 'outline'}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setFilter('unread')}
          >
            Não lidas
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={loadMessages}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {messages.length === 0 ? (
        <Card className="card-gradient border-border/50">
          <CardContent className="py-12 text-center">
            <Inbox className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
            <p className="font-medium text-muted-foreground">Nenhuma resposta recebida</p>
            <p className="text-sm text-muted-foreground mt-1">
              Quando um lead responder a um e-mail da cadência, a mensagem aparecerá aqui.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="card-gradient border-border/50 overflow-hidden">
          <div className="divide-y divide-border">
            {messages.map((msg) => (
              <button
                key={msg.id}
                className={`w-full text-left px-4 py-3 hover:bg-muted/30 transition-colors flex items-start gap-3 ${
                  !msg.read ? 'bg-primary/5' : ''
                }`}
                onClick={() => handleSelectMessage(msg)}
              >
                <div className="mt-0.5 flex-shrink-0">
                  {msg.read ? (
                    <MailOpen className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <Mail className="w-4 h-4 text-primary" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-sm truncate ${!msg.read ? 'font-semibold text-foreground' : 'text-foreground'}`}>
                      {msg.contact?.nome || msg.from_email}
                    </span>
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {formatDate(msg.received_at)}
                    </span>
                  </div>
                  <p className={`text-sm truncate ${!msg.read ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                    {msg.subject}
                  </p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {msg.body_text?.substring(0, 100) || '(Sem prévia)'}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  {msg.replied && (
                    <Badge variant="outline" className="text-[10px]">Respondido</Badge>
                  )}
                  {!msg.read && (
                    <div className="w-2 h-2 rounded-full bg-primary" />
                  )}
                </div>
              </button>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
