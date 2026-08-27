-- Historical delivery logs can contain message text and one-time bearer URLs.
-- Delivery status is the only operational field the app uses.
UPDATE "message_log"
SET "body" = '[content omitted]'
WHERE "body" <> '[content omitted]';
