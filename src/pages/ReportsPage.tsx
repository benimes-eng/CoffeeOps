import { useState } from "react";
import { FileDown, Filter, Loader2 } from "lucide-react";
import { useOrg } from "@/hooks/use-org";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  DateRange,
  fetchDryingReport,
  fetchPayrollReport,
  fetchIntakeReport,
  fetchInventoryReport,
  fetchProductionReport,
  fetchWorkerPerformanceReport,
  exportCSV,
  exportPDF,
} from "@/services/reportService";

const reportTypes = [
  { key: "drying", title: "Drying Report", desc: "Bed utilization and drying lifecycle summary", fetcher: fetchDryingReport },
  { key: "payroll", title: "Payroll Report", desc: "Worker wages and cost per KG breakdown", fetcher: fetchPayrollReport },
  { key: "intake", title: "Intake Report", desc: "Cherry intake volumes by region and date", fetcher: fetchIntakeReport },
  { key: "inventory", title: "Inventory Report", desc: "Equipment and consumables status", fetcher: fetchInventoryReport },
  { key: "production", title: "Production Report", desc: "End-to-end production metrics", fetcher: fetchProductionReport },
  { key: "worker", title: "Worker Performance", desc: "Individual worker activity summary", fetcher: fetchWorkerPerformanceReport },
] as const;

const ReportsPage = () => {
  const { orgId, orgName } = useOrg();
  const [dateRange, setDateRange] = useState<DateRange>("30");
  const [siteId, setSiteId] = useState("all");
  const [exporting, setExporting] = useState<string | null>(null);

  const { data: sites } = useQuery({
    queryKey: ["report-sites", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase.from("sites").select("id, name").eq("organization_id", orgId);
      return data ?? [];
    },
    enabled: !!orgId,
  });

  const { data: lots } = useQuery({
    queryKey: ["report-lots", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase.from("lots").select("id, lot_number").eq("organization_id", orgId).order("lot_number");
      return data ?? [];
    },
    enabled: !!orgId,
  });

  const handleExport = async (
    reportKey: string,
    format: "pdf" | "csv",
    fetcher: (filters: any) => Promise<any>,
    title: string
  ) => {
    if (!orgId) {
      toast.error("Organization not found");
      return;
    }

    const exportId = `${reportKey}-${format}`;
    setExporting(exportId);

    try {
      const result = await fetcher({ orgId, dateRange, siteId: siteId !== "all" ? siteId : undefined });

      if (!result.rows.length) {
        toast.warning("No data found for the selected filters");
        return;
      }

      if (format === "csv") {
        exportCSV(title, result.headers, result.rows);
      } else {
        exportPDF(title, result.headers, result.rows, result.summary, orgName ?? undefined);
      }

      toast.success(`${title} exported as ${format.toUpperCase()}`);
    } catch (err: any) {
      console.error(err);
      toast.error(`Export failed: ${err.message}`);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif text-foreground">Reports</h1>
          <p className="text-muted-foreground mt-1">Generate and export operational reports</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-xl p-5 card-shadow border border-border/50">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Report Filters</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5 font-medium">Date Range</label>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as DateRange)}
              className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5 font-medium">Site</label>
            <select
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="all">All Sites</option>
              {sites?.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5 font-medium">Batch</label>
            <select className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="all">All Batches</option>
              {lots?.map((l) => (
                <option key={l.id} value={l.id}>{l.lot_number}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Report Types */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {reportTypes.map((report) => {
          const pdfId = `${report.key}-pdf`;
          const csvId = `${report.key}-csv`;
          return (
            <div key={report.key} className="bg-card rounded-xl p-5 card-shadow border border-border/50 flex flex-col justify-between">
              <div className="mb-4">
                <h4 className="font-serif text-lg text-foreground">{report.title}</h4>
                <p className="text-sm text-muted-foreground mt-1">{report.desc}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleExport(report.key, "pdf", report.fetcher, report.title)}
                  disabled={exporting === pdfId}
                  className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {exporting === pdfId ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileDown className="w-3 h-3" />}
                  PDF
                </button>
                <button
                  onClick={() => handleExport(report.key, "csv", report.fetcher, report.title)}
                  disabled={exporting === csvId}
                  className="flex items-center gap-1.5 px-3 py-2 bg-muted text-foreground rounded-lg text-xs font-medium hover:bg-muted/80 transition-colors disabled:opacity-50"
                >
                  {exporting === csvId ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileDown className="w-3 h-3" />}
                  CSV
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ReportsPage;
