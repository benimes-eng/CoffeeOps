# CoffeeOps Operations, Deployment & Disaster Recovery

## 1. Environment Topology

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│   Development   │       │     Staging     │       │   Production    │
│  (Local Vite +  │ ────► │  (Preview PRs + │ ────► │  (Custom Domain │
│ Supabase Local) │       │ Staging DB URL) │       │   Production DB)│
└─────────────────┘       └─────────────────┘       └─────────────────┘
```

### Required Environment Variables
- `VITE_SUPABASE_URL`: HTTPS endpoint of Supabase project.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: Public anonymous/publishable JWT key.
- `VITE_SUPABASE_PROJECT_ID`: Supabase project reference identifier.

### Server-Only Secrets (Edge Functions & CI)
- `SUPABASE_SERVICE_ROLE_KEY`: Service role secret key (NEVER exposed to browser client).
- `SUPABASE_DB_URL`: PostgreSQL connection string for migrations.

---

## 2. Migration Discipline

1. **Version Controlled Migrations:**
   All database schema changes, triggers, policies, and RPCs are stored in `supabase/migrations/<timestamp>_<description>.sql`.
2. **Migration Safety Protocol:**
   - Never run raw `DROP TABLE` or `DROP COLUMN` in production without a verified data retention/deprecation cycle.
   - All migrations must be idempotent or guarded with `IF NOT EXISTS` / `CREATE OR REPLACE`.
   - Before applying migrations to production, execute on a cloned staging database.

---

## 3. Disaster Recovery & Backups

1. **Recovery Objectives:**
   - **RPO (Recovery Point Objective):** $\le 1\text{ hour}$ (Point-in-time recovery WAL archiving enabled on Supabase).
   - **RTO (Recovery Time Objective):** $\le 30\text{ minutes}$ for service restoration from automated daily snapshot.
2. **Automated Daily Backups:**
   - Physical backups taken every 24 hours.
   - Retained for 30 days minimum.
3. **Restoration Procedure:**
   1. Access Supabase management dashboard or execute CLI command `supabase db restore <backup_id>`.
   2. Verify schema integrity and foreign keys.
   3. Run test queries on `organizations`, `lots`, `bed_assignments`.
   4. Reroute frontend DNS / environment URL to restored instance.

---

## 4. Health Checks & Observability

1. **Health Check Endpoint:**
   - Health check function checks database ping, current migration version, and authentication availability without leaking infrastructure credentials.
2. **Client-Side Observability:**
   - TanStack Query global error cache logs unexpected network/server errors to console.
   - Audit logging captures high-risk security actions (`approve_user`, `reject_user`, `assign_role`, `merge_lots`, `shipment_confirmed`).
