-- CreateEnum
CREATE TYPE "CallRoomType" AS ENUM ('office', 'breakout', 'private');

-- CreateTable
CREATE TABLE "call_rooms" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CallRoomType" NOT NULL,
    "room_name" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "call_rooms_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "call_participants" (
    "id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMP(3),
    CONSTRAINT "call_participants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "call_room_invites" (
    "id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "invited_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "call_room_invites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "call_room_invites_room_id_user_id_key" ON "call_room_invites"("room_id", "user_id");

ALTER TABLE "call_rooms" ADD CONSTRAINT "call_rooms_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "call_participants" ADD CONSTRAINT "call_participants_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "call_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "call_participants" ADD CONSTRAINT "call_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "call_room_invites" ADD CONSTRAINT "call_room_invites_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "call_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "call_room_invites" ADD CONSTRAINT "call_room_invites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "call_room_invites" ADD CONSTRAINT "call_room_invites_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
