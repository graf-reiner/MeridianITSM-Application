-- AlterTable
ALTER TABLE "email_accounts" ADD COLUMN "authProvider" TEXT NOT NULL DEFAULT 'MANUAL',
ADD COLUMN "oauthAccessTokenEnc" TEXT,
ADD COLUMN "oauthRefreshTokenEnc" TEXT,
ADD COLUMN "oauthTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN "oauthScope" TEXT,
ADD COLUMN "oauthConnectionStatus" TEXT;
