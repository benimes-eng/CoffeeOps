import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "./auditService";

async function callManageUsers(action: string, payload: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Authentication required");

  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ action, ...payload }),
  });

  const result = await res.json();
  if (!res.ok) {
    throw new Error(result.error || `Failed to ${action} user`);
  }
  return result;
}

export async function approveUser(userId: string) {
  const result = await callManageUsers("approve", { userId });
  await logAudit("approve_user", "user", userId);
  return result;
}

export async function suspendUser(userId: string) {
  const result = await callManageUsers("suspend", { userId, suspend: true });
  await logAudit("suspend_user", "user", userId);
  return result;
}

export async function removeUser(userId: string) {
  const result = await callManageUsers("delete", { userId });
  await logAudit("reject_user", "user", userId);
  return result;
}

