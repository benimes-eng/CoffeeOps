# CoffeeOps System Documentation (PDF)

Produce a single, print-ready PDF that documents the app end to end — for both farm staff and technical readers — and deliver it as a downloadable file.

## What the document covers

**Part 1 — Overview**
- What CoffeeOps is, who uses it, and the coffee post-harvest journey it manages
- End-to-end flow diagram: Intake (Lot) → Bed Assignment → Drying → Warehouse → Grinding → Shipment
- Glossary (Site, Block, Bed, Lot, Batch, drying phase colours, ETB)

**Part 2 — User guide, screen by screen**
For each module: purpose, who can access it, step-by-step actions, and what the numbers mean.
- Sign up / sign in (email + Google), organization creation, pending-approval gate
- Dashboard: KPIs, shipment status indicators, activity timeline
- Sites & Fields: creating Sites → Blocks → Beds, bulk utilities, auto-calculated surface area
- Bed Management: filters, density (KG/m²), capacity KPIs, colour legend, smart lot assignment, bed detail panel, batch view
- Warehouse: intake, status transitions, batch merge, weight traceability
- Grinding and Shipments
- Workers, Payroll, Inventory
- Reports (PDF/CSV exports), Notifications, Audit Log
- Settings and user management (approving members, assigning roles)
- Super Admin platform dashboard: approving farm owners, cross-tenant oversight

**Part 3 — Roles and permissions**
- Role hierarchy (Admin/owner, Manager, Site Owner/supervisor, Worker) and the exact route-access matrix
- Two-tier approval flow: Super Admin approves Farm Owners; Owners approve members

**Part 4 — Technical appendix**
- Architecture: React + Vite frontend, Lovable Cloud backend, multi-tenant isolation by organization
- Data model: the 18 tables (organizations, profiles, user_roles, sites, blocks, beds, bed_assignments, bed_activity_logs, lots, grinding_batches, shipments, inventory_items, inventory_movements, workers, work_logs, payroll, notifications, audit_logs) with their relationships
- Security model: RLS, helper functions (`has_role`, `get_user_org_id`, `is_super_admin`), roles stored separately from profiles
- Edge functions (`manage-users`, `mcp`) and the agent integration / MCP server with its 7 read tools and OAuth consent flow
- Calculated/derived fields and rules (e.g. bed surface area is auto-calculated, never edited manually)

## How it will be built

A Python script using ReportLab generates the PDF: cover page, table of contents, numbered sections, styled tables for the permission matrix and data model, and ASCII/vector flow diagrams for the process pipeline. Styling matches the app's earth-tone palette and rounded, clean layout. Content is derived by reading the actual pages, hooks, services, and database schema so the steps match the real UI.

Every page is then rendered to an image and visually inspected for clipped text, overflowing tables, and layout issues before delivery.

## Deliverable

`CoffeeOps-Documentation.pdf` saved to your documents, previewable and downloadable directly from chat. No application code is changed.
