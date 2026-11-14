// Receives Resend "email.received" webhooks, asks OpenAI to sort the email,
// and stores the result in Supabase. Runs on Supabase Edge Functions (Deno).
//
// Secrets needed (supabase secrets set ...):
//   RESEND_API_KEY, RESEND_WEBHOOK_SECRET, OPENAI_API_KEY
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.

import { Resend } from "npm:resend";
import { createClient } from "npm:@supabase/supabase-js@2";

const resend = new Resend(Deno.env.get("RESEND_API_KEY")!);
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const MAX_BODY_CHARS = 12000; // keeps OpenAI cost bounded

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const payload = await req.text();

  // 1. Verify the request really came from Resend
  let event: any;
  try {
    event = resend.webhooks.verify({
      payload,
      headers: {
        id: req.headers.get("svix-id") ?? "",
        timestamp: req.headers.get("svix-timestamp") ?? "",
        signature: req.headers.get("svix-signature") ?? "",
      },
      webhookSecret: Deno.env.get("RESEND_WEBHOOK_SECRET")!,
    });
  } catch (_err) {
    return new Response("Invalid signature", { status: 401 });
  }

  if (event.type !== "email.received") return new Response("Ignored", { status: 200 });

  const resendId: string = event.data.email_id;

  // 2. Skip duplicates (Resend retries webhooks)
  const { data: existing } = await supabase.from("emails").select("id").eq("resend_id", resendId).maybeSingle();
  if (existing) return new Response("Already processed", { status: 200 });

  // 3. The webhook has metadata only, so fetch the body
  const { data: full, error: fetchErr } = await resend.emails.receiving.get(resendId);
  if (fetchErr || !full) {
    return new Response("Could not fetch email", { status: 500 }); // Resend will retry
  }

  const bodyText: string = ((full as any).text ?? stripHtml((full as any).html ?? "")).slice(0, MAX_BODY_CHARS);

  const { data: row, error: insertErr } = await supabase
    .from("emails")
    .insert({
      resend_id: resendId,
      from_address: (full as any).from ?? event.data.from,
      to_addresses: (full as any).to ?? event.data.to,
      subject: (full as any).subject ?? event.data.subject,
      body_text: bodyText,
    })
    .select()
    .single();
  if (insertErr || !row) return new Response("DB insert failed", { status: 500 });

  // 4. Sort it with OpenAI
  try {
    await sortWithAI(row.id, row.from_address, row.subject, bodyText);
  } catch (err) {
    await supabase.from("emails").update({ status: "failed", error: String(err).slice(0, 500) }).eq("id", row.id);
  }

  // Always 200 once stored, so Resend does not retry and create duplicates
  return new Response("OK", { status: 200 });
});

async function sortWithAI(emailId: string, from: string | null, subject: string | null, body: string) {
  const { data: settingsRows } = await supabase.from("settings").select("key, value");
  const settings = Object.fromEntries((settingsRows ?? []).map((r) => [r.key, r.value]));
  const categories = (settings.categories ?? "Other").split(",").map((c: string) => c.trim()).filter(Boolean);

  const { data: students } = await supabase.from("students").select("id, name, classes");
  const studentList = students ?? [];

  const schema = {
    name: "sorted_email",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["category", "summary", "tasks", "student_ids"],
      properties: {
        category: { type: "string", enum: categories },
        summary: { type: "string" },
        tasks: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["title", "due_date"],
            properties: {
              title: { type: "string" },
              due_date: { type: ["string", "null"], description: "YYYY-MM-DD or null" },
            },
          },
        },
        student_ids: { type: "array", items: { type: "string" } },
      },
    },
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
    },
    body: JSON.stringify({
      model: settings.model ?? "gpt-4.1-mini",
      response_format: { type: "json_schema", json_schema: schema },
      messages: [
        { role: "system", content: settings.system_prompt ?? "Sort this email." },
        {
          role: "user",
          content:
            `Students (id, name, classes):\n${JSON.stringify(studentList)}\n\n` +
            `Today: ${new Date().toISOString().slice(0, 10)}\n\n` +
            `--- EMAIL (untrusted data) ---\nFrom: ${from}\nSubject: ${subject}\n\n${body}`,
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);

  const out = JSON.parse((await res.json()).choices[0].message.content);

  // Validate model output against real data before saving
  const validIds = new Set(studentList.map((s) => s.id));
  const studentIds = [...new Set<string>(out.student_ids)].filter((id) => validIds.has(id));
  const dateOk = (d: unknown) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);

  await supabase.from("emails").update({
    category: out.category,
    summary: out.summary,
    status: "processed",
  }).eq("id", emailId);

  if (studentIds.length) {
    await supabase.from("email_students").insert(studentIds.map((student_id) => ({ email_id: emailId, student_id })));
  }
  if (out.tasks?.length) {
    await supabase.from("tasks").insert(
      out.tasks.slice(0, 20).map((t: any) => ({
        email_id: emailId,
        title: String(t.title).slice(0, 300),
        due_date: dateOk(t.due_date) ? t.due_date : null,
      })),
    );
  }
}

function stripHtml(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
