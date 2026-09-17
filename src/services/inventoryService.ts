import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { parseSupabaseError } from "@/lib/errors";
import { InventoryMovementInput, inventoryMovementSchema } from "@/validation/schemas";

export async function fetchInventoryItems(category?: Database["public"]["Enums"]["inventory_category"]) {
  let query = supabase.from("inventory_items").select("*").order("name");
  if (category) query = query.eq("category", category);
  const { data, error } = await query;
  if (error) throw parseSupabaseError(error);
  return data;
}

export async function fetchInventoryMovements(itemId?: string) {
  let query = supabase
    .from("inventory_movements")
    .select("*, inventory_items(name, unit)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (itemId) query = query.eq("item_id", itemId);

  const { data, error } = await query;
  if (error) throw parseSupabaseError(error);
  return data;
}

export async function recordInventoryMovement(input: InventoryMovementInput) {
  const validated = inventoryMovementSchema.parse(input);

  const { data, error } = await supabase.rpc("fn_record_inventory_movement", {
    p_item_id: validated.itemId,
    p_type: validated.type,
    p_quantity: validated.quantity,
    p_reason: validated.reason || null,
    p_ref_type: validated.referenceType || null,
    p_ref_id: validated.referenceId || null,
  });

  if (error) {
    throw parseSupabaseError(error);
  }

  return data;
}

