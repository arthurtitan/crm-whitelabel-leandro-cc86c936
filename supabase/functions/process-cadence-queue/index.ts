const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Edge Function: process-cadence-queue
 * 
 * Called by pg_cron every 5 minutes to trigger the backend
 * cadence processor. This acts as a bridge between Supabase cron
 * and the Express backend.
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get backend URL from env or use default
    const backendUrl = Deno.env.get('BACKEND_API_URL') || 'https://api.goodleads.com.br';
    const serviceKey = Deno.env.get('BACKEND_SERVICE_KEY') || '';

    const response = await fetch(`${backendUrl}/api/emails/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
    });

    const data = await response.json();

    return new Response(JSON.stringify({
      success: true,
      processed: data.processed || 0,
      timestamp: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    console.error('[process-cadence-queue] Error:', error.message);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
