ALTER TABLE "Notification" ADD COLUMN "key" TEXT;
ALTER TABLE "Notification" ADD COLUMN "actionUrl" TEXT;

CREATE UNIQUE INDEX "Notification_key_key" ON "Notification"("key");
