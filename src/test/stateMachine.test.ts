import { describe, it, expect } from "vitest";

// Formal State Machine Definitions based on docs/BUSINESS_RULES.md
type LotStatus = "received" | "drying" | "finished" | "milled" | "shipped" | "merged";

const VALID_LOT_TRANSITIONS: Record<LotStatus, LotStatus[]> = {
  received: ["drying"],
  drying: ["finished"],
  finished: ["milled", "shipped", "merged"],
  milled: ["shipped", "merged"],
  shipped: [], // Terminal
  merged: [],  // Terminal
};

function canTransitionLot(from: LotStatus, to: LotStatus): boolean {
  return VALID_LOT_TRANSITIONS[from].includes(to);
}

type ShipmentStatus = "preparing" | "in_transit" | "arrived" | "confirmed";

const VALID_SHIPMENT_TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  preparing: ["in_transit"],
  in_transit: ["arrived"],
  arrived: ["confirmed"],
  confirmed: [], // Terminal
};

function canTransitionShipment(from: ShipmentStatus, to: ShipmentStatus): boolean {
  return VALID_SHIPMENT_TRANSITIONS[from].includes(to);
}

describe("CoffeeOps Lifecycle State Machines", () => {
  describe("Lot Lifecycle Transitions", () => {
    it("allows standard linear progression: received -> drying -> finished -> milled -> shipped", () => {
      expect(canTransitionLot("received", "drying")).toBe(true);
      expect(canTransitionLot("drying", "finished")).toBe(true);
      expect(canTransitionLot("finished", "milled")).toBe(true);
      expect(canTransitionLot("milled", "shipped")).toBe(true);
    });

    it("allows direct shipment from finished lot", () => {
      expect(canTransitionLot("finished", "shipped")).toBe(true);
    });

    it("allows merging of finished or milled lots into a parent batch", () => {
      expect(canTransitionLot("finished", "merged")).toBe(true);
      expect(canTransitionLot("milled", "merged")).toBe(true);
    });

    it("rejects illegal backward or skip transitions", () => {
      expect(canTransitionLot("received", "finished")).toBe(false);
      expect(canTransitionLot("received", "shipped")).toBe(false);
      expect(canTransitionLot("drying", "milled")).toBe(false);
      expect(canTransitionLot("finished", "drying")).toBe(false);
      expect(canTransitionLot("shipped", "drying")).toBe(false);
      expect(canTransitionLot("merged", "received")).toBe(false);
    });

    it("treats shipped and merged as terminal states with zero outbound transitions", () => {
      expect(VALID_LOT_TRANSITIONS["shipped"]).toHaveLength(0);
      expect(VALID_LOT_TRANSITIONS["merged"]).toHaveLength(0);
    });
  });

  describe("Shipment Lifecycle Transitions", () => {
    it("allows strict sequential transition: preparing -> in_transit -> arrived -> confirmed", () => {
      expect(canTransitionShipment("preparing", "in_transit")).toBe(true);
      expect(canTransitionShipment("in_transit", "arrived")).toBe(true);
      expect(canTransitionShipment("arrived", "confirmed")).toBe(true);
    });

    it("rejects skipping stages in shipment lifecycle", () => {
      expect(canTransitionShipment("preparing", "arrived")).toBe(false);
      expect(canTransitionShipment("preparing", "confirmed")).toBe(false);
      expect(canTransitionShipment("in_transit", "confirmed")).toBe(false);
    });

    it("rejects rewinding shipment status", () => {
      expect(canTransitionShipment("confirmed", "arrived")).toBe(false);
      expect(canTransitionShipment("arrived", "in_transit")).toBe(false);
      expect(canTransitionShipment("in_transit", "preparing")).toBe(false);
    });
  });
});
