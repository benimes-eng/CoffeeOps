import { supabase } from "@/integrations/supabase/client";
import { parseSupabaseError } from "@/lib/errors";

export function calculateYield(groundWeight: number, dryWeight: number): { yieldPercent: number; lossKg: number } {
  if (dryWeight <= 0) return { yieldPercent: 0, lossKg: 0 };
  const yieldPercent = Number(((groundWeight / dryWeight) * 100).toFixed(2));
  const lossKg = Number((dryWeight - groundWeight).toFixed(2));
  return { yieldPercent, lossKg };
}

/**
 * Initiates grinding for a lot ready for hulling/milling.
 * Fails closed without client-side fallback.
 */
export async function startGrinding(lotId: string) {
  const { data, error } = await supabase.rpc("fn_start_grinding", {
    p_lot_id: lotId,
  });

  if (error) {
    throw parseSupabaseError(error);
  }

  return data;
}

/**
 * Completes grinding, recording verified clean bean output weight.
 * Fails closed without client-side fallback.
 */
export async function completeGrinding(batchId: string, _lotId: string, groundWeight: number, dryWeight: number) {
  if (groundWeight <= 0) {
    throw new Error("Clean ground coffee weight must be greater than zero.");
  }

  if (groundWeight > dryWeight) {
    throw new Error(`Ground clean weight (${groundWeight} KG) cannot exceed input dry parchment weight (${dryWeight} KG)`);
  }

  const { data, error } = await supabase.rpc("fn_complete_grinding", {
    p_batch_id: batchId,
    p_ground_weight: groundWeight,
  });

  if (error) {
    throw parseSupabaseError(error);
  }

  return data;
}

/**
 * Authoritatively creates a lot for purchased dried coffee that skips the drying stage.
 * Directly transitions to 'ready_for_grinding' via fn_create_lot RPC.
 */
export async function createDirectDriedLot({
  region,
  weight,
  notes,
}: {
  region: string;
  weight: number;
  notes?: string;
  lotNumber?: string;
}) {
  if (weight <= 0) {
    throw new Error("Initial intake weight must be greater than zero.");
  }
  if (!region || !region.trim()) {
    throw new Error("Region is required.");
  }

  const now = new Date().toISOString().split("T")[0];
  const combinedNotes = notes?.trim()
    ? `[Purchased Dried Coffee] ${notes.trim()}`
    : "[Purchased Dried Coffee] Ready for immediate hulling/milling";

  const { data, error } = await supabase.rpc("fn_create_lot", {
    p_region: region.trim(),
    p_initial_weight: weight,
    p_intake_date: now,
    p_notes: combinedNotes,
    p_is_purchased_dry: true,
  });

  if (error) {
    throw parseSupabaseError(error);
  }

  return data;
}

