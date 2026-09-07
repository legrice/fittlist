# FittList deployment and recovery

This runbook separates repeatable repository checks from evidence that must be obtained from the hosting, database, and delivery providers. Do not treat a successful local restore as proof that production backups exist.

## Before a release

1. Record the release commit, Vercel deployment URL, previous healthy deployment, and iOS version/build if the native shell changes. Keep the previous working deployment available.
2. Run the release checks in `package.json`, including type checking, production build, browser regressions, and the isolated operations checks below. Use a dedicated temporary `PGLITE_DATA_DIR`; do not reset the developer's `.data/pglite` directory.
3. Review new SQL in `drizzle/` against the previous release. Migrations currently run on the first database connection. A code rollback does **not** reverse those migrations. Identify destructive changes, long table locks, and incompatibilities with the old release before deployment.
4. Obtain database recovery evidence before applying a migration that changes or removes data. Prefer an isolated branch or restored database for the rehearsal. Never rehearse by overwriting the production database.
5. In the deployment settings, verify required variable names and scope without copying their values into logs: `DATABASE_URL`, `SESSION_SECRET`, `NEXT_PUBLIC_ORIGIN`, email delivery variables, `CRON_SECRET`, and any configured Blob, OAuth, or push credentials. Production must not enable `ALLOW_EMBEDDED_DB_IN_PRODUCTION` or `ALLOW_INSECURE_DEV_SECRET`.
6. Confirm that an iOS release resolves to the intended deployment and authentication callback origin. A Vercel rollback does not change an already installed native bundle or its embedded configuration.

`SESSION_SECRET` also derives the encryption key for stored Google refresh tokens. Rotating it invalidates existing sessions and makes tokens encrypted with the previous key unreadable. Plan token re-encryption or Google reconnection as part of rotation, and retain the appropriate secret version securely for the recovery window; never copy it into a backup checklist or audit log.

## Repeatable isolated checks

Run these in order from the repository root:

```bash
node --import tsx scripts/operations-audit-check.ts notifications
node --import tsx scripts/operations-audit-check.ts security
node --import tsx scripts/operations-audit-check.ts recovery
```

The script constructs an in-memory PGlite database, applies the actual SQL migrations, supplies synthetic accounts, and rejects unexpected network requests. Email responses and PostgreSQL connection failures are simulated. It does not read or mutate production data, deliver email/push, or contact the database provider.

The recovery stage applies every migration twice to check idempotence, creates an account/class/save relationship, calls PGlite `dumpDataDir()`, changes only the disposable source database, and restores the dump into a second in-memory database with `loadDataDir`. It checks restored values, relationships, migration history, migration replay, transaction rollback, and failed PostgreSQL pool cleanup. It validates this local snapshot format; it is not a Neon/PostgreSQL point-in-time recovery test.

## Production backup evidence to obtain

Record the following in the team's private operations record, with no credentials or personal data:

- Database provider/project/branch, enabled backup or point-in-time recovery capability, retention window, and timestamp of the latest recoverable state.
- Recovery point objective (maximum acceptable data loss) and recovery time objective (maximum acceptable outage), with an assigned operator.
- Date and measured duration of a restore into an isolated database. Verify representative account, membership, class, attendance, and migration counts; spot-check foreign keys and read/write behavior against the restored copy.
- Blob/file storage recovery and retention policy. Database backups contain image references, not a backup of image bytes. Check that restored references resolve and clarify how account deletion is handled in retained backups.
- Credential access for the recovery operator, a safe way to select the restored database in a staging deployment, and a reviewed production cutover procedure.

Production backup configuration, provider retention, and a live provider restore have not been established by the repository tests.

## Incident and rollback procedure

1. Record the failing deployment and symptoms. Check provider health, error logs, database connections, and external delivery failures; avoid logging tokens or message content.
2. If the prior application version is compatible with the current schema, restore the previously healthy Vercel deployment through the normal project controls. Verify authentication, calendar reads, a synthetic save/edit, and notifications. Do not run inverse SQL merely because code was rolled back.
3. If schema/data recovery is required, restore to a separate database first. Determine how writes since the recovery point will be preserved or reconciled, and obtain the required incident approval before a production cutover that could discard data.
4. Test OAuth callback origins and the installed native app after changing a deployment or origin. Confirm new sessions and existing sessions behave correctly.
5. Watch error rates, latency, and connection counts after recovery. Re-enable paused background jobs only after checking whether they can replay side effects.

## Delivery and monitoring gaps

- Weekly digests currently have no durable per-recipient/week delivery key. Re-running a job can send duplicates. Add an outbox with a stable delivery key and provider idempotency support before relying on automatic job retries.
- Shift reminders check for an existing notification before inserting. Concurrent jobs can pass the check together. Email failures after the notification is recorded are not retried. Track notification creation and email/push delivery independently in a durable job/outbox record.
- Browser push subscription registration is restricted to site admins. Coach reminder callers do not by themselves provision coach devices, and native APNs delivery has not been implemented or verified by these checks.
- Account deletion performs reference-aware Blob cleanup after the relational transaction. A provider failure is logged but has no durable cleanup queue; add retryable cleanup jobs and retention monitoring.
- Vercel Speed Insights is present. Repository checks do not establish a production error-alerting service, alert owners, traffic thresholds, or a measured recovery objective. Verify these operational controls with the provider/team.
- `.github/workflows/quality.yml` runs the maintained build, data, operations, and browser checks on pushes and pull requests. Repository branch protection, required status checks, and deployment gates still require separate verification.
