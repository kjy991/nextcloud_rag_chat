-- AlterTable: add updated_at with default NOW() for existing rows
ALTER TABLE "documents"
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT NOW();

-- Remove the default so future inserts are managed by Prisma @updatedAt
ALTER TABLE "documents" ALTER COLUMN "updated_at" DROP DEFAULT;
