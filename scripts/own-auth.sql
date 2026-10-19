-- Vibradex own-auth schema change (generated with: prisma migrate diff
--   --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script)
-- Replaces the unused Replit User/Session tables with own-cookie-auth tables and adds RateLimit.
-- No other table is touched. Verified 2026-10-09: "User" = 0 rows, "Session" = 0 rows.
-- Apply ONCE, after review: Neon SQL editor, or with DATABASE_URL set in the shell:
--   npx prisma db execute --schema prisma/schema.prisma --file scripts/own-auth.sql
-- Runs in one transaction and aborts if either old table has gained rows since.
--
-- Rollback (tables hold only auth data; re-run admin:create afterwards if needed):
--   BEGIN; DROP TABLE "RateLimit"; DROP TABLE "Session";
--   ALTER TABLE "User" DROP COLUMN "name", DROP COLUMN "passwordHash",
--     ADD COLUMN "firstName" TEXT, ADD COLUMN "lastName" TEXT, ADD COLUMN "profileImageUrl" TEXT,
--     ALTER COLUMN "email" DROP NOT NULL;
--   CREATE TABLE "Session" ("sid" TEXT NOT NULL PRIMARY KEY, "sess" JSONB NOT NULL, "expire" TIMESTAMP(3) NOT NULL);
--   CREATE INDEX "Session_expire_idx" ON "Session"("expire"); COMMIT;
-- (or simply git-revert schema.prisma and run prisma db push, the repo's normal flow)

BEGIN;

DO $$
BEGIN
  IF (SELECT count(*) FROM "User") > 0 OR (SELECT count(*) FROM "Session") > 0 THEN
    RAISE EXCEPTION 'User/Session not empty: aborting own-auth migration';
  END IF;
END $$;

-- DropIndex
DROP INDEX "Session_expire_idx";

-- AlterTable
ALTER TABLE "Session" DROP CONSTRAINT "Session_pkey",
DROP COLUMN "expire",
DROP COLUMN "sess",
DROP COLUMN "sid",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "expiresAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "hashedToken" TEXT NOT NULL,
ADD COLUMN     "id" TEXT NOT NULL,
ADD COLUMN     "userId" TEXT NOT NULL,
ADD CONSTRAINT "Session_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "User" DROP COLUMN "firstName",
DROP COLUMN "lastName",
DROP COLUMN "profileImageUrl",
ADD COLUMN     "name" TEXT,
ADD COLUMN     "passwordHash" TEXT NOT NULL,
ALTER COLUMN "email" SET NOT NULL;

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "RateLimit_windowStart_idx" ON "RateLimit"("windowStart");

-- CreateIndex
CREATE UNIQUE INDEX "Session_hashedToken_key" ON "Session"("hashedToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
