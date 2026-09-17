import { useState } from "react";
import { DollarSign, Check, Plus, Calendar, Calculator, Clock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  usePayroll,
  useWorkLogs,
  useGeneratePayroll,
  useTogglePayrollApproval,
} from "@/hooks/usePayroll";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { format, subDays } from "date-fns";

const PayrollPage = () => {
  const [showGenerate, setShowGenerate] = useState(false);
  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  const [periodStart, setPeriodStart] = useState(format(subDays(new Date(), 7), "yyyy-MM-dd"));
  const [periodEnd, setPeriodEnd] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data: payrolls, isLoading } = usePayroll();
  const generatePayroll = useGeneratePayroll();
  const toggleApproval = useTogglePayrollApproval();

  const { data: workers } = useQuery({
    queryKey: ["workers-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workers")
        .select("*")
        .eq("status", "active")
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const handleGenerate = () => {
    if (!selectedWorkerId || !periodStart || !periodEnd) return;
    generatePayroll.mutate(
      {
        workerId: selectedWorkerId,
        periodStart,
        periodEnd,
      },
      {
        onSuccess: () => {
          setShowGenerate(false);
          setSelectedWorkerId("");
        },
      }
    );
  };

  const totalWages = (payrolls || []).reduce((a, b) => a + Number(b.total_pay), 0);
  const pending = (payrolls || []).filter((p) => !p.approved).length;
  const approved = (payrolls || []).filter((p) => p.approved).length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif text-foreground">Worker Payroll</h1>
          <p className="text-muted-foreground mt-1">
            Automated wage computation derived authoritatively from daily work logs (ETB)
          </p>
        </div>
        <Button onClick={() => setShowGenerate(true)} className="gap-2">
          <Calculator className="w-4 h-4" /> Compute & Generate Period Payroll
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          title="Total Wages Processed"
          value={`ETB ${totalWages.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
          icon={<DollarSign className="w-4 h-4" />}
        />
        <MetricCard title="Approved Statements" value={approved} />
        <MetricCard title="Pending Final Approval" value={pending} />
      </div>

      <div className="bg-card rounded-xl card-shadow border border-border/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Worker
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Pay Period
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Total Logged Hours
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Wage Type & Rate
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Calculated Pay (ETB)
                </th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Approval Status
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">
                    Loading payroll entries...
                  </td>
                </tr>
              ) : payrolls && payrolls.length > 0 ? (
                payrolls.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-border/50 hover:bg-muted/20 transition-colors"
                  >
                    <td className="px-5 py-3.5 text-sm font-medium">
                      {row.worker?.name || "—"}
                      <span className="block text-xs text-muted-foreground font-normal">
                        {row.worker?.role || "Field Operator"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-sm">
                      {format(new Date(row.period_start), "MMM dd")} —{" "}
                      {format(new Date(row.period_end), "MMM dd, yyyy")}
                    </td>
                    <td className="px-5 py-3.5 text-sm font-mono">
                      {Number(row.total_hours) > 0 ? `${Number(row.total_hours).toFixed(1)} hrs` : "—"}
                    </td>
                    <td className="px-5 py-3.5 text-sm capitalize">
                      {row.worker?.wage_type || "daily"} (ETB {Number(row.worker?.wage_rate || 0).toLocaleString()})
                    </td>
                    <td className="px-5 py-3.5 text-sm font-semibold">
                      ETB {Number(row.total_pay).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <Button
                        size="sm"
                        variant={row.approved ? "default" : "outline"}
                        className={`h-8 gap-1.5 text-xs ${
                          row.approved ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""
                        }`}
                        onClick={() =>
                          toggleApproval.mutate({ id: row.id, approved: row.approved })
                        }
                        disabled={toggleApproval.isPending}
                      >
                        <Check className="w-3.5 h-3.5" />
                        {row.approved ? "Approved & Locked" : "Review & Approve"}
                      </Button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">
                    No payroll statements generated yet. Click "Compute & Generate" to calculate wages from work logs.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Generate Payroll Dialog */}
      <Dialog open={showGenerate} onOpenChange={setShowGenerate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">Compute Payroll from Work Logs</DialogTitle>
            <DialogDescription>
              Select a worker and date period. The system aggregates all verified hours from work logs and computes deterministic wages in ETB.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Worker</Label>
              <Select value={selectedWorkerId} onValueChange={setSelectedWorkerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select active worker" />
                </SelectTrigger>
                <SelectContent>
                  {(workers || []).map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name} ({w.wage_type} • ETB {Number(w.wage_rate).toLocaleString()})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Period Start</Label>
                <Input
                  type="date"
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Period End</Label>
                <Input
                  type="date"
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenerate(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleGenerate}
              disabled={!selectedWorkerId || generatePayroll.isPending}
              className="gap-2"
            >
              <Calculator className="w-4 h-4" />
              {generatePayroll.isPending ? "Calculating..." : "Generate Statement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PayrollPage;
