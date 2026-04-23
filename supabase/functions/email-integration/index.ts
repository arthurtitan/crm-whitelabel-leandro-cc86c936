import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function getSupabase() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
}

Deno.serve(async (req) => {
    if (action === 'process-queue') {
      const supabase = getSupabase();
      const now = new Date().toISOString();

      // Find active enrollments ready to send
      const { data: readyEnrollments, error: enrollError } = await supabase
        .from('email_enrollments')
        .select(`
          *,
          cadence:email_cadences (
            *,
            steps:email_cadence_steps (*)
          ),
          contact:contacts (*)
        `)
        .eq('status', 'active')
        .lte('next_send_at', now)
        .limit(20);

      if (enrollError) throw enrollError;

      let processedCount = 0;

      for (const enrollment of readyEnrollments || []) {
        try {
          // Get account config
          const { data: account, error: accError } = await supabase
            .from('accounts')
            .select('sendgrid_api_key, sendgrid_from_email, sendgrid_from_name')
            .eq('id', enrollment.account_id)
            .single();

          if (accError || !account?.sendgrid_api_key || !account?.sendgrid_from_email) {
            console.warn(`[process-queue] Account ${enrollment.account_id} not configured for SendGrid`);
            continue;
          }

          const steps = (enrollment.cadence.steps || [])
            .filter((s: any) => s.active)
            .sort((a: any, b: any) => a.day_number - b.day_number);
          
          const currentStep = steps[enrollment.current_step];

          if (!currentStep || !enrollment.contact?.email) {
            await supabase
              .from('email_enrollments')
              .update({ status: 'completed', updated_at: now })
              .eq('id', enrollment.id);
            continue;
          }

          // Replace variables
          let subject = currentStep.subject || '';
          let html = currentStep.body_html || '';
          const replacements = {
            '{nome}': enrollment.contact.nome || '',
            '{email}': enrollment.contact.email || '',
          };

          for (const [key, val] of Object.entries(replacements)) {
            subject = subject.replaceAll(key, val);
            html = html.replaceAll(key, val);
          }

          // Send via SendGrid
          const sgResponse = await fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${account.sendgrid_api_key}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              personalizations: [{ to: [{ email: enrollment.contact.email }] }],
              from: { email: account.sendgrid_from_email, name: account.sendgrid_from_name || 'GoodLeads CRM' },
              subject,
              content: [{ type: 'text/html', value: html }],
            }),
          });

          const status = sgResponse.status === 202 ? 'sent' : 'failed';
          const messageId = sgResponse.headers.get('x-message-id') || null;

          // Create send log
          await supabase.from('email_sends').insert({
            account_id: enrollment.account_id,
            enrollment_id: enrollment.id,
            step_id: currentStep.id,
            contact_id: enrollment.contact_id,
            to_email: enrollment.contact.email,
            subject,
            status,
            sendgrid_message_id: messageId,
            sent_at: status === 'sent' ? now : null,
          });

          // Update enrollment
          if (status === 'sent') {
            const nextStepIdx = enrollment.current_step + 1;
            const hasNextStep = nextStepIdx < steps.length;
            
            let nextSendAt = null;
            if (hasNextStep) {
              const nextStep = steps[nextStepIdx];
              // Very simple delay calculation: 1 day later
              const d = new Date();
              d.setDate(d.getDate() + 1);
              nextSendAt = d.toISOString();
            }

            await supabase
              .from('email_enrollments')
              .update({
                current_step: nextStepIdx,
                status: hasNextStep ? 'active' : 'completed',
                next_send_at: nextSendAt,
                updated_at: now,
              })
              .eq('id', enrollment.id);
            
            processedCount++;
          }
        } catch (e: any) {
          console.error(`[process-queue] Error processing enrollment ${enrollment.id}:`, e.message);
        }
      }

      return new Response(JSON.stringify({ success: true, processed: processedCount }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, apiKey, fromEmail, fromName, toEmail, subject, html, text } = body;

    if (action === 'test-connection') {
      const response = await fetch('https://api.sendgrid.com/v3/user/profile', {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });

      if (response.ok) {
        return new Response(JSON.stringify({ success: true, message: 'Conexão com SendGrid estabelecida!' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const errorText = await response.text();
      return new Response(JSON.stringify({ success: false, message: `Erro ${response.status}: ${errorText}` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'send-email' || action === 'test-send') {
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: toEmail }] }],
          from: { email: fromEmail, name: fromName || 'GoodLeads CRM' },
          subject: subject || 'Teste de E-mail',
          content: [
            ...(text ? [{ type: 'text/plain', value: text }] : []),
            { type: 'text/html', value: html || '<p>Teste de e-mail</p>' },
          ],
        }),
      });

      if (response.status === 202) {
        const messageId = response.headers.get('x-message-id') || undefined;
        return new Response(JSON.stringify({ success: true, messageId }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const errorText = await response.text();
      return new Response(JSON.stringify({ success: false, error: `SendGrid ${response.status}: ${errorText}` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: false, error: 'Ação inválida' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});