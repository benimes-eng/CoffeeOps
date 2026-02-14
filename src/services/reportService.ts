import { supabase } from "@/integrations/supabase/client";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export type DateRange = "7" | "30" | "90" | "custom";

interface ReportFilters {
  orgId: string;
  dateRange: DateRange;
  siteId?: string;
  batchId?: string;
}

function getDateFrom(range: DateRange): string {
  const d = new Date();
  d.setDate(d.getDate() - Number(range));
  return d.toISOString();
}

// ── Drying Report ──
export async function fetchDryingReport(filters: ReportFilters) {
  const since = getDateFrom(filters.dateRange);
  const { data: beds } = await supabase
    .from("beds")
    .select("id, bed_number, status, length, width, surface_area, block_id, blocks(name, site_id, sites(name))")
    .eq("organization_id", filters.orgId);

  const { data: assignments } = await supabase
    .from("bed_assignments")
    .select("*, lots(lot_number, region), beds(bed_number)")
    .eq("organization_id", filters.orgId)
    .gte("assigned_date", since);

  const rows = (assignments ?? []).map((a: any) => ({
    bed: a.beds?.bed_number ?? "-",
    lot: a.lots?.lot_number ?? "-",
    region: a.lots?.region ?? "-",
    weight: a.assigned_weight,
    density: a.density_used,
    assigned: new Date(a.assigned_date).toLocaleDateString(),
    status: a.is_active ? "Active" : "Completed",
  }));

  const summary = {
    totalBeds: beds?.length ?? 0,
    occupied: beds?.filter((b: any) => b.status === "occupied").length ?? 0,
    empty: beds?.filter((b: any) => b.status === "empty").length ?? 0,
    maintenance: beds?.filter((b: any) => b.status === "maintenance").length ?? 0,
    activeAssignments: assignments?.filter((a: any) => a.is_active).length ?? 0,
  };

  return { rows, summary, headers: ["Bed", "Lot", "Region", "Weight (KG)", "Density", "Assigned", "Status"] };
}

// ── Payroll Report ──
export async function fetchPayrollReport(filters: ReportFilters) {
  const since = getDateFrom(filters.dateRange);
  const { data } = await supabase
    .from("payroll")
    .select("*, workers(name, role, wage_type, wage_rate)")
    .eq("organization_id", filters.orgId)
    .gte("period_start", since.split("T")[0]);

  const rows = (data ?? []).map((p: any) => ({
    worker: p.workers?.name ?? "-",
    role: p.workers?.role ?? "-",
    period: `${p.period_start} → ${p.period_end}`,
    hours: p.total_hours,
    pay: p.total_pay,
    approved: p.approved ? "Yes" : "No",
  }));

  const totalPay = rows.reduce((s, r) => s + Number(r.pay), 0);
  return { rows, summary: { totalPay, records: rows.length }, headers: ["Worker", "Role", "Period", "Hours", "Pay (KES)", "Approved"] };
}

// ── Intake Report ──
export async function fetchIntakeReport(filters: ReportFilters) {
  const since = getDateFrom(filters.dateRange);
  const { data } = await supabase
    .from("lots")
    .select("*")
    .eq("organization_id", filters.orgId)
    .gte("intake_date", since.split("T")[0]);

  const rows = (data ?? []).map((l) => ({
    lot: l.lot_number,
    region: l.region,
    intake: l.intake_date,
    initial: l.initial_weight,
    current: l.current_weight,
    status: l.status,
  }));

  const totalWeight = rows.reduce((s, r) => s + Number(r.initial), 0);
  return { rows, summary: { totalWeight, lots: rows.length }, headers: ["Lot #", "Region", "Intake Date", "Initial (KG)", "Current (KG)", "Status"] };
}

// ── Inventory Report ──
export async function fetchInventoryReport(filters: ReportFilters) {
  const { data } = await supabase
    .from("inventory_items")
    .select("*")
    .eq("organization_id", filters.orgId);

  const rows = (data ?? []).map((i) => ({
    name: i.name,
    category: i.category,
    quantity: i.quantity,
    unit: i.unit ?? "-",
    status: i.status ?? "-",
    location: i.location ?? "-",
  }));

  return { rows, summary: { totalItems: rows.length }, headers: ["Name", "Category", "Quantity", "Unit", "Status", "Location"] };
}

// ── Production Report ──
export async function fetchProductionReport(filters: ReportFilters) {
  const since = getDateFrom(filters.dateRange);
  const { data: lots } = await supabase
    .from("lots")
    .select("*")
    .eq("organization_id", filters.orgId)
    .gte("intake_date", since.split("T")[0]);

  const { data: assignments } = await supabase
    .from("bed_assignments")
    .select("assigned_weight, is_active, completed_at")
    .eq("organization_id", filters.orgId)
    .gte("assigned_date", since);

  const totalIntake = (lots ?? []).reduce((s, l) => s + Number(l.initial_weight), 0);
  const totalDrying = (assignments ?? []).filter((a: any) => a.is_active).reduce((s: number, a: any) => s + Number(a.assigned_weight), 0);
  const completed = (assignments ?? []).filter((a: any) => !a.is_active).length;

  const rows = (lots ?? []).map((l) => ({
    lot: l.lot_number,
    region: l.region,
    initial: l.initial_weight,
    current: l.current_weight,
    loss: `${(((Number(l.initial_weight) - Number(l.current_weight)) / Number(l.initial_weight)) * 100).toFixed(1)}%`,
    status: l.status,
  }));

  return {
    rows,
    summary: { totalIntake, totalDrying, completed, activeLots: (lots ?? []).length },
    headers: ["Lot #", "Region", "Initial (KG)", "Current (KG)", "Weight Loss", "Status"],
  };
}

// ── Worker Performance Report ──
export async function fetchWorkerPerformanceReport(filters: ReportFilters) {
  const since = getDateFrom(filters.dateRange);
  const { data } = await supabase
    .from("work_logs")
    .select("*, workers(name, role)")
    .eq("organization_id", filters.orgId)
    .gte("date", since.split("T")[0]);

  // Group by worker
  const grouped: Record<string, { name: string; role: string; hours: number; activities: number }> = {};
  (data ?? []).forEach((wl: any) => {
    const id = wl.worker_id;
    if (!grouped[id]) grouped[id] = { name: wl.workers?.name ?? "-", role: wl.workers?.role ?? "-", hours: 0, activities: 0 };
    grouped[id].hours += Number(wl.hours_worked);
    grouped[id].activities += 1;
  });

  const rows = Object.values(grouped).map((w) => ({
    worker: w.name,
    role: w.role,
    totalHours: w.hours.toFixed(1),
    activities: w.activities,
    avgHours: (w.hours / w.activities).toFixed(1),
  }));

  return { rows, summary: { totalWorkers: rows.length }, headers: ["Worker", "Role", "Total Hours", "Activities", "Avg Hours/Activity"] };
}

// ── CSV Export ──
export function exportCSV(title: string, headers: string[], rows: Record<string, any>[]) {
  const keys = Object.keys(rows[0] ?? {});
  const csv = [
    headers.join(","),
    ...rows.map((r) => keys.map((k) => `"${r[k]}"`).join(",")),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── PDF Export ──
export function exportPDF(
  title: string,
  headers: string[],
  rows: Record<string, any>[],
  summary?: Record<string, any>,
  orgName?: string
) {
  const doc = new jsPDF();
  const keys = Object.keys(rows[0] ?? {});

  // Header
  doc.setFontSize(18);
  doc.text(title, 14, 20);
  doc.setFontSize(10);
  doc.setTextColor(100);
  if (orgName) doc.text(orgName, 14, 27);
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, orgName ? 33 : 27);

  // Summary
  let startY = orgName ? 40 : 34;
  if (summary) {
    doc.setFontSize(11);
    doc.setTextColor(0);
    const summaryText = Object.entries(summary)
      .map(([k, v]) => `${k.replace(/([A-Z])/g, " $1").trim()}: ${v}`)
      .join("  |  ");
    doc.text(summaryText, 14, startY);
    startY += 8;
  }

  // Table
  autoTable(doc, {
    startY,
    head: [headers],
    body: rows.map((r) => keys.map((k) => String(r[k]))),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [30, 70, 50] },
  });

  doc.save(`${title.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.pdf`);
}
