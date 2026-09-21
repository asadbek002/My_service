-- Add index for staff activity lookup (Variant B: order history counts as activity)
CREATE INDEX IF NOT EXISTS "OrderHistory_organizationId_actorId_createdAt_idx"
ON "OrderHistory" ("organizationId", "actorId", "createdAt");
