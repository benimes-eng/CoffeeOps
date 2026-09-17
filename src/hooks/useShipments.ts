import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { createShipment, updateShipmentStatus } from "@/services/shipmentService";
import { useToast } from "@/hooks/use-toast";
import { LOTS_QUERY_KEY } from "./useLots";

export const SHIPMENTS_KEY = ["shipments"] as const;

export interface ShipmentWithLot {
  id: string;
  shipment_number: string | null;
  lot_id: string;
  destination: string;
  weight: number;
  status: string;
  created_at: string;
  shipment_date?: string | null;
  lot?: {
    lot_number: string;
    region: string;
    current_weight: number;
  } | null;
}

export function useShipments() {
  return useQuery({
    queryKey: SHIPMENTS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shipments")
        .select("*, lot:lots!shipments_lot_id_fkey(lot_number, region, current_weight)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as ShipmentWithLot[];
    },
  });
}

export function useCreateShipment() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({
      lotId,
      destination,
      shipmentDate,
    }: {
      lotId: string;
      destination: string;
      shipmentDate?: string;
    }) => createShipment(lotId, destination, shipmentDate),
    onSuccess: (data: { shipment_number?: string } | null) => {
      qc.invalidateQueries({ queryKey: SHIPMENTS_KEY });
      qc.invalidateQueries({ queryKey: LOTS_QUERY_KEY });
      toast({
        title: "Consignment Dispatched",
        description: `Shipment ${data?.shipment_number ?? ""} created.`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create shipment", description: err.message, variant: "destructive" });
    },
  });
}

export function useUpdateShipmentStatus() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({
      shipmentId,
      status,
      lotId,
    }: {
      shipmentId: string;
      status: string;
      lotId?: string;
    }) => updateShipmentStatus(shipmentId, status, lotId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SHIPMENTS_KEY });
      qc.invalidateQueries({ queryKey: LOTS_QUERY_KEY });
      toast({ title: "Shipment Status Updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });
}
