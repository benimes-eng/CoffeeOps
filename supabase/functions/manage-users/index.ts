import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      return errorResponse("Server configuration error", 500);
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. Verify caller from Bearer token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return errorResponse("UNAUTHORIZED: Bearer token required", 401);
    }

    const token = authHeader.replace("Bearer ", "").trim();
    const { data: { user: caller }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !caller) {
      return errorResponse("UNAUTHORIZED: Invalid or expired session", 401);
    }

    // 2. Fetch caller profile and permissions
    const { data: callerProfile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("organization_id, is_super_admin, is_approved, name")
      .eq("user_id", caller.id)
      .single();

    if (profileErr || !callerProfile) {
      return errorResponse("FORBIDDEN: Caller profile not found", 403);
    }

    const isSuperAdmin = callerProfile.is_super_admin === true;
    const isApproved = callerProfile.is_approved === true;
    const callerOrgId = callerProfile.organization_id;

    if (!isSuperAdmin && !isApproved) {
      return errorResponse("FORBIDDEN: Caller account is not approved", 403);
    }

    // Check if caller is an owner of their organization
    let isOwner = false;
    if (callerOrgId) {
      const { data: ownerRole } = await supabaseAdmin
        .from("user_roles")
        .select("id")
        .eq("user_id", caller.id)
        .eq("role", "owner")
        .eq("organization_id", callerOrgId)
        .maybeSingle();

      isOwner = !!ownerRole;
    }

    if (!isSuperAdmin && !isOwner) {
      return errorResponse("FORBIDDEN: Only farm owners or platform super administrators can manage users", 403);
    }

    // 3. Parse and dispatch action
    const body = await req.json().catch(() => ({}));
    const { action } = body;

    if (!action || typeof action !== "string") {
      return errorResponse("INVALID_ACTION: 'action' parameter is required");
    }

    // Helper: log privileged action to audit_logs
    async function logAudit(actionName: string, entityType: string, entityId: string, details?: Record<string, unknown>) {
      try {
        await supabaseAdmin.from("audit_logs").insert({
          user_id: caller.id,
          organization_id: callerOrgId || "00000000-0000-0000-0000-000000000000",
          action: actionName,
          entity_type: entityType,
          entity_id: entityId,
          details: details || {},
        });
      } catch (e) {
        console.error("Failed to write audit log:", e);
      }
    }

    // --- ACTION: CREATE ---
    if (action === "create") {
      const { email, name, role = "worker", password, organizationId } = body;

      if (!email || typeof email !== "string" || !email.includes("@")) {
        return errorResponse("VALIDATION_ERROR: Valid email address is required");
      }

      // Target org determination
      let targetOrgId = callerOrgId;
      if (isSuperAdmin && organizationId) {
        targetOrgId = organizationId;
      }

      if (!targetOrgId) {
        return errorResponse("VALIDATION_ERROR: Target organization is required");
      }

      const cleanEmail = email.trim().toLowerCase();
      const cleanName = (name && typeof name === "string") ? name.trim() : cleanEmail.split("@")[0];
      const validRoles = ["owner", "manager", "supervisor", "worker", "addis_warehouse"];
      const targetRole = validRoles.includes(role) ? role : "worker";

      // Non-super-admins cannot create super_admins or assign cross-tenant
      if (targetRole === "super_admin" && !isSuperAdmin) {
        return errorResponse("FORBIDDEN: Cannot grant super administrator role");
      }

      const generatedPassword = (password && typeof password === "string" && password.length >= 8)
        ? password
        : Math.random().toString(36).slice(-10) + "A1!#";

      const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: cleanEmail,
        password: generatedPassword,
        email_confirm: true,
        user_metadata: { name: cleanName, organization_id: targetOrgId, role: targetRole },
      });

      if (createErr) {
        return errorResponse(createErr.message, 400);
      }

      // Ensure profile is created/updated
      await supabaseAdmin.from("profiles").upsert({
        user_id: newUser.user.id,
        name: cleanName,
        email: cleanEmail,
        organization_id: targetOrgId,
        is_approved: isSuperAdmin, // Auto-approved if created by super admin; pending if created by owner
        is_super_admin: false,
      }, { onConflict: "user_id" });

      // Ensure role is recorded
      await supabaseAdmin.from("user_roles").upsert({
        user_id: newUser.user.id,
        role: targetRole,
        organization_id: targetOrgId,
      }, { onConflict: "user_id,role" });

      await logAudit("create", "user", newUser.user.id, {
        email: cleanEmail,
        role: targetRole,
        organization_id: targetOrgId,
      });

      return jsonResponse({
        success: true,
        user: { id: newUser.user.id, email: newUser.user.email, name: cleanName, role: targetRole },
      });
    }

    // --- ACTION: DELETE ---
    if (action === "delete") {
      const { userId } = body;
      if (!userId || typeof userId !== "string") {
        return errorResponse("VALIDATION_ERROR: 'userId' is required");
      }

      if (userId === caller.id) {
        return errorResponse("FORBIDDEN: You cannot delete your own account");
      }

      // Verify target user belongs to same org unless caller is super admin
      const { data: targetProfile } = await supabaseAdmin
        .from("profiles")
        .select("organization_id, email, name, is_super_admin")
        .eq("user_id", userId)
        .single();

      if (!targetProfile) {
        return errorResponse("NOT_FOUND: Target user not found", 404);
      }

      if (targetProfile.is_super_admin && !isSuperAdmin) {
        return errorResponse("FORBIDDEN: Cannot delete a platform administrator", 403);
      }

      if (!isSuperAdmin && targetProfile.organization_id !== callerOrgId) {
        return errorResponse("FORBIDDEN: User does not belong to your organization", 403);
      }

      // Clean up roles and profile first
      await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
      await supabaseAdmin.from("profiles").delete().eq("user_id", userId);

      const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (delErr) {
        return errorResponse(delErr.message, 400);
      }

      await logAudit("delete", "user", userId, { email: targetProfile.email });

      return jsonResponse({ success: true, message: "User deleted successfully" });
    }

    // --- ACTION: APPROVE ---
    if (action === "approve") {
      const { userId } = body;
      if (!userId || typeof userId !== "string") {
        return errorResponse("VALIDATION_ERROR: 'userId' is required");
      }

      const { data: targetProfile } = await supabaseAdmin
        .from("profiles")
        .select("organization_id, email, name")
        .eq("user_id", userId)
        .single();

      if (!targetProfile) {
        return errorResponse("NOT_FOUND: User profile not found", 404);
      }

      if (!isSuperAdmin && targetProfile.organization_id !== callerOrgId) {
        return errorResponse("FORBIDDEN: User does not belong to your organization", 403);
      }

      const { error: updErr } = await supabaseAdmin
        .from("profiles")
        .update({ is_approved: true })
        .eq("user_id", userId);

      if (updErr) {
        return errorResponse(updErr.message, 400);
      }

      await logAudit("approve_user", "user", userId, { email: targetProfile.email });

      return jsonResponse({ success: true, message: "User approved successfully" });
    }

    // --- ACTION: SUSPEND / UNSUSPEND ---
    if (action === "suspend") {
      const { userId, suspend = true } = body;
      if (!userId || typeof userId !== "string") {
        return errorResponse("VALIDATION_ERROR: 'userId' is required");
      }

      if (userId === caller.id) {
        return errorResponse("FORBIDDEN: You cannot suspend your own account");
      }

      const { data: targetProfile } = await supabaseAdmin
        .from("profiles")
        .select("organization_id, email, name, is_super_admin")
        .eq("user_id", userId)
        .single();

      if (!targetProfile) {
        return errorResponse("NOT_FOUND: User profile not found", 404);
      }

      if (targetProfile.is_super_admin) {
        return errorResponse("FORBIDDEN: Cannot suspend a platform administrator", 403);
      }

      if (!isSuperAdmin && targetProfile.organization_id !== callerOrgId) {
        return errorResponse("FORBIDDEN: User does not belong to your organization", 403);
      }

      const isApprovedValue = !suspend;
      const { error: updErr } = await supabaseAdmin
        .from("profiles")
        .update({ is_approved: isApprovedValue })
        .eq("user_id", userId);

      if (updErr) {
        return errorResponse(updErr.message, 400);
      }

      await logAudit(suspend ? "suspend_user" : "approve_user", "user", userId, { email: targetProfile.email });

      return jsonResponse({
        success: true,
        message: suspend ? "User account suspended" : "User account reactivated",
      });
    }

    // --- ACTION: ASSIGN_ROLE ---
    if (action === "assign_role") {
      const { userId, role } = body;
      if (!userId || typeof userId !== "string") {
        return errorResponse("VALIDATION_ERROR: 'userId' is required");
      }

      const validRoles = ["owner", "manager", "supervisor", "worker", "addis_warehouse"];
      if (!validRoles.includes(role)) {
        return errorResponse("VALIDATION_ERROR: Invalid role specified");
      }

      const { data: targetProfile } = await supabaseAdmin
        .from("profiles")
        .select("organization_id, email, name")
        .eq("user_id", userId)
        .single();

      if (!targetProfile) {
        return errorResponse("NOT_FOUND: User profile not found", 404);
      }

      if (!isSuperAdmin && targetProfile.organization_id !== callerOrgId) {
        return errorResponse("FORBIDDEN: User does not belong to your organization", 403);
      }

      // Remove existing roles and insert new primary role
      await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
      const { error: insErr } = await supabaseAdmin.from("user_roles").insert({
        user_id: userId,
        role,
        organization_id: targetProfile.organization_id,
      });

      if (insErr) {
        return errorResponse(insErr.message, 400);
      }

      await logAudit("assign_role", "user", userId, { role, email: targetProfile.email });

      return jsonResponse({ success: true, message: `Role '${role}' assigned successfully` });
    }

    // --- ACTION: UPDATE_SUBSCRIPTION (SUPER ADMIN ONLY) ---
    if (action === "update_subscription") {
      if (!isSuperAdmin) {
        return errorResponse("FORBIDDEN: Only platform super administrators can manage tenant subscriptions", 403);
      }

      const { orgId, status } = body;
      if (!orgId || typeof orgId !== "string") {
        return errorResponse("VALIDATION_ERROR: 'orgId' is required");
      }

      if (!["active", "past_due", "suspended"].includes(status)) {
        return errorResponse("VALIDATION_ERROR: Invalid subscription status. Must be active, past_due, or suspended");
      }

      const { error: orgErr } = await supabaseAdmin
        .from("organizations")
        .update({ subscription_status: status })
        .eq("id", orgId);

      if (orgErr) {
        return errorResponse(orgErr.message, 400);
      }

      await logAudit(
        status === "suspended" ? "suspend_org" : "reactivate_org",
        "organization",
        orgId,
        { status }
      );

      return jsonResponse({ success: true, message: `Organization subscription set to '${status}'` });
    }

    // --- ACTION: LIST_USERS ---
    if (action === "list_users") {
      let query = supabaseAdmin
        .from("profiles")
        .select("user_id, name, email, is_approved, is_super_admin, organization_id, created_at");

      if (!isSuperAdmin) {
        query = query.eq("organization_id", callerOrgId);
      }

      const { data: profiles, error: pErr } = await query;
      if (pErr) return errorResponse(pErr.message, 400);

      const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id, role");
      const { data: orgs } = await supabaseAdmin.from("organizations").select("id, name");

      const orgMap = new Map((orgs || []).map((o: { id: string; name: string }) => [o.id, o.name]));
      const roleMap = new Map<string, string[]>();
      (roles || []).forEach((r: { user_id: string; role: string }) => {
        if (!roleMap.has(r.user_id)) roleMap.set(r.user_id, []);
        roleMap.get(r.user_id)!.push(r.role);
      });

      const users = (profiles || []).map((p: {
        user_id: string;
        name: string;
        email: string | null;
        is_approved: boolean;
        is_super_admin: boolean;
        organization_id: string;
        created_at: string;
      }) => ({
        user_id: p.user_id,
        name: p.name,
        email: p.email || "",
        is_approved: p.is_approved,
        is_super_admin: p.is_super_admin,
        organization_id: p.organization_id,
        org_name: orgMap.get(p.organization_id) || "Unknown Farm",
        roles: roleMap.get(p.user_id) || ["worker"],
        created_at: p.created_at,
      }));

      return jsonResponse({ success: true, users });
    }

    return errorResponse(`UNKNOWN_ACTION: Action '${action}' is not supported`);
  } catch (err: unknown) {
    console.error("Unhandled manage-users error:", err);
    return errorResponse("Internal server error", 500);
  }
});
