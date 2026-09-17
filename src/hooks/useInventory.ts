import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchInventoryItems,
  fetchInventoryMovements,
  recordInventoryMovement,
} from "@/services/inventoryService";
import { InventoryMovementInput } from "@/validation/schemas";
import { useToast } from "@/hooks/use-toast";

export const INVENTORY_ITEMS_KEY = ["inventory-items"] as const;
export const INVENTORY_MOVEMENTS_KEY = ["inventory-movements"] as const;

export function useInventoryItems(category?: string) {
  return useQuery({
    queryKey: [...INVENTORY_ITEMS_KEY, category ?? "all"],
    queryFn: () => fetchInventoryItems(category),
  });
}

export function useInventoryMovements(itemId?: string) {
  return useQuery({
    queryKey: [...INVENTORY_MOVEMENTS_KEY, itemId ?? "all"],
    queryFn: () => fetchInventoryMovements(itemId),
  });
}

export function useRecordInventoryMovement() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (input: InventoryMovementInput) => recordInventoryMovement(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: INVENTORY_ITEMS_KEY });
      qc.invalidateQueries({ queryKey: INVENTORY_MOVEMENTS_KEY });
      toast({ title: "Inventory Ledger Updated", description: "Movement successfully recorded." });
    },
    onError: (err: Error) => {
      toast({
        title: "Movement Failed",
        description: err.message || "Failed to record movement",
        variant: "destructive",
      });
    },
  });
}
