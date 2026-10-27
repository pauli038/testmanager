-- Videos and traces uploaded by the Playwright reporter are no longer kept
-- (POST /api/ingest/attachments was removed). Delete the ones already stored;
-- screenshots (images) of automated runs and all manual/defect evidence stay.
DELETE FROM "attachments"
WHERE "mime_type" NOT LIKE 'image/%'
  AND "run_case_id" IN (
    SELECT rc."id"
    FROM "test_run_cases" rc
    JOIN "test_runs" r ON r."id" = rc."run_id"
    WHERE r."source" = 'playwright'
  );
