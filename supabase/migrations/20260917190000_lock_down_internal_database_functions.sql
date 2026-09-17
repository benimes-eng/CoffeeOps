-- Internal trigger and authorization helpers must never be exposed as public RPCs.
-- The two helpers still used by RLS policies are restricted to signed-in callers;
-- every trigger helper is executable only by the database owner/service role.

REVOKE ALL ON FUNCTION public.get_user_org_id(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_org_id(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_on_bed_event() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_audit_log_modification() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_profile_privileged_fields() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_on_bed_event() TO service_role;
GRANT EXECUTE ON FUNCTION public.prevent_audit_log_modification() TO service_role;
GRANT EXECUTE ON FUNCTION public.protect_profile_privileged_fields() TO service_role;
GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO service_role;

-- Helpers below are implementation details of the transactional functions and
-- are not called by the browser. Removing authenticated execution prevents
-- direct invocation while keeping SECURITY DEFINER workflows operational.
REVOKE ALL ON FUNCTION public.assert_active_tenant_actor(public.app_role[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.next_document_number(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_user_approved(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_org_subscription_active(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_active_user_org_id(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_active_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_any_active_role(uuid, public.app_role[]) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.assert_active_tenant_actor(public.app_role[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.next_document_number(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_user_approved(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_org_subscription_active(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_active_user_org_id(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_active_role(uuid, public.app_role) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_any_active_role(uuid, public.app_role[]) TO service_role;
