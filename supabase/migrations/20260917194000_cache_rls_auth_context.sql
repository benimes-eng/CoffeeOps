-- PostgreSQL otherwise evaluates auth.uid() once per candidate row in each
-- policy. Rewriting only that stable function call as a scalar subquery lets
-- the planner cache it as an initplan. Policy command, role target, mode,
-- USING expression structure, and WITH CHECK semantics are left unchanged.
DO $$
DECLARE
  policy_record record;
  using_expression text;
  check_expression text;
BEGIN
  FOR policy_record IN
    SELECT p.polname, p.polrelid, n.nspname AS schema_name, c.relname AS table_name,
           pg_get_expr(p.polqual, p.polrelid) AS policy_using,
           pg_get_expr(p.polwithcheck, p.polrelid) AS policy_check
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND (coalesce(pg_get_expr(p.polqual, p.polrelid), '') LIKE '%auth.uid()%' OR
           coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') LIKE '%auth.uid()%')
  LOOP
    using_expression := replace(policy_record.policy_using, 'auth.uid()', '(select auth.uid())');
    check_expression := replace(policy_record.policy_check, 'auth.uid()', '(select auth.uid())');

    IF using_expression IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s)',
        policy_record.polname, policy_record.schema_name, policy_record.table_name, using_expression);
    END IF;

    IF check_expression IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I WITH CHECK (%s)',
        policy_record.polname, policy_record.schema_name, policy_record.table_name, check_expression);
    END IF;
  END LOOP;
END;
$$;
