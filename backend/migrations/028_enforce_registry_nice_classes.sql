-- Normalize legacy USPTO classification codes to the Nice Classification range
-- used by the application risk/search contract, then enforce the invariant for
-- every future registry write.
SET LOCAL statement_timeout = '15min';

UPDATE registry_trademarks AS trademark
SET nice_classes = COALESCE(
      (
        SELECT array_agg(valid_class ORDER BY valid_class)
        FROM (
          SELECT DISTINCT class_code AS valid_class
          FROM unnest(trademark.nice_classes) AS class_code
          WHERE class_code BETWEEN 1 AND 45
        ) AS normalized
      ),
      ARRAY[]::integer[]
    ),
    updated_at = now()
WHERE NOT (
  trademark.nice_classes <@ ARRAY[
    1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,
    26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45
  ]::integer[]
);

ALTER TABLE registry_trademarks
  DROP CONSTRAINT IF EXISTS registry_trademarks_nice_classes_valid;

ALTER TABLE registry_trademarks
  ADD CONSTRAINT registry_trademarks_nice_classes_valid
  CHECK (
    nice_classes <@ ARRAY[
      1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,
      26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45
    ]::integer[]
  ) NOT VALID;

ALTER TABLE registry_trademarks
  VALIDATE CONSTRAINT registry_trademarks_nice_classes_valid;
