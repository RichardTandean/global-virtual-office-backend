-- AlterTable
ALTER TABLE "time_logs" ADD COLUMN "break_started_at" TIMESTAMP(3);
ALTER TABLE "time_logs" ADD COLUMN "break_minutes_total" INTEGER NOT NULL DEFAULT 0;
