CREATE TABLE IF NOT EXISTS "AssessmentCycle" (
  "id" TEXT PRIMARY KEY, "studentId" TEXT NOT NULL, "type" TEXT NOT NULL DEFAULT 'INITIAL',
  "sequence" INTEGER NOT NULL DEFAULT 0, "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "deadlineAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3), "stageStatuses" JSONB NOT NULL, "anamnesis" JSONB,
  "bodyAssessment" JSONB, "strengthTest" JSONB, "enduranceTest" JSONB, "healthConsentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE IF NOT EXISTS "AssessmentPhoto" (
  "id" TEXT PRIMARY KEY, "cycleId" TEXT NOT NULL, "view" TEXT NOT NULL, "storageKey" TEXT NOT NULL,
  "originalName" TEXT NOT NULL, "mimeType" TEXT NOT NULL, "size" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE IF NOT EXISTS "AssessmentVideo" (
  "id" TEXT PRIMARY KEY, "stage" TEXT NOT NULL, "youtubeUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "AssessmentCycle_studentId_sequence_key" ON "AssessmentCycle"("studentId", "sequence");
CREATE INDEX IF NOT EXISTS "AssessmentCycle_studentId_createdAt_idx" ON "AssessmentCycle"("studentId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "AssessmentPhoto_storageKey_key" ON "AssessmentPhoto"("storageKey");
CREATE UNIQUE INDEX IF NOT EXISTS "AssessmentPhoto_cycleId_view_key" ON "AssessmentPhoto"("cycleId", "view");
CREATE UNIQUE INDEX IF NOT EXISTS "AssessmentVideo_stage_key" ON "AssessmentVideo"("stage");
DO $$ BEGIN
  ALTER TABLE "AssessmentCycle" ADD CONSTRAINT "AssessmentCycle_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "assessmentIntroSeenAt" TIMESTAMP(3);
DO $$ BEGIN
  ALTER TABLE "AssessmentPhoto" ADD CONSTRAINT "AssessmentPhoto_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AssessmentCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
