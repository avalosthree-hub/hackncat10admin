# Aggie Fetch Admin

Institution administration for the existing Aggie Fetch platform. React, TypeScript, Vite, and the shared Supabase client; the Fetchy navy/gold styling and root-level layout follow the companion HackNCAT-10 project. No new runtime dependencies are required.

## Run locally

From this repository root:

```sh
cp .env.example .env.local
# Add this project's Supabase URL and public anon key to .env.local.
npm install
npm run dev -- --port 5174
```

Open http://localhost:5174. Do not overwrite an existing configured `.env.local`. Only the public client key belongs in Vite variables. Never add service-role, Resend, or OpenAI credentials to the frontend.

Sign in using your existing Supabase account. Both students and administrators use this same login. A registered account alone does not grant administrator access. An existing institution owner can add a registered member of that institution by university email. The dashboard cannot create or promote owners.

## Routes and authorization

Hash routes work on static hosting without server rewrite rules:

- `#/admin/overview`: institution name, list/sender/admin totals, and five recent post summaries.
- `#/admin/lists`: institution mailing lists; create, edit, delete, search names/descriptions/senders, and open details. Optional descriptions (up to 1,000 characters) appear on cards and detail pages.
- `#/admin/lists/<uuid>`: list names and sender address management, including moving a sender within the institution.
- `#/admin/events`: unified curated/derived event management, preview, publication, cancellation and RSVP administration; `#/admin/events/<uuid>` opens details.
- `#/admin/senders`: searchable institution sender directory; save once and reuse on multiple lists.
- `#/admin/topics`: shared institution hashtag settings for future emails.
- `#/admin/event-review`: dedicated editable swipe-review queue for derived events.
- `#/admin/administrators`: owner-only roster and add/remove actions for regular administrators.
- `#/feed`: the same authenticated account's student feed through the existing `get_user_feed` RPC.

Role detection resolves `users.auth_id = auth.users.id`, then looks up `institution_admins.user_id = users.id`. The UI handles multiple institution assignments, rechecks access on window focus and manual refresh, and does not use email suffixes or editable user metadata for authorization. Unauthenticated visitors see the shared login; authenticated non-admins cannot mount the dashboard. Direct owner-route visits are checked as well as navigation visibility.

All table operations still run with the signed-in user's token and existing RLS. Updates explicitly filter the selected institution. The list editor updates `list.tag`; institution topics live in `institutions.hashtags` and are saved through a scoped RPC; the backend's column privileges forbid list/post institution reassignment. Sender moves are checked against the current institution in the client and both source/destination lists in backend RLS. Zero-row mutations are reported as failures rather than successes.

Topic labels are full category names, stored as `text[]`, trimmed and deduplicated case-insensitively. Sender addresses are trimmed and lowercased. Directory entries are unique per institution; approvals are unique per list/address. A new incoming email is published to every list that approves its sender. Topic and routing changes affect future processed emails and do not rewrite historical posts. List deletion cascades sender mappings/subscriptions and sets historical posts' `list_id` to null; the confirmation explains this effect.

## Backend changes

The additive migration `supabase/migrations/20261114060310_institution_admin_dashboard.sql` was applied to the connected Aggie Fetch project. It requires the existing `users`, `institutions`, `institution_admins`, `list`, `list_senders`, and `email_posts` tables plus the established `private.is_institution_admin`, `private.is_institution_owner`, and `private.can_assign_institution_admin` helpers. It creates:

- `admin_dashboard_counts(uuid)`: verifies admin/owner assignment before returning only institution aggregate totals. Ordinary admins' existing role SELECT policy exposes only their own assignment, so counting table rows directly would undercount.
- `admin_institution_roster(uuid)`: verifies owner assignment and returns only this institution's existing administrators, roles, emails, public profile IDs, and assignment dates.
- `assign_institution_admin_by_email(uuid, text)`: verifies the owner, resolves an existing registered account within the same institution, and atomically grants only `admin`. It uses `public.users.id`, never the auth ID, for the assignment. Missing and out-of-institution emails share the same error. No general user lookup endpoint is exposed.

These intentionally privileged functions use an empty `search_path`, fully qualified objects, explicit role checks, and authenticated-only execution. They do not grant browser access to `auth.users`, replace RLS policies, or introduce new tables. The security advisor flags their authenticated SECURITY DEFINER entry points for review; these are intentional and tested against unauthorized callers. The pre-existing leaked-password protection warning remains an Auth project setting.

**Legacy prototype:** `supabase/migrations/001_init.sql` and `supabase/functions/inbound-email` describe the older Student Inbox schema (`profiles`, `emails`, `students`, `tasks`, and `settings`). They are retained as historical source and are not the connected Aggie Fetch backend. Do not run that migration or deploy that old function against Aggie Fetch, and do not use `profiles.role` to grant access. This repository is not a full baseline of the shared backend; apply only the additive dashboard migration to an environment that already has the established Aggie Fetch schema. The production pipeline now lives in `supabase/functions/receive-email`, `retry-email`, and `_shared`; see [attachment and topic setup](docs/email-attachments-and-topics.md).

Generated shared database types now live in `src/lib/database.types.ts` and parameterize the existing Supabase client. Domain adapters handle nullable legacy list/institution labels and JSON RPC responses.

## Validation

```sh
npm test       # Node 22.18+; validation, evidence, schedule, classifier and attachment tests
npm run build  # TypeScript check and production build
```

`supabase/tests/institution_admin_dashboard.sql` exercises real RLS and mutation behavior as anonymous, student, admin, and owner roles using temporary fixtures. Run the script as postgres against an Aggie Fetch development database; it encloses all fixtures and changes in a transaction and rolls back. It covers cross-institution isolation, blocked self-assignment, sender uniqueness and moves, preserved historical posts, email-based assignment, owner protection, and deletion effects.

`npm run test:browser` uses a running app at port 5174 and an isolated headless Chrome DevTools endpoint at port 9228. Start Chrome with a temporary `--user-data-dir` and `--remote-debugging-port=9228`. Override `APP_URL` or `CHROME_DEBUG_PORT` as needed. It uses mocked API fixtures and blocks all actual Supabase requests. Checks cover the desktop overview, list creation, topic editing, sender add/move, owner add/remove, 390px mobile layout and modal, and protected routes for admin/student/anonymous users. A mobile screenshot is saved to `/tmp/aggie-fetch-mobile.png`. Use an isolated browser profile: the test clears local storage for the app origin in that profile.

The SQL tests, browser checks, and production build passed during implementation. A real user sign-in was not performed; browser role/session fixtures are mocked while SQL authorization tests use real policies.

## Files

```text
src/
  main.tsx                React entry point
  style.css               responsive Fetchy interface
  app/
    App.tsx               session, role detection, protected routing
    hooks/useRoute.ts     hash routing
  components/             shared LoginScreen, Sidebar, TopBar, Modal
  features/
    admin/
      api/admin.ts        scoped admin data access and domain types
      components/         AdminStudio, MailingLists, Administrators, TopicEditor
    events/
      api/events.ts       scoped event data access and typed models
      components/         Events, EventEditor, EventReview, SwipeDecision, AttendanceChips
    home/
      api/feed.ts         authorized feed RPC
      components/FeedPage.tsx
  lib/
    supabase.ts           shared client
    database.types.ts     shared generated database types
    validation.ts         email and topic-label normalization
public/                   static assets
supabase/
  functions/              existing inbound email integration
  migrations/             dashboard and event administration migrations
  tests/                  backend authorization/mutation checks
tests/                    validation and mocked browser smoke checks
docs/                     admin integration and event guides
handshake/                Handshake integration
```

The source layout follows HackNCAT-10: `app` owns the application shell,
`components` contains shared UI, and each `features/<name>` groups its UI and
API modules. Feature hooks can live alongside them when needed. Admin-specific
content, TypeScript, and existing integrations remain in this project.


## Event administration

The Events section is implemented against the student website’s existing shared event and RSVP tables. The event administration migration has been applied to the connected Aggie Fetch project. See [the event administration guide](docs/events.md) for staff workflows, the compatible withdrawn/cancellation contract, access controls, database changes, changed files, test results and Outlook integration limits. No additional frontend configuration is required. Event images are omitted because the project has no storage buckets.

The additive `mailing_list_descriptions` migration adds nullable `list.description` with a 1,000-character limit and column-level INSERT/UPDATE access under existing institution-admin RLS. Existing lists start with no description. `supabase/tests/mailing_list_descriptions.sql` verifies create/update/clear, length limits, student read-only access and cross-institution protection with rolled-back fixtures.

Mailing-list deletion requires typing the displayed list name exactly, including capitalization. The action stays disabled until it matches, and deletion also filters by the confirmed name so a concurrent rename cannot delete a differently named list.
