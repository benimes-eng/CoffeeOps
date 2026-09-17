# CoffeeOps Target System Architecture

## 1. Architectural Vision

CoffeeOps manages mission-critical physical operations for Ethiopian coffee post-harvest facilities. The system is architected to guarantee **correctness, data integrity, strict multi-tenant isolation, atomic state transitions, and verifiable coffee traceability**.

Rather than permitting unconstrained client-to-database mutations, CoffeeOps adheres to a three-tier operational architecture:

```
┌───────────────────────────────────────────────────────────────┐
│                       React 18 SPA                           │
│     TypeScript • Tailwind CSS • shadcn/ui • TanStack Query   │
│   - Route & UX Permissions                                    │
│   - Input Collection & Form Validation (Zod)                  │
│   - Direct DB Reads via Tenant-Scoped RLS                     │
│   - State-changing Operations invoke Backend Services / RPCs  │
└───────────────────────────────┬───────────────────────────────┘
                                │
                 HTTPS / Supabase Client SDK / JSON
                                │
                                ▼
┌───────────────────────────────────────────────────────────────┐
│               Authoritative Application Tier                  │
│   - Supabase Edge Functions (`manage-users`, `mcp`)           │
│   - PostgreSQL Stored Procedures / RPCs (`SECURITY DEFINER`)   │
│   - Transaction Isolation & Concurrency Locking (`FOR UPDATE`)│
│   - Automated Document Numbering                              │
│   - Immutable Audit Logging & Event Notifications             │
└───────────────────────────────┬───────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────┐
│               PostgreSQL Database & Storage                   │
│   - 18 Relational Tables with Foreign Key Constraints         │
│   - Row-Level Security (RLS) enforcing Tenant Boundaries      │
│   - CHECK Constraints (Weights > 0, Inventory >= 0)           │
│   - Row-level Audit Triggers                                  │
│   - Complete Batch Lineage & Traceability Graph               │
└───────────────────────────────────────────────────────────────┘
```

---

## 2. Component Boundaries & Responsibilities

### 2.1 Presentation Layer (Frontend)
- **Role:** Pure interface and interaction manager.
- **Responsibilities:**
  - Client routing and role-based UI guards (`RoleGuard`, `AppSidebar`).
  - Strict input validation via schema definitions prior to submission.
  - Query caching, optimistic rendering where appropriate, and retry logic via TanStack Query.
  - Direct database `SELECT` queries utilizing database RLS policies.
  - Delegating all mutations (`INSERT`, `UPDATE`, `DELETE`) on business workflow entities to domain services and database RPCs.

### 2.2 Application Services & Transaction Boundaries
State-changing mutations are prohibited from executing multiple uncoordinated HTTP requests from the browser. They must execute inside an atomic database transaction.

Key transactional workflows:
1. **Intake Creation (`fn_create_lot`):**
   - Allocates the next collision-safe lot number from an organization sequence (`L-YYYY-XXXXX`).
   - Validates initial wet weight > 0 and known coffee region.
   - Inserts the lot and emits an audit event.
2. **Bed Assignment (`fn_assign_bed`):**
   - Locks the bed row with `SELECT ... FOR UPDATE`.
   - Verifies bed is in `empty` state and not in `maintenance`.
   - Validates that `assigned_weight / density <= surface_area`.
   - Sets bed status to `occupied`, inserts `bed_assignments` record with `assigned_area` and `density_used`.
   - Writes to `bed_activity_logs` and notifies relevant managers.
3. **Drying Completion (`fn_finish_drying`):**
   - Closes active `bed_assignments` row (`is_active = false`, sets `final_weight` and `completed_at`).
   - Resets bed status to `empty`.
   - Transitions lot status to `ready_for_grinding` and updates `current_weight` with `final_weight`.
   - Logs bed action and audit event atomically.
4. **Lot Merging (`fn_merge_lots`):**
   - Locks all source lots (`SELECT ... FOR UPDATE`).
   - Verifies all source lots belong to the same organization, have compatible status, and share the same region.
   - Computes aggregated dry weight.
   - Generates merged lot identifier (`MERGE-YYYY-XXXXX`).
   - Inserts child lot with `parent_lot_ids` preserving backward lineage.
   - Transitions parent lots to `merged` status (preserving historical records and preventing double-use).
5. **Grinding Pipeline (`fn_start_grinding` / `fn_complete_grinding`):**
   - Verifies source lot is in `ready_for_grinding`.
   - Creates `grinding_batches` entry and marks lot `grinding`.
   - Upon completion, validates `ground_weight <= dry_weight`.
   - Calculates yield percentage `(ground_weight / dry_weight * 100)` and loss weight.
   - Transitions lot to `ready_for_shipment` and records completion timestamp.
6. **Shipment Lifecycle (`fn_create_shipment` / `fn_update_shipment_status`):**
   - Verifies lot is `ready_for_shipment` with available current weight.
   - Allocates shipment sequence number (`SH-YYYY-XXXXX`).
   - Progresses status through `preparing → in_transit → arrived → confirmed`.
   - Once confirmed, marks lot `shipped` and closes traceability chain.
7. **Inventory Movement Ledger (`fn_record_inventory_movement`):**
   - Locks `inventory_items` row.
   - Validates that consumption/transfer will not result in negative stock balance.
   - Inserts an immutable row into `inventory_movements`.
   - Authoritatively updates `inventory_items.quantity`.

---

## 3. Multi-Tenancy Model

1. **Organization as Tenant:**
   - Every business table holds an `organization_id UUID REFERENCES organizations(id) NOT NULL`.
   - Helper function `get_user_org_id(auth.uid())` resolves the authenticated caller's tenant from `public.profiles`.
2. **Database-Enforced Isolation:**
   - Row-Level Security is active on 100% of operational tables.
   - SELECT, INSERT, UPDATE, DELETE policies enforce `organization_id = get_user_org_id(auth.uid())`.
   - Foreign key checks and triggers prevent referencing records belonging to another tenant.
3. **Privilege Boundary Enforcement:**
   - Client is strictly forbidden from changing `profiles.organization_id`, `profiles.is_super_admin`, or `profiles.is_approved`.
   - Database triggers enforce immutability of tenant association.

---

## 4. MCP Server & AI Agent Boundary

- The application exposes an MCP endpoint (`/functions/v1/mcp`) for connected AI agents.
- **Read-Only Invariant:** MCP tools operate strictly with read privileges. Write operations are barred.
- **Identity Propagation:** Requests require a valid Supabase OAuth bearer token; queries run with the user's explicit permissions and organization scope via RLS.
- **Data Minimization:** Personal compensation figures (e.g. worker wage rates) are stripped from agent responses.
