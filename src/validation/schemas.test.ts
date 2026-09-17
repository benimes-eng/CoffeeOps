import { describe, it, expect } from "vitest";
import {
  lotIntakeSchema,
  bedAssignmentSchema,
  finishDryingSchema,
  mergeLotsSchema,
  grindingCompleteSchema,
  inventoryMovementSchema,
  workLogSchema,
  payrollGenerateSchema,
} from "./schemas";

describe("Validation Schemas", () => {
  describe("lotIntakeSchema", () => {
    it("validates correct lot intake payload", () => {
      const valid = {
        region: "Yirgacheffe",
        initial_weight: 1500,
        intake_date: "2026-03-11",
        notes: "Grade 1 natural cherry",
      };
      expect(() => lotIntakeSchema.parse(valid)).not.toThrow();
    });

    it("rejects non-positive weights", () => {
      const invalid = {
        region: "Sidama",
        initial_weight: -10,
        intake_date: "2026-03-11",
      };
      expect(() => lotIntakeSchema.parse(invalid)).toThrow(/Initial weight must be greater than zero/);
    });

    it("rejects invalid date formats", () => {
      const invalid = {
        region: "Guji",
        initial_weight: 500,
        intake_date: "11/03/2026",
      };
      expect(() => lotIntakeSchema.parse(invalid)).toThrow(/Invalid date format/);
    });
  });

  describe("grindingCompleteSchema", () => {
    const validUUID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

    it("accepts ground weight equal to or less than input dry weight", () => {
      const valid = {
        batchId: validUUID,
        lotId: validUUID,
        dryWeight: 1000,
        groundWeight: 820,
      };
      const result = grindingCompleteSchema.parse(valid);
      expect(result.groundWeight).toBe(820);
    });

    it("rejects ground weight exceeding dry weight (yield > 100%)", () => {
      const invalid = {
        batchId: validUUID,
        lotId: validUUID,
        dryWeight: 1000,
        groundWeight: 1050,
      };
      expect(() => grindingCompleteSchema.parse(invalid)).toThrow(/Ground weight cannot exceed input dry weight/);
    });
  });

  describe("mergeLotsSchema", () => {
    const uuid1 = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
    const uuid2 = "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";

    it("accepts two or more lots for merging", () => {
      const valid = {
        sourceLotIds: [uuid1, uuid2],
        notes: "Export grade blend",
      };
      expect(() => mergeLotsSchema.parse(valid)).not.toThrow();
    });

    it("rejects merging fewer than 2 lots", () => {
      const invalid = {
        sourceLotIds: [uuid1],
      };
      expect(() => mergeLotsSchema.parse(invalid)).toThrow(/At least 2 lots must be selected/);
    });
  });

  describe("workLogSchema", () => {
    const workerId = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

    it("accepts valid work shift within 0.5 to 24 hours", () => {
      const valid = {
        workerId,
        activityType: "Drying bed turning",
        hoursWorked: 8.5,
        date: "2026-03-11",
      };
      expect(() => workLogSchema.parse(valid)).not.toThrow();
    });

    it("rejects shifts over 24 hours", () => {
      const invalid = {
        workerId,
        activityType: "Drying bed turning",
        hoursWorked: 25,
        date: "2026-03-11",
      };
      expect(() => workLogSchema.parse(invalid)).toThrow(/Hours worked cannot exceed 24/);
    });
  });
});
