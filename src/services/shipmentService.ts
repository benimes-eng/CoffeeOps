import { supabase } from "@/integrations/supabase/client";
import { parseSupabaseError } from "@/lib/errors";

export async function createShipment(lotId: string, destination: string, shipmentDate?: string) {
  if (!destination || !destination.trim()) {
    throw new Error("Shipment destination is required.");
  }

  const { data, error } = await supabase.rpc("fn_create_shipment", {
    p_lot_id: lotId,
    p_destination: destination.trim(),
    p_shipment_date: shipmentDate || new Date().toISOString().split("T")[0],
  });

  if (error) {
    throw parseSupabaseError(error);
  }

  return data;
}

export async function updateShipmentStatus(shipmentId: string, newStatus: string, _lotId?: string) {
  const { data, error } = await supabase.rpc("fn_update_shipment_status", {
    p_shipment_id: shipmentId,
    p_new_status: newStatus,
  });

  if (error) {
    throw parseSupabaseError(error);
  }

  return data;
}

