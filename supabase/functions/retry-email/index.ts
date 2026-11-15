import { createClient } from 'npm:@supabase/supabase-js@2.57.0';
import { processEmail } from '../_shared/processEmail.ts';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return Response.json({error:'Method not allowed'}, {status:405});
  const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const url = Deno.env.get('SUPABASE_URL');
  if (!secret || !url) return Response.json({error:'Server configuration missing'}, {status:503});
  if (req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') !== secret) return Response.json({error:'Unauthorized'}, {status:401});
  let body;
  try { body = await req.json(); } catch { return Response.json({error:'Invalid JSON'}, {status:400}); }
  if (!body.email_id || typeof body.email_id !== 'string') return Response.json({error:'email_id required'}, {status:400});
  try {
    return Response.json(await processEmail(createClient(url, secret), body.email_id, body.reprocess === true));
  } catch (error) {
    console.error('Email processing failed', String(error));
    return Response.json({email_id:body.email_id,error:String(error).slice(0,300)}, {status:502});
  }
});

