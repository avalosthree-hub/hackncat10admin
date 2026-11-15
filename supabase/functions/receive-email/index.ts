import { Webhook } from "npm:svix@1.76.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.0";

import { ingestEmail } from '../_shared/ingestEmail.ts';

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const webhookSecret = Deno.env.get("RESEND_WEBHOOK_SECRET");
  if (!webhookSecret) return Response.json({ error: "Webhook secret missing" }, { status: 503 });
  let event: { type: string; created_at?: string; data?: { email_id?: string; from?: string; subject?: string } };
  try {
    event = new Webhook(webhookSecret).verify(await req.text(), {
      "svix-id": req.headers.get("svix-id") ?? "",
      "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
      "svix-signature": req.headers.get("svix-signature") ?? "",
    }) as typeof event;
  } catch {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }
  if (event.type !== "email.received") return Response.json({ ignored: true });
  const emailId = event.data?.email_id;
  if (!emailId) return Response.json({ error: "Missing email ID" }, { status: 400 });
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const url = Deno.env.get("SUPABASE_URL");
  const dbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!apiKey || !url || !dbKey) return Response.json({ error: "Server configuration missing" }, { status: 503 });
  const db = createClient(url, dbKey);
  const emailResponse = await fetch("https://api.resend.com/emails/receiving/" + encodeURIComponent(emailId), {
    headers: { Authorization: "Bearer " + apiKey },
  });
  if (!emailResponse.ok) {
    console.error("Resend fetch failed", emailResponse.status);
    return Response.json({ error: "Could not retrieve email" }, { status: 502 });
  }
  const email = await emailResponse.json();
  const raw = {
    subject: email.subject ?? event.data?.subject ?? "",
    from: email.from ?? event.data?.from ?? "",
    to: email.to ?? [],
    text: email.text ?? "",
    html: email.html ?? "",
    message_id: email.message_id ?? null,
    reply_to: email.reply_to ?? null,
  };
  try {
    const result=await ingestEmail(db,emailId,raw,event.created_at??email.created_at??null,email.attachments??[],apiKey);
    return Response.json(result,{status:result.retry?502:200});
  }catch {
    return Response.json({received:true,email_id:emailId,error:'Delivery processing failed'},{status:502});
  }
});
