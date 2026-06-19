CREATE UNIQUE INDEX "endpoint_active_identity_unique"
ON "endpoint" ("apicHostId", "mac", "ip")
WHERE "isActive" = true;
