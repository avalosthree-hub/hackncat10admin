# Student Inbox

Emails sent to a Resend address are sorted by OpenAI (category, summary, tasks and due dates, which students should see it) and shown on a student web page. Admins manage students, AI settings, and all emails.

```
Email -> Resend inbound -> webhook -> Supabase Edge Function -> OpenAI
                                              |
                                              v
                                       Supabase database <- web app (students + admins)
```

## Setup

### 1. Supabase
1. Create a project at supabase.com.
2. In the SQL editor, run `supabase/migrations/001_init.sql`.
3. Install the CLI, then from this folder: `supabase login` and `supabase link --project-ref YOUR_REF`.

### 2. Secrets and function
```
supabase secrets set OPENAI_API_KEY=sk-... RESEND_API_KEY=re_... RESEND_WEBHOOK_SECRET=whsec_...
supabase functions deploy inbound-email --no-verify-jwt
```
You get `RESEND_WEBHOOK_SECRET` in step 3 (create the webhook first, then set the secret and deploy again if needed).
The function URL is `https://YOUR_REF.supabase.co/functions/v1/inbound-email`.

### 3. Resend
1. In Resend, open Emails > Receiving and note your receiving address (`anything@your-id.resend.app`), or add your own domain. Use a subdomain for a custom domain, because receiving on a root domain sends all its mail to Resend.
2. Add a webhook pointing at the function URL, event `email.received`. Copy its signing secret into `RESEND_WEBHOOK_SECRET`.

### 4. Web app
```
cd web
cp .env.example .env     # add Supabase URL and anon key
npm install
npm run dev
```
Deploy later with Vercel or Netlify (build command `npm run build`, output `dist`).

### 5. Make yourself admin
Sign up in the web app, then run in the SQL editor:
```
update public.profiles set role = 'admin' where email = 'you@example.com';
```
Then add students in the Students tab (sign them up first so their login links up), and send a test email to your Resend address.

## Security notes
- Only the Supabase anon key is in the web app. OpenAI, Resend, and service role keys live only in Edge Function secrets.
- Access is enforced by row level security in the database. Students can only read emails routed to them. Roles cannot be changed from the client.
- Email text is untrusted. The model output is constrained to a JSON schema and checked against real student IDs and date formats before saving.
- Consider turning on Supabase email confirmation, and adding rate limits if the receiving address is public.

## Known limits
- Attachments are not processed yet.
- If OpenAI fails, the email is saved with status `failed` (visible in the admin Emails tab) but there is no retry button yet.
