-- Vanity FQDN per tenant. Used to render ticket dashboard/portal URLs
-- in emails. Falls back to subdomain.MERIDIAN_ROOT_DOMAIN, then APP_URL.
ALTER TABLE "tenants" ADD COLUMN "customDomain" TEXT;
CREATE UNIQUE INDEX "tenants_customDomain_key" ON "tenants"("customDomain");
