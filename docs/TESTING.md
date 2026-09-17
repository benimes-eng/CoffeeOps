# CoffeeOps Testing Strategy & Quality Verification

## 1. Multi-Layer Testing Strategy

The testing suite validates CoffeeOps across three complementary layers:

```
┌────────────────────────────────────────────────────────┐
│                   Integration Tests                    │
│    - End-to-end post-harvest state machine             │
│    - Concurrency simulation on drying beds             │
│    - Multi-tenant data leakage prevention              │
│    - Batch merge lineage & backward traceability       │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│                      Unit Tests                        │
│    - Zod schema validation (weights, enums, dates)     │
│    - Capacity and drying density calculation formulas  │
│    - Grinding yield and milling loss arithmetic        │
│    - Role hierarchy and route permission matrices      │
│    - Currency formatting (ETB) and date utilities      │
└────────────────────────────────────────────────────────┘
```

---

## 2. Test Execution Commands

```bash
# Run complete test suite with Vitest
npm run test

# Run tests in watch mode during development
npm run test:watch

# TypeScript typechecking without emitting JS
npx tsc --noEmit

# ESLint inspection
npm run lint

# Production compilation check
npm run build
```

---

## 3. Test Suites & Scenarios

### Suite 1: Validation Schemas (`src/test/validation.test.ts`)
- `lotIntakeSchema`: Rejects non-positive weights, missing region, future intake dates.
- `bedAssignmentSchema`: Rejects weight exceeding bed dimensions, non-positive density.
- `finishDryingSchema`: Rejects zero or negative final weight.
- `grindingCompleteSchema`: Rejects ground weight greater than dry parchment weight.
- `inventoryMovementSchema`: Validates movement types (`in`, `out`), non-zero quantities, required reasons.
- `shipmentSchema`: Validates destinations, positive weights, future/current dates.

### Suite 2: Domain Calculations (`src/test/calculations.test.ts`)
- **Drying Bed Capacity:** Computes `surface_area = length * width` and `max_capacity = surface_area * density`.
- **Drying Phases:** Classifies 0–3 days as `critical`, 4–10 days as `active`, >10 days as `ready`.
- **Grinding Yield:** Computes `(ground / dry) * 100` and `loss = dry - ground`.
- **Payroll Derivation:** Verifies deterministic calculation for hourly and daily workers.

### Suite 3: State Machine & Traceability (`src/test/stateMachine.test.ts`, `src/test/traceability.test.ts`)
- Asserts invalid transitions fail (e.g., `received` directly to `shipped`).
- Verifies batch merge combines weights, preserves `parent_lot_ids`, and marks parent lots as `merged` rather than `shipped`.
- Verifies lineage traversal from shipment to original intake lots.

### Suite 4: Role Hierarchy & Permissions (`src/test/permissions.test.ts`)
- Asserts `owner` has access to all routes including `/settings` and `/audit-log`.
- Asserts `manager` has access to operations but cannot access `/settings`.
- Asserts `supervisor` can access beds and sites but not financial/payroll pages.
- Asserts `worker` has access restricted to dashboard and beds.

### Suite 5: Inventory Ledger Invariants (`src/test/inventoryLedger.test.ts`)
- Asserts stock receipts increase balance.
- Asserts stock consumptions decrease balance.
- Asserts consumption exceeding balance is prohibited.
