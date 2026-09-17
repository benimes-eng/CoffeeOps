# CoffeeOps Database Architecture & Schema Specification

## 1. Schema Inventory (18 Core Tables)

| Table Name | Primary Purpose | Key Foreign Keys | Key Constraints & Indexes |
|---|---|---|---|
| `organizations` | Tenant entity representing coffee estates / mills | None | PK `id`, `name NOT NULL` |
| `profiles` | User profiles linked to Supabase Auth | `user_id -> auth.users`, `organization_id -> organizations` | UNIQUE (`user_id`), Trigger protects privileged columns |
| `user_roles` | Role assignments (owner, manager, supervisor, worker) | `user_id -> auth.users`, `organization_id -> organizations` | UNIQUE (`user_id`, `role`), Index on `organization_id` |
| `sites` | Physical mill or farm locations | `organization_id -> organizations` | Index on `organization_id` |
| `blocks` | Geographic divisions within a site | `site_id -> sites`, `organization_id -> organizations` | Index on `site_id`, `organization_id` |
| `beds` | Raised drying beds | `block_id -> blocks`, `organization_id -> organizations` | Generated `surface_area`, CHECK `length > 0`, `width > 0` |
| `lots` | Coffee cherry batches from intake to export | `organization_id -> organizations`, `parent_lot_ids` | UNIQUE `lot_number`, CHECK `initial_weight > 0` |
| `bed_assignments` | Allocation of coffee lot to drying bed | `bed_id -> beds`, `lot_id -> lots`, `organization_id -> organizations` | CHECK `assigned_weight > 0`, Index `(bed_id, is_active)` |
| `bed_activity_logs` | Immutable log of bed operations (turning, cleaning) | `bed_id -> beds`, `bed_assignment_id -> bed_assignments` | Index `(bed_id, created_at DESC)` |
| `grinding_batches` | Hulling and dry-milling process batches | `lot_id -> lots`, `organization_id -> organizations` | CHECK `dry_weight > 0`, `ground_weight <= dry_weight` |
| `shipments` | Export consignments dispatched to port/warehouse | `lot_id -> lots`, `organization_id -> organizations` | CHECK `weight > 0`, UNIQUE `shipment_number` |
| `inventory_items` | Machinery, equipment, and consumable assets | `organization_id -> organizations` | CHECK `quantity >= 0`, Index on `organization_id` |
| `inventory_movements` | Immutable audit ledger of stock transactions | `item_id -> inventory_items`, `organization_id -> organizations` | CHECK `quantity != 0`, Index `(item_id, created_at)` |
| `workers` | Farm labor records | `organization_id -> organizations` | CHECK `wage_rate >= 0`, Index on `organization_id` |
| `work_logs` | Daily hours and operational tasks logged by workers | `worker_id -> workers`, `organization_id -> organizations` | CHECK `hours_worked >= 0`, Index `(worker_id, date)` |
| `payroll` | Periodic wage statements calculated from work logs | `worker_id -> workers`, `organization_id -> organizations` | CHECK `total_pay >= 0`, `total_hours >= 0` |
| `notifications` | In-app alerts for maintenance, drying, and approvals | `organization_id -> organizations`, `user_id -> auth.users` | Index `(user_id, is_read)` |
| `audit_logs` | Immutable security and operational audit trail | `organization_id -> organizations` | Index `(organization_id, created_at DESC)` |

---

## 2. Enums and Data Types

- `public.app_role`: `'owner'`, `'manager'`, `'supervisor'`, `'worker'`
- `public.bed_status`: `'empty'`, `'occupied'`, `'maintenance'`
- `public.lot_status`: `'received'`, `'drying'`, `'ready_for_grinding'`, `'grinding'`, `'ready_for_shipment'`, `'shipped'`, `'merged'`
- `public.bed_action_type`: `'turning'`, `'cleaning'`, `'inspection'`, `'assignment'`, `'removal'`, `'maintenance_start'`, `'maintenance_end'`
- `public.wage_type`: `'daily'`, `'hourly'`, `'monthly'`
- `public.worker_status`: `'active'`, `'on_leave'`, `'terminated'`
- `public.inventory_category`: `'machinery'`, `'equipment'`, `'consumable'`
- `public.movement_type`: `'in'`, `'out'`

---

## 3. Authoritative Stored Procedures (RPCs)

### `fn_create_lot`
```sql
CREATE OR REPLACE FUNCTION public.fn_create_lot(
  p_region TEXT,
  p_initial_weight NUMERIC,
  p_intake_date DATE DEFAULT CURRENT_DATE
) RETURNS JSONB;
```
- Allocates collision-safe document number: `L-YYYY-XXXXX`
- Atomically creates the lot and logs audit entry.

### `fn_assign_bed`
```sql
CREATE OR REPLACE FUNCTION public.fn_assign_bed(
  p_bed_id UUID,
  p_lot_id UUID,
  p_weight NUMERIC,
  p_density NUMERIC DEFAULT 30
) RETURNS JSONB;
```
- Obtains exclusive row-lock on bed (`FOR UPDATE`).
- Verifies bed is `empty` and not in `maintenance`.
- Verifies `(p_weight / p_density) <= bed.surface_area`.
- Updates bed status to `occupied`.
- Inserts active assignment with `assigned_area` and `density_used`.
- Inserts `bed_activity_logs` entry.
- Transitions lot status to `drying`.

### `fn_finish_drying`
```sql
CREATE OR REPLACE FUNCTION public.fn_finish_drying(
  p_bed_id UUID,
  p_assignment_id UUID,
  p_final_weight NUMERIC
) RETURNS JSONB;
```
- Marks assignment `is_active = false`, sets `final_weight` and `completed_at = now()`.
- Updates bed status to `empty`.
- Updates lot `current_weight = p_final_weight` and `status = 'ready_for_grinding'`.
- Inserts `bed_activity_logs` record and `audit_logs` entry.

### `fn_merge_lots`
```sql
CREATE OR REPLACE FUNCTION public.fn_merge_lots(
  p_source_lot_ids UUID[]
) RETURNS JSONB;
```
- Locks all source lots (`FOR UPDATE`).
- Verifies count >= 2, all belong to caller's org, same region, status is `ready_for_grinding` or `finished`.
- Calculates sum of `current_weight`.
- Creates child lot with `parent_lot_ids = p_source_lot_ids`, allocated number `MERGE-YYYY-XXXXX`.
- Marks source lots `status = 'merged'`.

### `fn_start_grinding` & `fn_complete_grinding`
```sql
CREATE OR REPLACE FUNCTION public.fn_start_grinding(p_lot_id UUID) RETURNS JSONB;
CREATE OR REPLACE FUNCTION public.fn_complete_grinding(p_batch_id UUID, p_ground_weight NUMERIC) RETURNS JSONB;
```
- Validates lot is `ready_for_grinding`.
- Creates grinding batch, sets lot to `grinding`.
- On complete: validates `p_ground_weight <= dry_weight`.
- Computes yield percentage and loss.
- Sets lot `current_weight = p_ground_weight`, `status = 'ready_for_shipment'`.

### `fn_create_shipment` & `fn_update_shipment_status`
```sql
CREATE OR REPLACE FUNCTION public.fn_create_shipment(
  p_lot_id UUID,
  p_destination TEXT,
  p_shipment_date DATE DEFAULT CURRENT_DATE
) RETURNS JSONB;
CREATE OR REPLACE FUNCTION public.fn_update_shipment_status(
  p_shipment_id UUID,
  p_status TEXT
) RETURNS JSONB;
```
- Verifies lot `status = 'ready_for_shipment'`.
- Allocates shipment sequence `SH-YYYY-XXXXX`.
- Upon `p_status = 'confirmed'`, transitions lot to `status = 'shipped'`.

### `fn_record_inventory_movement`
```sql
CREATE OR REPLACE FUNCTION public.fn_record_inventory_movement(
  p_item_id UUID,
  p_type movement_type,
  p_quantity NUMERIC,
  p_reason TEXT DEFAULT NULL,
  p_ref_type TEXT DEFAULT NULL,
  p_ref_id TEXT DEFAULT NULL
) RETURNS JSONB;
```
- Locks item row (`FOR UPDATE`).
- If movement is `'out'`, verifies `current_quantity - p_quantity >= 0`.
- Inserts ledger entry into `inventory_movements`.
- Updates `inventory_items.quantity = new_balance`.

---

## 4. Indexing & Query Optimization

Composite indexes implemented based on query patterns:
1. `idx_profiles_org_approved` on `public.profiles(organization_id, is_approved)`
2. `idx_beds_block_status` on `public.beds(block_id, status)`
3. `idx_bed_assignments_active` on `public.bed_assignments(bed_id) WHERE is_active = true`
4. `idx_lots_org_status` on `public.lots(organization_id, status)`
5. `idx_grinding_batches_org` on `public.grinding_batches(organization_id, status)`
6. `idx_shipments_org_status` on `public.shipments(organization_id, status)`
7. `idx_inventory_movements_item` on `public.inventory_movements(item_id, created_at DESC)`
8. `idx_work_logs_worker_date` on `public.work_logs(worker_id, date)`
9. `idx_payroll_org_period` on `public.payroll(organization_id, period_start DESC)`
10. `idx_audit_logs_org_created` on `public.audit_logs(organization_id, created_at DESC)`
