-- Drop legacy per-task timer table
DROP TABLE IF EXISTS "task_time_logs";

-- Create task status change audit log
CREATE TABLE "task_status_logs" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "from_status" "TaskStatus" NOT NULL,
    "to_status" "TaskStatus" NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_status_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "task_status_logs_task_id_created_at_idx" ON "task_status_logs"("task_id", "created_at");

ALTER TABLE "task_status_logs"
    ADD CONSTRAINT "task_status_logs_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "task_status_logs"
    ADD CONSTRAINT "task_status_logs_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
