# RoadSafe Radar Control

RoadSafe Radar Control is the multi-tenant cloud platform for RoadSafe speed radars. A RoadSafe administrator provisions and assigns Raspberry Pi radars to client organisations; client users see only their assigned devices, vehicle events, photographs, reports, and alert recipients.

The repository contains the complete web portal, Supabase database and Edge Functions, and the replacement software package for each Raspberry Pi. The six files under `captures/` are retained local examples and are deliberately excluded from Git and cloud import.

## Architecture

```text
Raspberry Pi radar process
  └─ durable SQLite queue + overspeed photographs
       └─ outbound HTTPS cloud agent
            ├─ Next.js device API → Postgres + private Storage
            ├─ heartbeats/config/commands
            └─ signed, rollback-safe software updates

Postgres event queue → Plate Recognizer OCR → Brevo alert from radar@roadsafe.co.za
                                      └────→ client/admin portal and CSV reports
```

No inbound port, router forwarding, or public photo bucket is required on a radar. Tailscale remains available for emergency engineering access, but routine operation happens through the portal.

## What is implemented

- RoadSafe admin and client roles, private organisation memberships, and time-ranged radar assignments.
- A responsive client dashboard for traffic metrics, device health, events, evidence photographs, CSV reports, and notification recipients.
- RoadSafe workflows for clients, invitations, hardware provisioning, assignments, commands, and signed canary deployments.
- Device activation with one-time tokens and hashed rotating credentials.
- Durable event uploads, 60-second heartbeats, configuration sync, operational commands, and local offline retry on the Pi.
- Cloud OCR and Brevo delivery from `radar@roadsafe.co.za`, including webhook delivery/bounce state.
- Private signed photo access, 90-day event/photo retention, daily aggregates, and audit records.
- Ed25519 release signing, SHA-256 verification, atomic installation, health checks, and automatic rollback.

## Local demo

Requirements: Node.js 20+, Python 3.11+, Docker Desktop, and Supabase CLI.

```bash
npm install
NEXT_PUBLIC_DEMO_MODE=true npm run dev
```

Open `http://127.0.0.1:3000/dashboard`. Demo mode does not need cloud credentials and does not send mail.

Run all local checks:

```bash
npm run check
npm run test:e2e
supabase db reset
supabase test db supabase/tests/tenant_isolation.test.sql
supabase db lint --schema public --level warning --fail-on error
```

## Production setup

1. Create a Supabase project in a South African or nearest suitable region, then link and deploy:

   ```bash
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push
   supabase functions deploy process-events
   supabase functions deploy retention
   supabase functions deploy brevo-webhook
   ```

2. Copy `.env.example` to `.env.local` and set the production values. Generate independent random values for `DEVICE_CREDENTIAL_PEPPER`, `INTERNAL_JOB_SECRET`, and `CRON_SECRET`. Keep `SUPABASE_SECRET_KEY`, Brevo, OCR, and signing values server-only.

3. Set Edge Function secrets:

   ```bash
   supabase secrets set PLATE_RECOGNIZER_API_TOKEN=... BREVO_API_KEY=... INTERNAL_JOB_SECRET=... ALERT_EMAIL_FROM=radar@roadsafe.co.za BREVO_WEBHOOK_SECRET=...
   ```

4. Verify the `roadsafe.co.za` domain and `radar@roadsafe.co.za` sender in Brevo. Configure the Brevo transactional webhook to:

   ```text
   https://YOUR_PROJECT_REF.supabase.co/functions/v1/brevo-webhook?secret=YOUR_BREVO_WEBHOOK_SECRET
   ```

5. Configure Supabase Auth with a custom SMTP provider and the production redirect URL `https://portal.roadsafe.co.za/auth/callback`. This handles client invitations; radar alerts use the Brevo API separately.

6. Generate the offline release keypair once. Back up the private key outside the repository and password manager-access it only for releases:

   ```bash
   python3 device/generate_release_keys.py \
     --private-key ~/.roadsafe/keys/release-private.pem \
     --public-key device/release-public-key.pem
   base64 < device/release-public-key.pem | tr -d '\n'
   ```

   Put the final base64 output in Vercel as `ROADSAFE_RELEASE_PUBLIC_KEY_B64`. The public PEM is installed on every Pi; the private PEM never goes to Vercel, Supabase, Git, or a radar.

7. Create a Vercel project from this directory, set all production environment variables, deploy, and point `portal.roadsafe.co.za` to it. `vercel.json` invokes event processing every minute and retention daily. The chosen Vercel plan must support that cron frequency.

8. Bootstrap the first RoadSafe administrator from a trusted terminal:

   ```bash
   export NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   export SUPABASE_SECRET_KEY=...
   export ROADSAFE_ADMIN_EMAIL=you@roadsafe.co.za
   export ROADSAFE_ADMIN_PASSWORD='a-long-unique-password'
   npm run bootstrap:admin
   unset SUPABASE_SECRET_KEY ROADSAFE_ADMIN_PASSWORD
   ```

9. Sign in, create the first client, provision `RSR-0001`, assign it to that client/site, and copy the one-time activation token. Continue with [the Pi pilot runbook](docs/pi-pilot.md).

## Email credentials

The mailbox password is intentionally not embedded in either the portal or Pi code. Brevo authenticates with a revocable server-side API key and sends as the verified `radar@roadsafe.co.za` address. This removes email credentials from field hardware and allows key rotation without visiting a radar.

## Operational documentation

- [Pi pilot and rollback](docs/pi-pilot.md)
- [Production operations](docs/operations.md)
- [Security and tenancy](docs/security.md)

