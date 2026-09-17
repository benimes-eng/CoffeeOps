# CoffeeOps Security Architecture & RLS Matrix

## 1. Authentication & Identity Lifecycle

1. **Identity Provider:** Supabase Auth (JWT based session management).
2. **Signup & Onboarding Flow:**
   - **Farm Owners (Self-Signup):**
     - User signs up with email/password or Google OAuth providing `org_name`.
     - Database trigger `handle_new_user()` creates an `organizations` record, assigns `role = 'owner'`, and marks `profiles.is_approved = false`.
     - Owner is locked in `PendingApprovalPage` until Super Admin approves them via `SuperAdminDashboard`.
   - **Invited Staff Members:**
     - User is invited/created by Farm Owner with `organization_id` and assigned role (`manager`, `supervisor`, `worker`).
     - Initial state is `is_approved = false` until Farm Owner approves the member in `SettingsPage`.
3. **Session Invalidation:**
   - Rejected or suspended users have their profiles updated to `is_approved = false` or deleted, revoking route access and RLS authorization.

---

## 2. Authorization Model & Role Hierarchy

```
Super Admin (Platform Level)
     │ (Cross-tenant oversight & farm approval)
     ▼
Owner / Admin (Tenant Level)
     │ (Manage settings, team, approvals, roles, all operations)
     ▼
Manager
     │ (Manage sites, beds, warehouse, grinding, shipments, inventory, workers, payroll)
     ▼
Site Supervisor
     │ (View sites, assign/turn beds, view lots, log work)
     ▼
Worker
     │ (Read assigned beds, log daily work)
```

### Authorization Primitives (Service Layer)
- `requireAuthenticatedUser()`: Ensures non-null Supabase session.
- `requireApprovedUser()`: Ensures `is_approved = true`.
- `requireRole(requiredRole)`: Verifies role membership via `user_roles`.
- `requireMinRole(minRole)`: Evaluates role hierarchy level.

---

## 3. Row-Level Security (RLS) Policy Matrix

| Table Name | SELECT Policy | INSERT Policy | UPDATE Policy | DELETE Policy |
|---|---|---|---|---|
| `organizations` | `id = get_user_org_id(auth.uid())` OR `is_super_admin()` | Super Admin / System Trigger | `has_role(owner)` (own org) | None (Admin only) |
| `profiles` | Org members OR `is_super_admin()` | Trigger on auth signup | `auth.uid() = user_id` (trigger blocks privileged cols) | Super Admin / Owner via Function |
| `user_roles` | Org members OR `is_super_admin()` | `has_role(owner)` | `has_role(owner)` | `has_role(owner)` |
| `sites` | Org members | `has_role(owner, manager)` | `has_role(owner, manager)` | `has_role(owner, manager)` |
| `blocks` | Org members | `has_role(owner, manager)` | `has_role(owner, manager)` | `has_role(owner, manager)` |
| `beds` | Org members | `has_role(owner, manager)` | `has_role(owner, manager)` | `has_role(owner, manager)` |
| `lots` | Org members | `has_role(owner, manager)` | `has_role(owner, manager)` | None (Soft delete / Void) |
| `bed_assignments` | Org members | `has_role(owner, manager, supervisor)` | `has_role(owner, manager, supervisor)` | None (Immutable history) |
| `bed_activity_logs` | Org members | `performed_by = auth.uid()` | None (Immutable) | None (Immutable) |
| `grinding_batches` | Org members | `has_role(owner, manager)` | `has_role(owner, manager)` | None |
| `shipments` | Org members | `has_role(owner, manager)` | `has_role(owner, manager)` | None |
| `inventory_items` | Org members | `has_role(owner, manager)` | `has_role(owner, manager)` | `has_role(owner, manager)` |
| `inventory_movements`| Org members | `has_role(owner, manager)` | None (Immutable ledger) | None (Immutable ledger) |
| `workers` | Org members | `has_role(owner, manager)` | `has_role(owner, manager)` | `has_role(owner, manager)` |
| `work_logs` | Org members | Org members (`has_role(worker+)`) | `has_role(owner, manager)` | `has_role(owner, manager)` |
| `payroll` | Org members | `has_role(owner, manager)` | `has_role(owner, manager)` | None (Audited) |
| `notifications` | `user_id = auth.uid()` | System Triggers | `user_id = auth.uid()` (mark read) | None |
| `audit_logs` | `has_role(owner, manager)` OR `is_super_admin()` | Authenticated (matching user_id) | None (Append-only) | None (Append-only) |

---

## 4. Privilege Escalation Defense: Profile Guard Trigger

To remediate SEC-01, the database installs an authoritative trigger:
```sql
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- Disallow non-super admins from changing is_super_admin, is_approved, or organization_id
  IF NOT public.is_super_admin(auth.uid()) AND current_user != 'service_role' THEN
    IF NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin THEN
      RAISE EXCEPTION 'Unauthorized attempt to alter is_super_admin';
    END IF;
    IF NEW.is_approved IS DISTINCT FROM OLD.is_approved THEN
      RAISE EXCEPTION 'Unauthorized attempt to alter is_approved';
    END IF;
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'Unauthorized attempt to alter organization_id';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_protect_profile_privileged_fields
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileged_fields();
```

---

## 5. MCP & AI Agent Threat Model

1. **Attack: Client attempts write operations via MCP.**
   - *Mitigation:* The MCP tool definitions in `src/lib/mcp/` and `supabase/functions/mcp/` only define read tools with `readOnlyHint: true`. No write handlers or mutation schemas exist.
2. **Attack: AI agent retrieves unauthorized tenant data.**
   - *Mitigation:* MCP handler requires the caller's OAuth user token (`ctx.getToken()`). Queries execute through `createClient(..., { global: { headers: { Authorization: Bearer token } } })`. RLS automatically filters all records to `organization_id = get_user_org_id(token.user_id)`.
3. **Attack: AI agent leaks sensitive payroll or wage information.**
   - *Mitigation:* Tool `list_workers` is explicitly sanitized to exclude `wage_rate` and `wage_type`.

---

## 6. Authoritative Fail-Closed Stored Procedures (20260316000000)

Workflow tables (`lots`, `bed_assignments`, `grinding_batches`, `shipments`, `inventory_movements`, `payroll`, `addis_hub_inventory`, `djibouti_dispatches`) are set to read-only via RLS for regular client sessions. Direct mutations are revoked.

All state transitions execute atomically through `SECURITY DEFINER` stored procedures:
- `fn_create_lot`: Server-generated lot numbers, positive weights, supports purchased dry coffee.
- `fn_assign_bed`: Enforces single active bed assignment, capacity limits, tenant validation.
- `fn_finish_drying`: Atomically completes drying, sets dry parchment weight, moves lot to hulling readiness.
- `fn_merge_lots`: Validates >= 2 distinct tenant lots, marks parents `merged`, prevents reuse.
- `fn_start_grinding` & `fn_complete_grinding`: Enforces ground weight <= input dry weight, calculates yield and loss server-side.
- `fn_create_shipment` & `fn_update_shipment_status`: Enforces sequential state machine and server-generated shipment numbers.
- `fn_record_inventory_movement`: Immutable ledger entry, prevents negative warehouse balance.
- `fn_generate_payroll` & `fn_approve_payroll`: Generates entries from verified work logs, locks payroll upon owner approval.
- `fn_receive_at_addis_hub` & `fn_dispatch_to_djibouti`: Central consolidation check-in and Doraleh Port maritime container tracking.

## 7. Audit Log Immutability & Client-Side Safety

1. **Immutable Audit Trail:** Trigger `prevent_audit_log_modification` rejects any `UPDATE` or `DELETE` on `public.audit_logs`.
2. **CSV Formula Injection Mitigation:** All CSV report export columns are sanitized via `sanitizeCSVCell()` which detects and prepends a single quote (`'`) to strings beginning with `=, +, -, @, \t, \r`.
3. **Suspended Organization Lockout:** The helper function `is_org_subscription_active()` gates access across all workflow RPCs, blocking access for non-active tenant subscriptions at the database level.

