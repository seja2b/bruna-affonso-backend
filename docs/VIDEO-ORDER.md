# Video library ordering

`PUT /api/videos/order` requires an authenticated ADMIN and accepts `ids` (the complete desired order) and `previousIds` (the last loaded order). Rejects duplicates/unknown IDs and stale lists; updates all positions in one serializable transaction. The existing GET endpoint returns the same ordered list to administrators and students. New videos append to the end; editing does not move a video.

Deploy backend first. Generate Prisma Client from the updated schema during build. The existing startup SQL mechanism runs `ensure_video_order.sql` before starting the server. It adds `Video.sortOrder` and initializes it to the previous createdAt/title ordering only once. A matching migration is included for environments that use Prisma migrations. No video or URL is deleted or rewritten. Deploy the frontend only after the backend is healthy.

Validation: backend unit suite, Prisma schema validation, frontend production build, browser test covering drag/drop, reload, student display, mobile arrow controls, filtered-list guard and rollback after failed save. The migration has not been run against production as part of this branch.
