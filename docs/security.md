# Security and tenancy

## Trust boundaries

- Browser sessions use Supabase Auth and only the publishable key.
- All tenant reads pass through Postgres RLS. The pgTAP suite proves that one tenant cannot read another tenant's events, devices, organisations, or photo paths.
- RoadSafe write workflows execute server-side after checking the authenticated profile's platform role.
- Device APIs use independent random credentials stored only as peppered SHA-256 hashes. One-time activation tokens expire after 24 hours and are consumed atomically.
- Radar photos and release bundles use private Storage buckets and short-lived signed URLs.
- The Pi makes outbound HTTPS requests only. Operational commands are polled, audited, allow-listed, and have expiries.

## Secrets

Never prefix server values with `NEXT_PUBLIC_`. Vercel holds the Supabase secret key, device pepper, cron/internal job secrets, OCR token, Brevo key, webhook secret, and release public key. Supabase Edge Function secrets hold only the values needed by those functions. A Pi holds only its own credential and camera URL.

The release private key remains offline. Mailbox passwords are not used by radar software; Brevo's API key is revocable and server-side.

If any real secret is pasted into chat, a ticket, a log, or source code, rotate it. Do not rely on later deletion as proof it was never copied.

## Data protection

Vehicle photographs and plate data are sensitive operational records. Customer agreements should define purpose, retention, authorised viewers, incident handling, and export rules. The implementation enforces a 90-day detailed-record window and private tenant access, but RoadSafe remains responsible for applicable South African privacy and road-enforcement requirements.

Before production, arrange an independent security review, enable MFA for RoadSafe administrators when supported by the chosen Auth flow, enforce least-privilege staff access, enable platform audit/log retention, and test both tenant isolation and restore procedures after every material schema change.

