-- Preserve the existing library order only when the column is first added.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'Video' AND column_name = 'sortOrder') THEN
    ALTER TABLE "Video" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
    WITH ordered AS (
      SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt" DESC, "title" ASC, "id" ASC) AS position FROM "Video"
    )
    UPDATE "Video" SET "sortOrder" = ordered.position FROM ordered WHERE "Video"."id" = ordered."id";
  END IF;
END $$;
