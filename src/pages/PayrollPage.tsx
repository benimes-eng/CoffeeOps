import { useState } from "react";
import { DollarSign, Check, Plus } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { useToast } from "@/hooks/use-toast";
import { useOrg } from "@/hooks/use-org";
import { format } from "date-fns";

const PayrollPage = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { orgId } = useOrg();
  const [showAdd, setShowAdd] = useState(false);
  const [workerId, setWorkerId] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [totalHours, setTotalHours] = useState("");
  const [totalPay, setTotalPay] = useState("");

  const { data: payrolls, isLoading } = useQuery({
    queryKey: ["payroll"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payroll")
        .select("*, worker:workers!payroll_worker_id_fkey(name, wage_type, wage_rate)")
        .order("period_start", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: workers } = useQuery({
    queryKey: ["workers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("workers").select("*").eq("status", "active").order("name");
      if (error) throw error;
      return data;
    },
  });

  const createPayroll = useMutation({
    mutationFn: async () => {
      if (!workerId || !periodStart || !periodEnd || !orgId) throw new Error("All fields required");
      const { error } = await supabase.from("payroll").insert({
        worker_id: workerId,
        period_start: periodStart,
        period_end: periodEnd,
        total_hours: Number(totalHours) || 0,
        total_pay: Number(totalPay) || 0,
        organization_id: orgId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll"] });
      toast({ title: "Payroll entry created" });
      closeDialog();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleApproval = useMutation({
    mutationFn: async ({ id, approved }: { id: string; approved: boolean }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("payroll").update({
        approved: !approved,
        approved_by: !approved ? user?.id || null : null,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const closeDialog = () => {
    setShowAdd(false);
    setWorkerId("");
    setPeriodStart("");
    setPeriodEnd("");
    setTotalHours("");
    setTotalPay("");
  };

  const totalWages = payrolls?.reduce((a, b) => a + Number(b.total_pay), 0) || 0;
  const pending = payrolls?.filter((p) => !p.approved).length || 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif text-foreground">Payroll</h1>
          <p className="text-muted-foreground mt-1">Weekly payroll management</p>
        </div>
        <Button onClick={() => setShowAdd(true)} className="gap-2">
          <Plus className="w-4 h-4" /> New Entry
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard title="Total Wages" value={`ETB ${totalWages.toLocaleString()}`} icon={<DollarSign className="w-4 h-4" />} />
        <MetricCard title="Entries" value={payrolls?.length || 0} />
        <MetricCard title="Pending Approval" value={pending} />
      </div>

      <div className="bg-card rounded-xl card-shadow border border-border/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Worker</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Period</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Hours</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pay (ETB)</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Approved</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">Loading...</td></tr>
              ) : payrolls && payrolls.length > 0 ? (
                payrolls.map((row) => (
                  <tr key={row.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-3.5 text-sm font-medium">{(row.worker as any)?.name || "—"}</td>
                    <td className="px-5 py-3.5 text-sm">
                      {format(new Date(row.period_start), "MMM dd")} — {format(new Date(row.period_end), "MMM dd, yyyy")}
                    </td>
                    <td className="px-5 py-3.5 text-sm">{Number(row.total_hours) || "—"}</td>
                    <td className="px-5 py-3.5 text-sm font-medium">{Number(row.total_pay).toLocaleString()}</td>
                    <td className="px-5 py-3.5">
                      <button
                        onClick={() => toggleApproval.mutate({ id: row.id, approved: row.approved })}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                          row.approved ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                        }`}
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">No payroll entries yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={showAdd} onOpenChange={(v) => !v && closeDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">New Payroll Entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Worker</Label>
              <Select value={workerId} onValueChange={setWorkerId}>
                <SelectTrigger><SelectValue placeholder="Select worker" /></SelectTrigger>
                <SelectContent>
                  {workers?.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Period Start</Label>
                <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Period End</Label>
                <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Total Hours</Label>
                <Input type="number" value={totalHours} onChange={(e) => setTotalHours(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Total Pay (KES)</Label>
                <Input type="number" value={totalPay} onChange={(e) => setTotalPay(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button onClick={() => createPayroll.mutate()} disabled={createPayroll.isPending}>
              {createPayroll.isPending ? "Creating..." : "Create Entry"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PayrollPage;
