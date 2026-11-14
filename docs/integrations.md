# Integration notes: Outlook, GivePulse, Handshake

Research notes from November 2026. Nothing here is built into the app yet
except the Handshake client in `handshake/`. Treat the plans below as options.

## 1. Outlook calendar

### Option A: private calendar feed (recommended first step)

The app publishes one private `.ics` link per student. The student subscribes
once in Outlook (Add calendar, Subscribe from web, paste the link) and events
appear in their calendar.

- Subscribing keeps Outlook updated with later changes. A one-time file import
  does not. Updates can take a while to show up, so it is not instant.
- Outlook on the web wants `https://` links, not `webcal://`.
- Each link must be unguessable. Treat it like a password.
- Works with Google Calendar and Apple Calendar too.
- One-way only. Changes made in Outlook do not come back to the app.
- No Microsoft developer registration needed.

What would go in the feed: due dates the AI extracts from emails, and later
Handshake events.

### Option B: write directly to Outlook with Microsoft Graph

A student clicks "Add to my Outlook", signs in with Microsoft, and the app
creates events with `POST /me/events`. Needs the delegated `Calendars.ReadWrite`
permission, an app registration with Microsoft, OAuth sign-in, and safe token
storage. Check with the school's IT office, since they can restrict which apps
students may approve.

Only build this if the school asks for "Add to Outlook" buttons.

## 2. GivePulse

No public developer API was found. GivePulse appears in automation tools such
as Zapier, so access is probably controlled by the school's GivePulse admin.

Practical route: GivePulse already sends event and shift emails. If the school
forwards those to the Resend receiving address, the existing AI sorting handles
them (category, summary, dates) with no GivePulse API at all.

Open question: confirm with the school that "GivePulse" is the platform meant.

## 3. Handshake

Handshake has no general public API. A read-only, school-scoped EDU API exists
for career services partners, and access is requested through the school's
Handshake Relationship Manager. A client with demo mode is in `handshake/`.

## Sources

- Microsoft Graph, create event: https://learn.microsoft.com/en-us/graph/api/user-post-events
- Microsoft Graph, create event in a calendar: https://learn.microsoft.com/en-us/graph/api/calendar-post-events
- Subscribing to an ICS feed in Outlook: https://kb.wisc.edu/education/154693
- Handshake EDU API getting started: https://support.joinhandshake.com/hc/en-us/articles/31061076506391-Getting-Started-with-EDU-API
