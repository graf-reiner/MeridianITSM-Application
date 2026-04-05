-- Add FK relations for businessOwnerId and technicalOwnerId to users table

ALTER TABLE "cmdb_configuration_items" ADD CONSTRAINT "cmdb_ci_businessOwnerId_fkey"
  FOREIGN KEY ("businessOwnerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "cmdb_configuration_items" ADD CONSTRAINT "cmdb_ci_technicalOwnerId_fkey"
  FOREIGN KEY ("technicalOwnerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
