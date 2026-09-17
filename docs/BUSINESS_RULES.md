# CoffeeOps Canonical Business Rules & Operational Policies

## 1. Post-Harvest Processing Pipeline & State Machine

The core operational journey follows an invariant unidirectional progression:

```
[ INTAKE ] (received)
     │
     ▼
[ DRYING ] (drying)
     │
     ▼
[ FINISH DRYING ] (ready_for_grinding)
     │
     ▼
[ GRINDING / HULLING ] (grinding)
     │
     ▼
[ DRY WAREHOUSE ] (ready_for_shipment)
     │
     ▼
[ SHIPMENT DISPATCH ] (shipped)
```

### Invariants:
1. **No Stage Skipping:** A lot cannot jump directly from `received` to `ready_for_shipment` or `shipped`.
2. **Mandatory Final Dry Weight:** A bed cannot be marked "Finish Drying" without recording a positive `final_weight` (measured dry parchment weight).
3. **Weight Reduction Rule:** During drying, parchment loses moisture. Recorded `final_weight` must be less than or equal to wet `initial_weight` (unless an explicit anomaly is authorized).
4. **Lot Immutability Post-Shipment:** Once a lot is marked `shipped`, it cannot be reassigned, merged, or reground.

---

## 2. Drying Bed Capacity & Assignment Engine

1. **Surface Area:**
   $$\text{Surface Area } (m^2) = \text{Length } (m) \times \text{Width } (m)$$
   This is a database-generated column and cannot be edited manually.
2. **Bed Capacity Formula:**
   $$\text{Maximum Capacity } (KG) = \text{Surface Area } (m^2) \times \text{Drying Density } (KG/m^2)$$
   - Standard default density for Ethiopian parchment is **$30\text{ KG}/m^2$** (configurable between 20 and 45).
3. **Over-Allocation Prevention:**
   - A lot cannot be assigned to a bed if:
     $$\frac{\text{Assigned Weight}}{\text{Density}} > \text{Bed Surface Area}$$
   - Attempting to exceed 100% capacity triggers an immediate error (`INSUFFICIENT_CAPACITY`).
4. **Single Active Assignment Constraint:**
   - A drying bed can have at most **one** active assignment (`is_active = true`) at any given time.
5. **Maintenance Bed Invariant:**
   - A bed in `maintenance` status cannot receive coffee assignments. Maintenance must be cleared first.

---

## 3. Batch Merging & Traceability Integrity

1. **Prerequisites for Merging:**
   - At least 2 lots must be selected.
   - All source lots must belong to the **same organization**.
   - All source lots must originate from the **same coffee region** (e.g., Yirgacheffe, Sidama, Guji, Jimma, Harrar). Merging across regions is strictly prohibited to preserve terroir certification.
   - All source lots must be in `ready_for_grinding` status.
2. **Traceability Preservation:**
   - When Lot A (500 KG) and Lot B (700 KG) are merged into Lot C (1,200 KG):
     - Source lots are marked `status = 'merged'`.
     - New lot C stores `parent_lot_ids = ['<id_A>', '<id_B>']`.
     - Source lots are NOT marked `shipped`.
   - Any shipment referencing Lot C can query backward through `parent_lot_ids` to retrieve the original intake dates, initial wet weights, and drying bed logs of both Lot A and Lot B.

---

## 4. Grinding & Dry Milling Business Logic

1. **Yield Calculation:**
   $$\text{Yield } (\%) = \left(\frac{\text{Ground Clean Weight}}{\text{Input Dry Parchment Weight}}\right) \times 100$$
2. **Milling Loss:**
   $$\text{Loss } (KG) = \text{Input Dry Weight} - \text{Ground Clean Weight}$$
3. **Physical Bounds:**
   - Clean green coffee output cannot exceed dry parchment input:
     $$\text{Ground Weight} \le \text{Dry Weight}$$
   - Any input where `ground_weight > dry_weight` is rejected by database check constraint (`CHECK (ground_weight <= dry_weight)`).

---

## 5. Inventory Ledger & Non-Negative Balance

1. **Movement Ledger Requirement:**
   - Direct updates to `inventory_items.quantity` are forbidden.
   - Every stock change must be recorded via `inventory_movements`:
     - `movement_type`: `in` (Receipt, Purchase, Return) or `out` (Consumption, Damage, Disposal, Transfer).
2. **Non-Negative Balance Rule:**
   - An `'out'` movement that would cause `current_quantity - quantity < 0` is rejected with `INSUFFICIENT_STOCK`.
   - Enforced by PostgreSQL row locking and `CHECK (quantity >= 0)`.

---

## 6. Workers & Payroll Derivation

1. **Deterministic Currency:**
   - All financial amounts are denominated strictly in **ETB** (Ethiopian Birr).
   - Rounding is standard half-up to 2 decimal places.
2. **Derivation from Work Logs:**
   - For hourly workers:
     $$\text{Total Pay} = \sum(\text{Hours Worked}) \times \text{Hourly Wage Rate}$$
   - For daily workers:
     $$\text{Total Pay} = \text{Unique Work Days in Period} \times \text{Daily Wage Rate}$$
3. **Payroll Period Lock:**
   - Approved payroll entries cannot be arbitrarily modified or unapproved by non-owners.
