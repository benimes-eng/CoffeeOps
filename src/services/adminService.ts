import { supabase } from "@/integrations/supabase/client";

export type PlatformUser = {
  user_id: string;
  name: string;
  email: string;
  is_approved: boolean;
  is_super_admin: boolean;
  organization_id: string;
  org_name: string;
  roles: string[];
  created_at: string;
};

export type PlatformTenantOrg = {
  id: string;
  name: string;
  slug?: string;
  subscription_status: "active" | "past_due" | "suspended";
  monthly_rate: number;
  next_billing_date?: string;
  created_at?: string;
  user_count?: number;
};

export type PlatformAuditLog = {
  id: string;
  user_id: string;
  user_name: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

async function callManageUsersFunction(action: string, payload: Record<string, unknown> = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("UNAUTHORIZED: Active authenticated session required");
  }

  const res = await supabase.functions.invoke("manage-users", {
    body: { action, ...payload },
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (res.error) {
    throw new Error(res.error.message || "Failed to execute administrative operation");
  }

  const responseData = res.data;
  if (responseData?.error) {
    throw new Error(responseData.error);
  }

  return responseData;
}

/**
 * Super Admin: Fetch all platform users across organizations via server-authorized query.
 */
export async function getAllPlatformUsers(): Promise<PlatformUser[]> {
  try {
    const result = await callManageUsersFunction("list_users");
    if (result?.users) {
      return result.users as PlatformUser[];
    }
  } catch {
    // Fallback to direct client query if caller is super admin with appropriate RLS permissions
  }

  const { data: profiles, error: pErr } = await supabase
    .from("profiles")
    .select("user_id, name, email, is_approved, is_super_admin, organization_id, created_at");

  if (pErr) throw new Error(pErr.message);

  const { data: roles } = await supabase.from("user_roles").select("user_id, role");
  const { data: orgs } = await supabase.from("organizations").select("id, name");

  const orgMap = new Map((orgs || []).map((o) => [o.id, o.name]));
  const roleMap = new Map<string, string[]>();
  roles?.forEach((r) => {
    if (!roleMap.has(r.user_id)) roleMap.set(r.user_id, []);
    roleMap.get(r.user_id)!.push(r.role);
  });

  return (profiles || []).map((p) => ({
    user_id: p.user_id,
    name: p.name,
    email: p.email || "",
    is_approved: p.is_approved,
    is_super_admin: p.is_super_admin,
    organization_id: p.organization_id,
    org_name: orgMap.get(p.organization_id) || "Coffee Farm",
    roles: roleMap.get(p.user_id) || ["worker"],
    created_at: p.created_at,
  }));
}

/**
 * Super Admin: Fetch all tenant organizations with subscription status and live user counts.
 */
export async function getAllPlatformOrgs(): Promise<PlatformTenantOrg[]> {
  const { data: orgs, error: oErr } = await supabase
    .from("organizations")
    .select("id, name, slug, subscription_status, monthly_rate, next_billing_date, created_at");

  if (oErr) throw new Error(oErr.message);

  // Calculate live user counts per organization
  const { data: profiles } = await supabase.from("profiles").select("organization_id");
  const counts: Record<string, number> = {};
  profiles?.forEach((p) => {
    if (p.organization_id) {
      counts[p.organization_id] = (counts[p.organization_id] || 0) + 1;
    }
  });

  return (orgs || []).map((o) => ({
    id: o.id,
    name: o.name,
    slug: o.slug || undefined,
    subscription_status: (o.subscription_status as "active" | "past_due" | "suspended") || "active",
    monthly_rate: Number(o.monthly_rate) || 5000,
    next_billing_date: o.next_billing_date || undefined,
    created_at: o.created_at || undefined,
    user_count: counts[o.id] || 0,
  }));
}

/**
 * Super Admin: Fetch platform audit logs.
 */
export async function getAllPlatformAuditLogs(): Promise<PlatformAuditLog[]> {
  const { data: logs, error } = await supabase
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw new Error(error.message);

  const userIds = [...new Set((logs || []).map((l) => l.user_id))];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, name")
    .in("user_id", userIds);

  const profileMap = new Map((profiles || []).map((p) => [p.user_id, p.name]));

  return (logs || []).map((l) => ({
    id: l.id,
    user_id: l.user_id,
    user_name: profileMap.get(l.user_id) || "System Operator",
    action: l.action,
    entity_type: l.entity_type,
    entity_id: l.entity_id,
    details: (l.details as Record<string, unknown>) || null,
    created_at: l.created_at,
  }));
}

/**
 * Authoritative: Approve a user account via manage-users Edge Function.
 */
export async function approvePlatformUser(userId: string): Promise<void> {
  await callManageUsersFunction("approve", { userId });
}

/**
 * Authoritative: Reject and permanently remove a user account.
 */
export async function rejectPlatformUser(userId: string): Promise<void> {
  await callManageUsersFunction("delete", { userId });
}

/**
 * Authoritative: Suspend or reactivate an individual user account.
 */
export async function suspendPlatformUser(userId: string, suspend = true): Promise<void> {
  await callManageUsersFunction("suspend", { userId, suspend });
}

/**
 * Super Admin: Update tenant organization monthly SaaS subscription status.
 */
export async function updateOrgSubscriptionStatus(
  orgId: string,
  status: "active" | "past_due" | "suspended"
): Promise<void> {
  await callManageUsersFunction("update_subscription", { orgId, status });
}

/**
 * Server-authoritative lookup for currently logged-in user profile, approval, and subscription state.
 */
export async function getAuthoritativeUserProfile(userId: string): Promise<{
  is_approved: boolean;
  is_super_admin: boolean;
  subscription_status: "active" | "past_due" | "suspended";
  organization_id: string;
  org_name: string;
  roles: string[];
} | null> {
  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select("organization_id, is_approved, is_super_admin, name, organizations(name, subscription_status)")
    .eq("user_id", userId)
    .maybeSingle();

  if (pErr || !profile) return null;

  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  const orgData = profile.organizations as unknown as { name?: string; subscription_status?: string } | null;
  const subStatus = (orgData?.subscription_status as "active" | "past_due" | "suspended") || "active";

  return {
    is_approved: profile.is_approved === true,
    is_super_admin: profile.is_super_admin === true,
    subscription_status: subStatus,
    organization_id: profile.organization_id,
    org_name: orgData?.name || "Coffee Farm",
    roles: (roles || []).map((r) => r.role),
  };
}
