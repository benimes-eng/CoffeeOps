import { useState } from "react";
import { Plus, Users, Pencil } from "lucide-react";
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
import { useRole } from "@/hooks/use-role";
import { Constants } from "@/integrations/supabase/types";

const statusBadge: Record<string, string> = {
  active: "bg-success/10 text-success",
  on_leave: "bg-warning/10 text-warning",
  terminated: "bg-destructive/10 text-destructive",
};

const WorkersPage = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { orgId } = useOrg();
  const { hasMinRole } = useRole();
  const canManage = hasMinRole("manager");
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [wageType, setWageType] = useState<string>("daily");
  const [wageRate, setWageRate] = useState("");
  const [status, setStatus] = useState<string>("active");

  const { data: workers, isLoading } = useQuery({
    queryKey: ["workers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("workers").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim() || !orgId) throw new Error("Name is required");
      const payload = {
        name: name.trim(),
        role: role.trim() || null,
        wage_type: wageType as any,
        wage_rate: Number(wageRate) || 0,
        status: status as any,
      };
      if (editId) {
        const { error } = await supabase.from("workers").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("workers").insert({ ...payload, organization_id: orgId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workers"] });
      toast({ title: editId ? "Worker updated" : "Worker added" });
      closeDialog();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const closeDialog = () => {
    setShowAdd(false);
    setEditId(null);
    setName("");
    setRole("");
    setWageType("daily");
    setWageRate("");
    setStatus("active");
  };

  const openEdit = (w: any) => {
    setEditId(w.id);
    setName(w.name);
    setRole(w.role || "");
    setWageType(w.wage_type);
    setWageRate(String(w.wage_rate));
    setStatus(w.status);
    setShowAdd(true);
  };

  const active = workers?.filter((w) => w.status === "active").length || 0;
  const onLeave = workers?.filter((w) => w.status === "on_leave").length || 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif text-foreground">Workers</h1>
          <p className="text-muted-foreground mt-1">Manage farm workers</p>
        </div>
        {canManage && (
          <Button onClick={() => setShowAdd(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Add Worker
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard title="Total Workers" value={workers?.length || 0} icon={<Users className="w-4 h-4" />} />
        <MetricCard title="Active Today" value={active} />
        <MetricCard title="On Leave" value={onLeave} />
      </div>

      <div className="bg-card rounded-xl card-shadow border border-border/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Role</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Wage Type</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Rate</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">Loading...</td></tr>
              ) : workers && workers.length > 0 ? (
                workers.map((w) => (
                  <tr key={w.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-3.5 text-sm font-medium flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <Users className="w-4 h-4 text-primary" />
                      </div>
                      {w.name}
                    </td>
                    <td className="px-5 py-3.5 text-sm">{w.role || "—"}</td>
                    <td className="px-5 py-3.5 text-sm capitalize">{w.wage_type}</td>
                    <td className="px-5 py-3.5 text-sm">{Number(w.wage_rate).toLocaleString()}</td>
                    <td className="px-5 py-3.5">
                      <span className={`status-badge ${statusBadge[w.status] || "bg-muted text-muted-foreground"}`}>
                        {w.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      {canManage && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(w)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">No workers yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={showAdd} onOpenChange={(v) => !v && closeDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">{editId ? "Edit Worker" : "Add Worker"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Input placeholder="e.g. Bed Operator" value={role} onChange={(e) => setRole(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Wage Type</Label>
                <Select value={wageType} onValueChange={setWageType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Constants.public.Enums.wage_type.map((t) => (
                      <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Rate (ETB)</Label>
                <Input type="number" placeholder="0" value={wageRate} onChange={(e) => setWageRate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Constants.public.Enums.worker_status.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">{s.replace("_", " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Saving..." : editId ? "Update" : "Add Worker"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WorkersPage;
