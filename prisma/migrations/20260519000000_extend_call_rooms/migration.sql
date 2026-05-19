-- AlterEnum
ALTER TYPE "CallRoomType" ADD VALUE 'direct';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'meeting_reminder';

-- AlterTable
ALTER TABLE "call_rooms" ADD COLUMN     "is_public" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "scheduled_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "calendar_events" ADD COLUMN     "call_room_id" TEXT;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_call_room_id_fkey" FOREIGN KEY ("call_room_id") REFERENCES "call_rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
