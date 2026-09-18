import { supabase } from "@/integrations/supabase/client";
import { parseSupabaseError } from "@/lib/errors";

export async function deleteLot(lotId: string) {
  const { data, error } = await supabase.rpc("fn_delete_lot", {
    p_lot_id: lotId,
  });
  if (error) throw parseSupabaseError(error);
  return data;
}

export async function deleteShipment(shipmentId: string) {
  const { data, error } = await supabase.rpc("fn_delete_shipment", {
    p_shipment_id: shipmentId,
  });
  if (error) throw parseSupabaseError(error);
  return data;
}

export async function deleteGrindingBatch(batchId: string) {
  const { data, error } = await supabase.rpc("fn_delete_grinding_batch", {
    p_batch_id: batchId,
  });
  if (error) throw parseSupabaseError(error);
  return data;
}

export async function deletePayroll(payrollId: string) {
  const { data, error } = await supabase.rpc("fn_delete_payroll", {
    p_payroll_id: payrollId,
  });
  if (error) throw parseSupabaseError(error);
  return data;
}

export type ResettableModule =
  | "warehouse"
  | "beds"
  | "grinding"
  | "shipments"
  | "addis_hub"
  | "payroll"
  | "inventory"
  | "all";

export async function resetTenantModuleData(module: ResettableModule) {
  const { data, error } = await supabase.rpc("fn_reset_tenant_module_data", {
    p_module: module,
  });
  if (error) throw parseSupabaseError(error);
  return data;
}
