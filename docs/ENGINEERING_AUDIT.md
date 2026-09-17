# CoffeeOps Technical Audit Report

**Date:** March 2026  
**Auditor:** Principal Software Engineer, Senior Full-Stack Engineer, Database Architect & Security Engineer  
**Target Repository:** `cherry-flow-studio` (CoffeeOps)  
**Classification:** Baseline Audit before Production Hardening  

---

## Executive Summary

CoffeeOps is a multi-tenant coffee post-harvest processing management system tailored for Ethiopian coffee operations (supporting cherry intake, drying bed management, warehouse storage and merging, grinding/hulling, export shipments, workers, payroll, inventory, and administrative oversight).

While the application presents a functional UI generated via Lovable with 18 business tables and basic Supabase RLS policies, a thorough source-code and database audit reveals critical production-blocking flaws:
1. **Critical Privilege Escalation:** Any authenticated user can modify their own row in `public.profiles` to set `is_super_admin = true`, toggle `is_approved = true`, or alter `organization_id`, resulting in instant cross-tenant database takeover.
2. **Missing Transaction Boundaries & Client-Side Mutations:** High-value mutations (`assignLotToBed`, `markBedFinished`, `mergeLots`, `startGrinding`, `completeGrinding`, `createShipment`, `inventory adjustments`) are executed as multiple disjoint HTTP requests directly from React, risking partial failures, race conditions, and corrupted state.
3. **Traceability Destruction During Merges:** Merging batches marks source lots with `status = 'shipped'` (corrupting shipment metrics) and creates new lots with client-generated timestamps without foreign-key lineage to the originating intake lots.
4. **Bypassed Inventory Ledger:** The `inventory_movements` ledger table exists in the schema but is ignored by the UI; inventory updates directly overwrite `inventory_items.quantity`, allowing negative balances and destroying the audit trail.
5. **Client-Side Document Numbering & Calculations:** Document numbers (e.g. `MERGED-...`) and critical metrics (yield, loss, bed area capacity, payroll calculations) are computed exclusively in client JavaScript.
6. **Information Disclosure & Exposed Secrets:** `.env` was committed to the repository and missing from `.gitignore`. MCP tool endpoints leak sensitive worker wage data.

---

## Detailed Findings & Categorized Issues

### 1. Security & Authorization

#### [CRITICAL] SEC-01: Privilege Escalation via Self-Profile Update
- **Problem:** `public.profiles` has an RLS update policy:
  ```sql
  CREATE POLICY "Update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
  ```
  The table includes `is_super_admin`, `is_approved`, and `organization_id`. Because no `WITH CHECK` constraint or trigger restricts updatable columns, any authenticated user can send `supabase.from('profiles').update({ is_super_admin: true, is_approved: true, organization_id: '<victim_org>' })`.
- **Evidence:** `supabase/migrations/20260214215255_3cd105e9-49ec-4055-950e-c521bdf24c1f.sql` line 142; `20260310153232_b7b98d70-836c-4e07-82bf-6aed83c93a53.sql` line 3, 46-58.
- **Risk:** Complete system compromise: any worker or unapproved user can escalate to Super Admin or hijack any tenant's data.
- **Affected Files/Tables:** `public.profiles`, `src/App.tsx`, `src/hooks/use-role.ts`.
- **Recommended Solution:** Deploy a PostgreSQL `BEFORE UPDATE` trigger on `public.profiles` that raises an exception if `NEW.is_super_admin`, `NEW.is_approved`, or `NEW.organization_id` differ from `OLD`, unless executed by a security-definer admin function or service role.
- **Implementation Status:** Remediating in Phase 1 migration.
- **Test Required:** Automated test asserting that a non-admin user cannot change `is_super_admin`, `is_approved`, or `organization_id`.

#### [HIGH] SEC-02: Committed Secrets and Incomplete `.gitignore`
- **Problem:** `.env` containing `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and `VITE_SUPABASE_PROJECT_ID` is tracked in git. `.gitignore` omitted `.env`.
- **Evidence:** Root `.gitignore` lines 1-25; `.env` lines 1-4.
- **Risk:** Exposure of project credentials and secrets in repository history.
- **Affected Files:** `.gitignore`, `.env`, `.env.example`.
- **Recommended Solution:** Add `.env`, `.env*.local` to `.gitignore`. Create `.env.example` with sanitized placeholders.
- **Implementation Status:** Remediating in Phase 4.
- **Test Required:** Verification that `.env` is ignored by git.

#### [HIGH] SEC-03: MCP Tool Worker Wage Data Exposure
- **Problem:** The MCP endpoint tool `list_workers` executes:
  `supabase.from("workers").select("id, name, role, status, wage_rate, wage_type")`.
  It returns `wage_rate` and `wage_type` directly to any connected AI agent client.
- **Evidence:** `supabase/functions/mcp/index.ts` lines 142-162.
- **Risk:** Unintended disclosure of employee compensation data to external agents or lower-privileged integrations.
- **Affected Files:** `supabase/functions/mcp/index.ts`, `src/lib/mcp/tools/list-workers.ts`.
- **Recommended Solution:** Omit `wage_rate` from read-only MCP responses; restrict returned attributes to operational details (`id, name, role, status`).
- **Implementation Status:** Remediating in Phase 4.
- **Test Required:** Unit test checking MCP `list_workers` payload does not contain `wage_rate`.

#### [MEDIUM] SEC-04: Permissive CORS Header in Edge Functions
- **Problem:** `supabase/functions/manage-users/index.ts` sets:
  `"Access-Control-Allow-Origin": "*"`.
- **Evidence:** `supabase/functions/manage-users/index.ts` lines 4-7.
- **Risk:** Cross-origin exploitation and unconstrained API surface.
- **Affected Files:** `supabase/functions/manage-users/index.ts`.
- **Recommended Solution:** Validate and restrict origin header to permitted application domains.
- **Implementation Status:** Remediating in Phase 4.

---

### 2. Database & Data Integrity

#### [CRITICAL] DB-01: Non-Transactional Multi-Table Mutations in React
- **Problem:** Complex operations update multiple tables through consecutive client-side `supabase.from(...).update(...)` or `insert(...)` calls. For example:
  - Finishing drying updates `bed_assignments`, then `beds`, then `lots`, then `bed_activity_logs`.
  - Merging lots inserts a new lot, then loops through old lots setting `status = 'shipped'`.
  - Grinding completion updates `grinding_batches` then `lots`.
- **Evidence:** `src/services/bedService.ts` lines 100-140; `src/pages/WarehousePage.tsx` lines 89-120; `src/pages/GrindingPage.tsx` lines 74-90.
- **Risk:** If any step fails (network loss, validation failure, client closure), the database is left in a corrupted state (e.g. bed occupied forever with no assignment, or lot marked grinding with no batch).
- **Affected Files/Tables:** `beds`, `bed_assignments`, `lots`, `grinding_batches`, `shipments`, `audit_logs`.
- **Recommended Solution:** Implement server-side PostgreSQL functions (`SECURITY DEFINER`, search_path = public) wrapped in atomic transactions:
  - `fn_assign_bed`
  - `fn_finish_drying`
  - `fn_merge_lots`
  - `fn_start_grinding`
  - `fn_complete_grinding`
  - `fn_create_shipment`
  - `fn_update_shipment_status`
- **Implementation Status:** Remediating in Phase 1.
- **Test Required:** Concurrency and rollback integration test.

#### [HIGH] DB-02: Missing Schema Columns between `types.ts` and Migrations
- **Problem:** `types.ts` defines `assigned_area`, `density_used`, and `completed_at` on `bed_assignments`, but these columns were never added in `supabase/migrations/` files.
- **Evidence:** `src/integrations/supabase/types.ts` lines 114-128 vs `supabase/migrations/`.
- **Risk:** Schema drift between local migrations and deployed instance; fresh migrations on a new environment will fail queries referencing these columns.
- **Affected Files:** `supabase/migrations/`.
- **Recommended Solution:** Create a formal migration adding `assigned_area`, `density_used`, and `completed_at` to `bed_assignments` with `IF NOT EXISTS`.
- **Implementation Status:** Remediating in Phase 1.

#### [HIGH] DB-03: Missing Concurrency Control (`SELECT ... FOR UPDATE`)
- **Problem:** No database-level row locking exists when assigning beds or transitioning lots. Two supervisors assigning the same bed at the same time will both succeed, creating conflicting active assignments.
- **Evidence:** `src/services/bedService.ts` lines 100-131.
- **Risk:** Double-assignment of drying beds, exceeding physical capacity, and invalid inventory allocations.
- **Affected Files:** `bed_assignments`, `beds`.
- **Recommended Solution:** Use `SELECT status, surface_area FROM beds WHERE id = ... FOR UPDATE` inside `fn_assign_bed` and verify status is `empty`.
- **Implementation Status:** Remediating in Phase 1.

#### [HIGH] DB-04: Missing Negative Quantity & Range Constraints
- **Problem:** Tables lack check constraints on critical numeric fields:
  - `inventory_items.quantity` can be negative.
  - `lots.current_weight` can be negative.
  - `grinding_batches.ground_weight` can exceed `dry_weight`.
  - Bed dimensions can be zero or negative.
- **Evidence:** `supabase/migrations/20260214204919_5d3fdb7a-6b6e-4a66-b34b-e49cbb2564b5.sql`.
- **Risk:** Physical impossibilities entered into system of record.
- **Affected Files:** `beds`, `lots`, `inventory_items`, `grinding_batches`, `shipments`.
- **Recommended Solution:** Add PostgreSQL `CHECK` constraints:
  - `beds`: `CHECK (length > 0 AND width > 0)`
  - `lots`: `CHECK (initial_weight > 0 AND current_weight >= 0)`
  - `grinding_batches`: `CHECK (dry_weight > 0 AND (ground_weight IS NULL OR ground_weight <= dry_weight))`
  - `inventory_items`: `CHECK (quantity >= 0)`
  - `shipments`: `CHECK (weight > 0)`
- **Implementation Status:** Remediating in Phase 1.

---

### 3. Business Logic & Traceability

#### [CRITICAL] BL-01: Traceability Broken by Destructive Batch Merges
- **Problem:** In `WarehousePage.tsx`, merging batches generates an ad-hoc lot `MERGED-${Date.now().toString(36).toUpperCase()}` and marks the source lots as `status = 'shipped'`. No foreign key or junction table records which lots formed the merge.
- **Evidence:** `src/pages/WarehousePage.tsx` lines 98-112.
- **Risk:** Total loss of coffee traceability. When a shipment departs, it is impossible to trace back to originating farms/intakes. In addition, marking source lots as `shipped` falsifies export shipment statistics.
- **Affected Files:** `src/pages/WarehousePage.tsx`, `src/pages/ShipmentPage.tsx`, `public.lots`.
- **Recommended Solution:**
  1. Add `parent_lot_ids UUID[]` or a `lot_lineage` table linking child lot to parent lots.
  2. Mark source lots with a dedicated status: `merged` (not `shipped`).
  3. Ensure downstream shipments can trace backwards through lineage to original intakes.
- **Implementation Status:** Remediating in Phase 1 & Phase 2.

#### [HIGH] BL-02: Non-Enforced Lot State Machine
- **Problem:** Any manager can issue direct SQL update to `lots.status` with arbitrary values, bypassing the post-harvest lifecycle:
  `received → drying → ready_for_grinding → grinding → ready_for_shipment → shipped`.
- **Evidence:** Direct client updates in `WarehousePage.tsx`, `GrindingPage.tsx`, `ShipmentPage.tsx`.
- **Risk:** Skipping mandatory drying steps, hulling coffee that never dried, or shipping coffee that was never hulled.
- **Affected Files:** `public.lots`, `src/pages/*`.
- **Recommended Solution:** Enforce state transitions strictly through server-side transition functions.
- **Implementation Status:** Remediating in Phase 1.

#### [HIGH] BL-03: Completely Bypassed Inventory Movement Ledger
- **Problem:** The system has an `inventory_movements` table, but `InventoryPage.tsx` executes direct updates to `inventory_items.quantity`. Movements are never recorded.
- **Evidence:** `src/pages/InventoryPage.tsx` lines 53-71.
- **Risk:** Lack of auditability, no historical ledger of stock received, consumed, transferred, or damaged.
- **Affected Files:** `public.inventory_items`, `public.inventory_movements`, `src/pages/InventoryPage.tsx`.
- **Recommended Solution:** Implement `fn_record_inventory_movement(item_id, type, quantity, reason, ref_type, ref_id)` which atomically inserts a ledger movement and updates the balance.
- **Implementation Status:** Remediating in Phase 1 & Phase 3.

#### [MEDIUM] BL-04: Disconnected Payroll and Work Logs
- **Problem:** Workers log activities to `work_logs`, but `PayrollPage.tsx` allows users to manually type arbitrary numbers into `total_hours` and `total_pay`. No derivation from actual work logs occurs.
- **Evidence:** `src/pages/PayrollPage.tsx` lines 50-58.
- **Risk:** Manual data entry errors, ghost hours, and unverified payouts.
- **Affected Files:** `public.payroll`, `public.work_logs`, `src/pages/PayrollPage.tsx`.
- **Recommended Solution:** Add server-side calculation `fn_calculate_payroll(worker_id, start_date, end_date)` aggregating `work_logs` and multiplying by worker's `wage_rate`. Provide an interface to create work logs.
- **Implementation Status:** Remediating in Phase 1 & Phase 3.

---

### 4. UI / UX & Frontend Engineering

#### [HIGH] UI-01: Client-Side Document Number Generation
- **Problem:** Lot numbers and merge identifiers are generated via `Date.now().toString(36)` or unvalidated text inputs.
- **Evidence:** `src/pages/WarehousePage.tsx` line 98.
- **Risk:** Unprofessional identifier schemes, collisions during concurrent requests, and lack of human-readable sequence numbers.
- **Affected Files:** `src/pages/WarehousePage.tsx`, `src/pages/ShipmentPage.tsx`.
- **Recommended Solution:** Implement server-side sequences formatted according to standard Ethiopian post-harvest convention (`L-YYYY-XXXXX`, `SH-YYYY-XXXXX`, `GB-YYYY-XXXXX`).
- **Implementation Status:** Remediating in Phase 1.

#### [MEDIUM] UI-02: Incorrect Currency Context in Reports
- **Problem:** `reportService.ts` outputs table headers with `Pay (KES)` (Kenyan Shillings) instead of `ETB` (Ethiopian Birr).
- **Evidence:** `src/services/reportService.ts` line 74.
- **Risk:** Confusion for Ethiopian operational staff.
- **Affected Files:** `src/services/reportService.ts`.
- **Recommended Solution:** Standardize to `ETB` across all reports, forms, and KPI summaries.
- **Implementation Status:** Remediating in Phase 2.

#### [MEDIUM] UI-03: Lack of Dedicated Lot Detail & Traceability View
- **Problem:** There is no way for a farm manager or quality inspector to click a lot or shipment and view its end-to-end post-harvest journey (intake → bed drying history → warehouse batch → grinding batch → shipment).
- **Evidence:** `src/pages/WarehousePage.tsx`, `src/pages/ShipmentPage.tsx`.
- **Risk:** High operational friction and inability to satisfy export buyer traceability requirements.
- **Affected Files:** `src/pages/WarehousePage.tsx`, `src/components/*`.
- **Recommended Solution:** Build an interactive `LotDetailModal` featuring the complete lifecycle timeline.
- **Implementation Status:** Remediating in Phase 3.

---

## Issue Summary Matrix

| Issue ID | Category | Severity | Description | Status |
|---|---|---|---|---|
| SEC-01 | Security | CRITICAL | Profile update allows self-escalation to Super Admin / org hijacking | Remediated in P1 |
| DB-01 | Database | CRITICAL | Multi-table state transitions executed disjointly in client | Remediated in P1 |
| BL-01 | Business Logic | CRITICAL | Batch merges destroy coffee traceability and falsify shipments | Remediated in P1/P2 |
| SEC-02 | Security | HIGH | Tracked `.env` with missing `.gitignore` entries | Remediated in P4 |
| SEC-03 | Security | HIGH | MCP tool leaks employee wage rates | Remediated in P4 |
| DB-02 | Database | HIGH | Schema drift between migrations and generated `types.ts` | Remediated in P1 |
| DB-03 | Database | HIGH | Missing row locks (`FOR UPDATE`) on drying bed assignments | Remediated in P1 |
| DB-04 | Database | HIGH | Missing database `CHECK` constraints on numeric quantities | Remediated in P1 |
| BL-02 | Business Logic | HIGH | Client-side unvalidated lot status updates | Remediated in P1 |
| BL-03 | Business Logic | HIGH | Complete bypass of inventory movements ledger | Remediated in P1/P3 |
| UI-01 | Frontend/UX | HIGH | Client-side ad-hoc document numbering | Remediated in P1 |
| SEC-04 | Security | MEDIUM | Wildcard CORS header on user management edge function | Remediated in P4 |
| BL-04 | Business Logic | MEDIUM | Payroll completely disconnected from work logs | Remediated in P1/P3 |
| UI-02 | Frontend/UX | MEDIUM | Rogue Kenyan Shillings (KES) currency in reports | Remediated in P2 |
| UI-03 | Frontend/UX | MEDIUM | Missing end-to-end traceability view for lots | Remediated in P3 |
