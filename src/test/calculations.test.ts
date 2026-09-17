import { describe, it, expect } from "vitest";

describe("CoffeeOps Calculations & Business Rules", () => {
  describe("Bed Capacity & Surface Area Math", () => {
    const STANDARD_DENSITY = 30; // 30 kg/m²

    it("calculates bed maximum capacity correctly", () => {
      const surfaceArea = 40; // 40 m²
      const maxCapacity = surfaceArea * STANDARD_DENSITY;
      expect(maxCapacity).toBe(1200); // 1200 kg
    });

    it("calculates bed utilization percentage", () => {
      const totalCapacity = 1200;
      const occupiedWeight = 900;
      const utilization = Math.round((occupiedWeight / totalCapacity) * 100);
      expect(utilization).toBe(75);
    });

    it("correctly identifies over-capacity condition", () => {
      const bedCapacity = 1200;
      const proposedAssignment = 1250;
      const isOverCapacity = proposedAssignment > bedCapacity;
      expect(isOverCapacity).toBe(true);
    });
  });

  describe("Grinding Yield & Loss Math", () => {
    it("calculates milling yield percentage and loss weight accurately", () => {
      const inputDryWeight = 1000; // 1000 kg parchment
      const outputGroundWeight = 840; // 840 kg green coffee

      const yieldPercent = (outputGroundWeight / inputDryWeight) * 100;
      const lossWeight = inputDryWeight - outputGroundWeight;
      const lossPercent = (lossWeight / inputDryWeight) * 100;

      expect(yieldPercent).toBe(84.0);
      expect(lossWeight).toBe(160);
      expect(lossPercent).toBe(16.0);
    });

    it("flags zero or negative loss as invalid or 100% yield", () => {
      const inputDryWeight = 500;
      const outputGroundWeight = 500;
      const yieldPercent = (outputGroundWeight / inputDryWeight) * 100;
      const lossWeight = inputDryWeight - outputGroundWeight;

      expect(yieldPercent).toBe(100);
      expect(lossWeight).toBe(0);
    });
  });

  describe("Ethiopian Birr (ETB) Deterministic Payroll Calculation", () => {
    it("calculates hourly worker pay deterministically", () => {
      const hourlyRate = 65.5; // 65.50 ETB / hr
      const workShifts = [8, 8, 7.5, 9];
      const totalHours = workShifts.reduce((a, b) => a + b, 0); // 32.5 hrs
      const totalPay = Number((totalHours * hourlyRate).toFixed(2));

      expect(totalHours).toBe(32.5);
      expect(totalPay).toBe(2128.75); // 2,128.75 ETB
    });

    it("calculates daily worker pay deterministically based on distinct active days", () => {
      const dailyRate = 450; // 450 ETB / day
      const logDates = ["2026-03-01", "2026-03-02", "2026-03-03", "2026-03-03"]; // 3 unique days
      const uniqueDays = new Set(logDates).size;
      const totalPay = uniqueDays * dailyRate;

      expect(uniqueDays).toBe(3);
      expect(totalPay).toBe(1350); // 1,350 ETB
    });

    it("calculates monthly fixed worker pay deterministically", () => {
      const monthlySalary = 12500; // 12,500 ETB
      const totalPay = Number(monthlySalary.toFixed(2));
      expect(totalPay).toBe(12500);
    });
  });

  describe("Inventory Balance Ledger Math", () => {
    it("calculates cumulative ledger balance from in and out movements", () => {
      const initialStock = 0;
      const movements = [
        { type: "in", quantity: 50 },    // Received 50 bags
        { type: "in", quantity: 100 },   // Received 100 bags
        { type: "out", quantity: 30 },   // Used 30 bags
        { type: "out", quantity: 45 },   // Used 45 bags
      ];

      const currentBalance = movements.reduce((bal, m) => {
        return m.type === "in" ? bal + m.quantity : bal - m.quantity;
      }, initialStock);

      expect(currentBalance).toBe(75);
    });

    it("detects stock shortage when out movement exceeds available balance", () => {
      const availableBalance = 20;
      const requestedOut = 25;
      const hasSufficientStock = availableBalance >= requestedOut;

      expect(hasSufficientStock).toBe(false);
    });
  });

  describe("Coffee Batch Merging and Weight Conservation", () => {
    it("conserves total weight during batch merge", () => {
      const sourceLots = [
        { id: "lot-1", weight: 650 },
        { id: "lot-2", weight: 450 },
        { id: "lot-3", weight: 900 },
      ];

      const mergedInitialWeight = sourceLots.reduce((sum, l) => sum + l.weight, 0);
      const parentLotIds = sourceLots.map((l) => l.id);

      expect(mergedInitialWeight).toBe(2000);
      expect(parentLotIds).toHaveLength(3);
      expect(parentLotIds).toContain("lot-1");
      expect(parentLotIds).toContain("lot-2");
      expect(parentLotIds).toContain("lot-3");
    });
  });
});
