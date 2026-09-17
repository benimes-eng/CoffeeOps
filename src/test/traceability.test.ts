import { describe, it, expect } from "vitest";

interface LotNode {
  id: string;
  lotNumber: string;
  region: string;
  weight: number;
  parentLotIds?: string[] | null;
}

/**
 * Traverses parent lot IDs recursively to build full genealogy/traceability tree.
 */
function resolveLotTraceability(
  lotId: string,
  lotDatabase: Map<string, LotNode>
): LotNode[] {
  const visited = new Set<string>();
  const ancestors: LotNode[] = [];

  function traverse(currentId: string) {
    if (visited.has(currentId)) return;
    visited.add(currentId);

    const lot = lotDatabase.get(currentId);
    if (!lot) return;

    if (currentId !== lotId) {
      ancestors.push(lot);
    }

    if (lot.parentLotIds && lot.parentLotIds.length > 0) {
      for (const parentId of lot.parentLotIds) {
        traverse(parentId);
      }
    }
  }

  traverse(lotId);
  return ancestors;
}

describe("Coffee Full Traceability & Lineage Graph", () => {
  it("resolves direct parent lots for merged batch", () => {
    const db = new Map<string, LotNode>([
      [
        "parent-1",
        { id: "parent-1", lotNumber: "LOT-2026-0001", region: "Yirgacheffe", weight: 800, parentLotIds: [] },
      ],
      [
        "parent-2",
        { id: "parent-2", lotNumber: "LOT-2026-0002", region: "Sidama", weight: 600, parentLotIds: [] },
      ],
      [
        "child-merged",
        {
          id: "child-merged",
          lotNumber: "LOT-2026-0003",
          region: "Yirgacheffe / Sidama Blend",
          weight: 1400,
          parentLotIds: ["parent-1", "parent-2"],
        },
      ],
    ]);

    const ancestors = resolveLotTraceability("child-merged", db);
    expect(ancestors).toHaveLength(2);
    expect(ancestors.map((a) => a.lotNumber)).toContain("LOT-2026-0001");
    expect(ancestors.map((a) => a.lotNumber)).toContain("LOT-2026-0002");
  });

  it("resolves multi-generation ancestry (e.g. cherry intake -> washed drying -> blended export lot)", () => {
    const db = new Map<string, LotNode>([
      [
        "gen-0-a",
        { id: "gen-0-a", lotNumber: "INTAKE-CHERRY-01", region: "Guji Zone 1", weight: 1200 },
      ],
      [
        "gen-0-b",
        { id: "gen-0-b", lotNumber: "INTAKE-CHERRY-02", region: "Guji Zone 2", weight: 800 },
      ],
      [
        "gen-1-drying",
        {
          id: "gen-1-drying",
          lotNumber: "DRY-PARCH-01",
          region: "Guji",
          weight: 700,
          parentLotIds: ["gen-0-a", "gen-0-b"],
        },
      ],
      [
        "gen-2-export",
        {
          id: "gen-2-export",
          lotNumber: "EXP-2026-099",
          region: "Guji Special Blend",
          weight: 580,
          parentLotIds: ["gen-1-drying"],
        },
      ],
    ]);

    const ancestry = resolveLotTraceability("gen-2-export", db);
    expect(ancestry).toHaveLength(3);
    const lotNumbers = ancestry.map((a) => a.lotNumber);
    expect(lotNumbers).toContain("DRY-PARCH-01");
    expect(lotNumbers).toContain("INTAKE-CHERRY-01");
    expect(lotNumbers).toContain("INTAKE-CHERRY-02");
  });

  it("handles empty ancestry gracefully for root intake lots", () => {
    const db = new Map<string, LotNode>([
      [
        "root-lot",
        { id: "root-lot", lotNumber: "LOT-001", region: "Jimma", weight: 500, parentLotIds: [] },
      ],
    ]);

    const ancestry = resolveLotTraceability("root-lot", db);
    expect(ancestry).toHaveLength(0);
  });
});
