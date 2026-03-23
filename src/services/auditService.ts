import { supabase } from "@/integrations/supabase/client";

export type AuditAction =
  | "create" | "update" | "delete"
  | "approve_user" | "reject_user" | "suspend_user"
  | "assign_role" | "remove_role"
  | "mark_complete" | "start_grinding" | "complete_grinding"
  | "create_shipment" | "confirm_shipment"
  | "merge_lots";

export type EntityType =
  | "site" | "block" | "bed" | "lot" | "worker"
  | "user" | "bed_assignment" | "grinding_batch"
  | "shipment" | "inventory_item" | "payroll";

export async function logAudit(
  action: AuditAction,
  entityType: EntityType,
  entityId?: string,
  details?: Record<string, unknown>
) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("user_id", user.id)
      .single();

    if (!profile) return;

    await (supabase.from("audit_logs") as any).insert({
      user_id: user.id,
      organization_id: profile.organization_id,
      action,
      entity_type: entityType,
      entity_id: entityId ?? null,
      details: details ?? {},
    });
  } catch (e) {
    console.error("Audit log failed:", e);
  }
}
