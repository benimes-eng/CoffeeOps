import { z } from "zod";

// Ethiopian Coffee Regions
export const ETHIOPIAN_COFFEE_REGIONS = [
  "Yirgacheffe",
  "Sidama",
  "Guji",
  "Harrar",
  "Jimma",
  "Limu",
  "Nekemte",
  "Kaffa",
  "Illubabor",
] as const;

export const lotIntakeSchema = z.object({
  region: z.string().min(2, "Region is required"),
  initial_weight: z.number().positive("Initial weight must be greater than zero"),
  intake_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"),
  notes: z.string().optional().nullable(),
});

export type LotIntakeInput = z.infer<typeof lotIntakeSchema>;

export const bedAssignmentSchema = z.object({
  bedId: z.string().uuid("Invalid bed ID"),
  lotId: z.string().uuid("Invalid lot ID"),
  weight: z.number().positive("Assigned weight must be greater than zero"),
  density: z.number().positive("Drying density must be greater than zero").default(30),
});

export type BedAssignmentInput = z.infer<typeof bedAssignmentSchema>;

export const finishDryingSchema = z.object({
  bedId: z.string().uuid("Invalid bed ID"),
  assignmentId: z.string().uuid("Invalid assignment ID"),
  finalWeight: z.number().positive("Final dry weight must be greater than zero"),
});

export type FinishDryingInput = z.infer<typeof finishDryingSchema>;

export const mergeLotsSchema = z.object({
  sourceLotIds: z.array(z.string().uuid()).min(2, "At least 2 lots must be selected for merging"),
  notes: z.string().optional().nullable(),
});

export type MergeLotsInput = z.infer<typeof mergeLotsSchema>;

export const grindingStartSchema = z.object({
  lotId: z.string().uuid("Invalid lot ID"),
});

export type GrindingStartInput = z.infer<typeof grindingStartSchema>;

export const grindingCompleteSchema = z.object({
  batchId: z.string().uuid("Invalid batch ID"),
  lotId: z.string().uuid("Invalid lot ID"),
  dryWeight: z.number().positive("Dry weight must be positive"),
  groundWeight: z.number().positive("Ground weight must be greater than zero"),
}).refine((data) => data.groundWeight <= data.dryWeight, {
  message: "Ground weight cannot exceed input dry weight",
  path: ["groundWeight"],
});

export type GrindingCompleteInput = z.infer<typeof grindingCompleteSchema>;

export const shipmentCreateSchema = z.object({
  lotId: z.string().uuid("Invalid lot ID"),
  destination: z.string().min(2, "Destination is required"),
  weight: z.number().positive("Shipment weight must be greater than zero"),
  shipmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"),
});

export type ShipmentCreateInput = z.infer<typeof shipmentCreateSchema>;

export const inventoryMovementSchema = z.object({
  itemId: z.string().uuid("Invalid item ID"),
  type: z.enum(["in", "out"]),
  quantity: z.number().positive("Quantity must be positive"),
  reason: z.string().min(2, "Reason is required"),
  referenceType: z.string().optional().nullable(),
  referenceId: z.string().optional().nullable(),
});

export type InventoryMovementInput = z.infer<typeof inventoryMovementSchema>;

export const workLogSchema = z.object({
  workerId: z.string().uuid("Invalid worker ID"),
  activityType: z.string().min(2, "Activity type is required"),
  hoursWorked: z.number().min(0.5, "Hours worked must be at least 0.5").max(24, "Hours worked cannot exceed 24"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"),
});

export type WorkLogInput = z.infer<typeof workLogSchema>;

export const payrollGenerateSchema = z.object({
  workerId: z.string().uuid("Invalid worker ID"),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid start date format"),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid end date format"),
});

export type PayrollGenerateInput = z.infer<typeof payrollGenerateSchema>;
