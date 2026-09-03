ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "packageType" TEXT NOT NULL DEFAULT 'QUARTERLY';
ALTER TABLE "AssessmentCycle" ADD COLUMN IF NOT EXISTS "pointsAwarded" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WeeklyTracking" ADD COLUMN IF NOT EXISTS "trainingNumber" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "WeeklyTracking" ADD COLUMN IF NOT EXISTS "programWorkoutId" TEXT;

CREATE TABLE IF NOT EXISTS "ProgramWorkout" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "trainingNumber" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "pointsAwarded" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProgramWorkout_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProgramWorkout_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "ProgramWorkout_studentId_trainingNumber_key" ON "ProgramWorkout"("studentId", "trainingNumber");
CREATE INDEX IF NOT EXISTS "ProgramWorkout_studentId_idx" ON "ProgramWorkout"("studentId");

DROP INDEX IF EXISTS "WeeklyTracking_studentId_weekNumber_key";
CREATE UNIQUE INDEX IF NOT EXISTS "WeeklyTracking_studentId_trainingNumber_weekNumber_key" ON "WeeklyTracking"("studentId", "trainingNumber", "weekNumber");
CREATE INDEX IF NOT EXISTS "WeeklyTracking_programWorkoutId_idx" ON "WeeklyTracking"("programWorkoutId");
DO $$ BEGIN
  ALTER TABLE "WeeklyTracking" ADD CONSTRAINT "WeeklyTracking_programWorkoutId_fkey" FOREIGN KEY ("programWorkoutId") REFERENCES "ProgramWorkout"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "Ebook" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "storageKey" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Ebook_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Ebook_storageKey_key" ON "Ebook"("storageKey");
