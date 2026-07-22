# Production operations

## Normal workflow

RoadSafe staff create a client organisation, invite one or more `client_admin` or `client_viewer` users, provision a radar, and create a dated assignment with its site and speed limit. The Pi polls configuration every five minutes, so a new limit does not require SSH. A `Sync config` command makes it immediate.

Clients can view only their organisation's current/historical events and devices selected by row-level security. Client administrators may maintain alert recipients. Client viewers are read-only. Only RoadSafe administrators can provision, assign, command, or update hardware.

## Health thresholds

- Online: heartbeat seen within three minutes.
- Heartbeat interval: 60 seconds.
- Command poll: 15 seconds.
- Configuration refresh: five minutes.
- Local photos: removed seven days after confirmed cloud upload.
- Cloud evidence: removed after 90 days; daily aggregate rows remain.
- Pi photograph capture stops at 95% disk usage while metadata continues to queue.

Investigate a non-zero queue that keeps growing, camera/radar disconnected state, CPU temperature above the Pi's normal operating range, disk usage above 80%, repeated OCR failures, or bounced mail. Tailscale/SSH is the recovery channel, not the daily control path.

## Release workflow

1. Update `device/VERSION` and run the full test suite.
2. Build with the offline key:

   ```bash
   python3 device/build_release.py 0.1.1 \
     --private-key ~/.roadsafe/keys/release-private.pem \
     --output dist
   ```

3. Upload the `.tar.gz` and matching `.json` on the Deployments page.
4. Start with one canary radar and observe it through the health window.
5. The Pi verifies both Ed25519 signature and SHA-256 digest, switches the `current` symlink atomically, and restarts both services.
6. If health is not reported within 120 seconds, the updater restores the previous release and reports `rolled_back`.

Never place the private release key in the repository, Vercel, Supabase, or on a Pi.

## Backups and recovery

Enable Supabase point-in-time recovery appropriate to the commercial service level. Periodically test restoring the database and private Storage metadata. The 90-day retention job is destructive by design, so client contracts and incident holds must be handled before changing its window.

For a lost or stolen device, revoke it in the database/admin workflow, rotate its active credential, and remove it from the client's assignment. Private photos still require a short-lived signed URL and tenant membership.

## Alert processing

Vercel invokes `/api/jobs/process-events` once per minute with `CRON_SECRET`. That endpoint calls the protected Supabase Edge Function with `INTERNAL_JOB_SECRET`. Queue messages are retried after transient OCR, Brevo, or network failures. The Brevo webhook updates `sent` events to `delivered`, `bounced`, or `failed`.

Monitor Vercel cron/function failures, Supabase Edge Function logs, queue depth, Plate Recognizer usage, Brevo quota/reputation, and bounce rate. Rotate API keys immediately after staff departures or suspected exposure.

