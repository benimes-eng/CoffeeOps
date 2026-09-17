-- Foreign-key indexes keep tenant-scoped joins and parent-row updates fast as
-- operational data grows. Index each current public FK that has no dedicated
-- supporting index.
DO $$
DECLARE
  fk record;
  column_list text;
BEGIN
  FOR fk IN
    SELECT c.conname, c.conrelid, n.nspname AS schema_name, t.relname AS table_name, c.conkey
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.contype = 'f'
      AND n.nspname = 'public'
  LOOP
    SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY key.ordinality)
    INTO column_list
    FROM unnest(fk.conkey) WITH ORDINALITY AS key(attnum, ordinality)
    JOIN pg_attribute a ON a.attrelid = fk.conrelid AND a.attnum = key.attnum;

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %I.%I (%s)',
      'idx_fk_' || fk.conname,
      fk.schema_name,
      fk.table_name,
      column_list
    );
  END LOOP;
END;
$$;
