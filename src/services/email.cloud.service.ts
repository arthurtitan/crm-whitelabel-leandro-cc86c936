/**
 * Email Cloud Service
 * Uses Supabase directly for email module when VITE_USE_BACKEND=false.
 */

import { supabase } from '@/integrations/supabase/client';
import type {
  EmailCadence, EmailCadenceStep, EmailCadenceRule,
  EmailTemplate, EmailEnrollment, EmailSend, SendStats, GeneratedEmail,
} from './email.service';

function mapRow(row: any): any {
  return row; // Supabase already returns snake_case matching our types
}

export const emailCloudService = {
  // ==================== CADENCES ====================
  async listCadences(): Promise<EmailCadence[]> {
    const { data, error } = await supabase
      .from('email_cadences')
      .select('*, steps:email_cadence_steps(*), rules:email_cadence_rules(*)')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data || []).map(c => ({
      ...c,
      steps: (c.steps || []).sort((a: any, b: any) => a.day_number - b.day_number),
      rules: (c.rules || []).map((r: any) => ({ ...r, trigger_event: r.trigger_event as EmailCadenceRule['trigger_event'] })),
    })) as EmailCadence[];
  },

  async getCadence(id: string): Promise<EmailCadence> {
    const { data, error } = await supabase
      .from('email_cadences')
      .select('*, steps:email_cadence_steps(*), rules:email_cadence_rules(*)')
      .eq('id', id)
      .single();
    if (error) throw new Error(error.message);
    return {
      ...data,
      steps: (data.steps || []).sort((a: any, b: any) => a.day_number - b.day_number),
      rules: (data.rules || []).map((r: any) => ({ ...r, trigger_event: r.trigger_event as EmailCadenceRule['trigger_event'] })),
    } as EmailCadence;
  },

  async createCadence(input: { name: string; description?: string; targetStageIds?: string[] }): Promise<EmailCadence> {
    // Get current user's account_id
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Não autenticado');
    const { data: profile } = await supabase.from('profiles').select('account_id').eq('user_id', user.id).single();
    if (!profile?.account_id) throw new Error('Conta não encontrada');

    const { data, error } = await supabase
      .from('email_cadences')
      .insert({
        account_id: profile.account_id,
        name: input.name,
        description: input.description || null,
        target_stage_ids: input.targetStageIds || [],
        created_by: user.id,
      })
      .select('*, steps:email_cadence_steps(*), rules:email_cadence_rules(*)')
      .single();
    if (error) throw new Error(error.message);
    return { ...data, steps: [], rules: [] };
  },

  async updateCadence(id: string, input: Partial<{ name: string; description: string; targetStageIds: string[]; active: boolean }>): Promise<EmailCadence> {
    const updateData: any = {};
    if (input.name !== undefined) updateData.name = input.name;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.targetStageIds !== undefined) updateData.target_stage_ids = input.targetStageIds;
    if (input.active !== undefined) updateData.active = input.active;

    const { data, error } = await supabase
      .from('email_cadences')
      .update(updateData)
      .eq('id', id)
      .select('*, steps:email_cadence_steps(*), rules:email_cadence_rules(*)')
      .single();
    if (error) throw new Error(error.message);
    return {
      ...data,
      steps: (data.steps || []).sort((a: any, b: any) => a.day_number - b.day_number),
      rules: (data.rules || []).map((r: any) => ({ ...r, trigger_event: r.trigger_event as EmailCadenceRule['trigger_event'] })),
    } as EmailCadence;
  },

  async deleteCadence(id: string): Promise<void> {
    const { error } = await supabase.from('email_cadences').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  // ==================== STEPS ====================
  async createStep(cadenceId: string, input: { dayNumber: number; subject: string; bodyHtml: string; bodyText?: string; ordem?: number }): Promise<EmailCadenceStep> {
    const { data, error } = await supabase
      .from('email_cadence_steps')
      .insert({
        cadence_id: cadenceId,
        day_number: input.dayNumber,
        subject: input.subject,
        body_html: input.bodyHtml,
        body_text: input.bodyText || null,
        ordem: input.ordem || 0,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as EmailCadenceStep;
  },

  async updateStep(id: string, input: Partial<{ dayNumber: number; subject: string; bodyHtml: string; bodyText: string; active: boolean; ordem: number }>): Promise<EmailCadenceStep> {
    const updateData: any = {};
    if (input.dayNumber !== undefined) updateData.day_number = input.dayNumber;
    if (input.subject !== undefined) updateData.subject = input.subject;
    if (input.bodyHtml !== undefined) updateData.body_html = input.bodyHtml;
    if (input.bodyText !== undefined) updateData.body_text = input.bodyText;
    if (input.active !== undefined) updateData.active = input.active;
    if (input.ordem !== undefined) updateData.ordem = input.ordem;

    const { data, error } = await supabase
      .from('email_cadence_steps')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as EmailCadenceStep;
  },

  async deleteStep(id: string): Promise<void> {
    const { error } = await supabase.from('email_cadence_steps').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  // ==================== TEMPLATES ====================
  async listTemplates(): Promise<EmailTemplate[]> {
    const { data, error } = await supabase
      .from('email_templates')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data || []) as EmailTemplate[];
  },

  async createTemplate(input: { name: string; subject: string; bodyHtml: string; bodyText?: string; category?: string }): Promise<EmailTemplate> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Não autenticado');
    const { data: profile } = await supabase.from('profiles').select('account_id').eq('user_id', user.id).single();
    if (!profile?.account_id) throw new Error('Conta não encontrada');

    const { data, error } = await supabase
      .from('email_templates')
      .insert({
        account_id: profile.account_id,
        name: input.name,
        subject: input.subject,
        body_html: input.bodyHtml,
        body_text: input.bodyText || null,
        category: input.category || null,
        created_by: user.id,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as EmailTemplate;
  },

  async updateTemplate(id: string, input: Partial<{ name: string; subject: string; bodyHtml: string; bodyText: string; category: string }>): Promise<EmailTemplate> {
    const updateData: any = {};
    if (input.name !== undefined) updateData.name = input.name;
    if (input.subject !== undefined) updateData.subject = input.subject;
    if (input.bodyHtml !== undefined) updateData.body_html = input.bodyHtml;
    if (input.bodyText !== undefined) updateData.body_text = input.bodyText;
    if (input.category !== undefined) updateData.category = input.category;

    const { data, error } = await supabase
      .from('email_templates')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as EmailTemplate;
  },

  async deleteTemplate(id: string): Promise<void> {
    const { error } = await supabase.from('email_templates').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  // ==================== ENROLLMENTS ====================
  async enroll(cadenceId: string, contactIds: string[]): Promise<EmailEnrollment[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Não autenticado');
    const { data: profile } = await supabase.from('profiles').select('account_id').eq('user_id', user.id).single();
    if (!profile?.account_id) throw new Error('Conta não encontrada');

    const inserts = contactIds.map(contactId => ({
      account_id: profile.account_id!,
      cadence_id: cadenceId,
      contact_id: contactId,
      status: 'active' as const,
      current_step: 0,
    }));

    const { data, error } = await supabase
      .from('email_enrollments')
      .insert(inserts)
      .select();
    if (error) throw new Error(error.message);
    return (data || []) as EmailEnrollment[];
  },

  async unenroll(cadenceId: string, contactIds: string[]): Promise<void> {
    const { error } = await supabase
      .from('email_enrollments')
      .update({ status: 'unsubscribed' as any })
      .eq('cadence_id', cadenceId)
      .in('contact_id', contactIds);
    if (error) throw new Error(error.message);
  },

  async listEnrollments(cadenceId?: string): Promise<EmailEnrollment[]> {
    let query = supabase.from('email_enrollments').select('*, contact:contacts(id, nome, email)');
    if (cadenceId) query = query.eq('cadence_id', cadenceId);
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data || []) as EmailEnrollment[];
  },

  // ==================== SENDS ====================
  async listSends(filters?: { cadenceId?: string; contactId?: string; status?: string; limit?: number; offset?: number }): Promise<EmailSend[]> {
    let query = supabase.from('email_sends').select('*, contact:contacts(id, nome, email)');
    if (filters?.cadenceId) {
      // filter via enrollment
    }
    if (filters?.contactId) query = query.eq('contact_id', filters.contactId);
    if (filters?.status) query = query.eq('status', filters.status);
    query = query.order('created_at', { ascending: false }).limit(filters?.limit || 50);
    if (filters?.offset) query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1);
    
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data || []) as EmailSend[];
  },

  async getSendStats(): Promise<SendStats> {
    const { data, error } = await supabase.from('email_sends').select('status');
    if (error) throw new Error(error.message);
    const rows = data || [];
    return {
      total: rows.length,
      sent: rows.filter(r => r.status === 'sent').length,
      delivered: rows.filter(r => r.status === 'delivered').length,
      opened: rows.filter(r => r.status === 'opened').length,
      clicked: rows.filter(r => r.status === 'clicked').length,
      bounced: rows.filter(r => r.status === 'bounced').length,
      failed: rows.filter(r => r.status === 'failed').length,
    };
  },

  // ==================== AI (placeholder - needs backend) ====================
  async generateEmail(prompt: string, context?: { leadName?: string; leadEmail?: string; stageName?: string }): Promise<GeneratedEmail> {
    throw new Error('Geração de IA requer configuração do backend. Configure a chave OpenAI nas configurações da conta.');
  },

  // ==================== SETTINGS ====================
  async getSettings(): Promise<{ hasOpenaiKey: boolean; hasSendgridKey: boolean; sendgridFromEmail: string; sendgridFromName: string }> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Não autenticado');
    const { data: profile } = await supabase.from('profiles').select('account_id').eq('user_id', user.id).single();
    if (!profile?.account_id) throw new Error('Conta não encontrada');

    const { data: acc, error } = await supabase
      .from('accounts')
      .select('openai_api_key, sendgrid_api_key, sendgrid_from_email, sendgrid_from_name')
      .eq('id', profile.account_id)
      .single();
    if (error) throw new Error(error.message);
    return {
      hasOpenaiKey: !!acc?.openai_api_key,
      hasSendgridKey: !!acc?.sendgrid_api_key,
      sendgridFromEmail: acc?.sendgrid_from_email || '',
      sendgridFromName: acc?.sendgrid_from_name || '',
    };
  },

  async updateSettings(data: { openaiApiKey?: string; sendgridApiKey?: string; sendgridFromEmail?: string; sendgridFromName?: string }): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Não autenticado');
    const { data: profile } = await supabase.from('profiles').select('account_id').eq('user_id', user.id).single();
    if (!profile?.account_id) throw new Error('Conta não encontrada');

    const updateData: any = {};
    if (data.openaiApiKey !== undefined) updateData.openai_api_key = data.openaiApiKey || null;
    if (data.sendgridApiKey !== undefined) updateData.sendgrid_api_key = data.sendgridApiKey || null;
    if (data.sendgridFromEmail !== undefined) updateData.sendgrid_from_email = data.sendgridFromEmail || null;
    if (data.sendgridFromName !== undefined) updateData.sendgrid_from_name = data.sendgridFromName || null;

    const { error } = await supabase.from('accounts').update(updateData).eq('id', profile.account_id);
    if (error) throw new Error(error.message);
  },

  // ==================== PROCESS QUEUE (no-op in cloud) ====================
  async processQueue(): Promise<{ success: boolean; processed: number }> {
    return { success: true, processed: 0 };
  },

  // ==================== TESTS (no-op in cloud) ====================
  async testSendgrid(_apiKey: string): Promise<{ success: boolean; message: string }> {
    return { success: false, message: 'Teste de conexão requer backend Express.' };
  },

  async testSendEmail(_apiKey: string, _fromEmail: string, _fromName: string, _toEmail: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
    return { success: false, error: 'Envio de teste requer backend Express.' };
  },

  async testOpenai(_apiKey: string): Promise<{ success: boolean; message: string }> {
    return { success: false, message: 'Teste de OpenAI requer backend Express.' };
  },

  // ==================== RULES ====================
  async listRules(cadenceId: string): Promise<EmailCadenceRule[]> {
    const { data, error } = await supabase
      .from('email_cadence_rules')
      .select('*')
      .eq('cadence_id', cadenceId);
    if (error) throw new Error(error.message);
    return (data || []) as EmailCadenceRule[];
  },

  async createRule(cadenceId: string, input: { triggerEvent: string; targetCadenceId: string; delayHours?: number }): Promise<EmailCadenceRule> {
    const { data, error } = await supabase
      .from('email_cadence_rules')
      .insert({
        cadence_id: cadenceId,
        trigger_event: input.triggerEvent,
        target_cadence_id: input.targetCadenceId,
        delay_hours: input.delayHours || 0,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as EmailCadenceRule;
  },

  async updateRule(id: string, input: Partial<{ triggerEvent: string; targetCadenceId: string; delayHours: number; active: boolean }>): Promise<EmailCadenceRule> {
    const updateData: any = {};
    if (input.triggerEvent !== undefined) updateData.trigger_event = input.triggerEvent;
    if (input.targetCadenceId !== undefined) updateData.target_cadence_id = input.targetCadenceId;
    if (input.delayHours !== undefined) updateData.delay_hours = input.delayHours;
    if (input.active !== undefined) updateData.active = input.active;

    const { data, error } = await supabase
      .from('email_cadence_rules')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as EmailCadenceRule;
  },

  async deleteRule(id: string): Promise<void> {
    const { error } = await supabase.from('email_cadence_rules').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },
};
