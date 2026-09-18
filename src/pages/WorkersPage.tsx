import { ResetModuleButton } from "@/components/common/ResetModuleButton";
import { useState } from "react";
import { Plus, Users, Pencil, Trash2, Clock, Calendar, CheckCircle2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { useToast } from "@/hooks/use-toast";
import { useOrg } from "@/hooks/use-org";
import { useRole } from "@/hooks/use-role";
import { Constants } from "@/integrations/supabase/types";
import type { Database } from "@/integrations/supabase/types";
import { useWorkLogs, useRecordWorkLog } from "@/hooks/usePayroll";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type WorkerRow = Database["public"]["Tables"]["workers"]["Row"];
type WorkLogRow = Database["public"]["Tables"]["work_logs"]["Row"] & {
  workers?: { name: string; role: string | null } | null;
};

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

  // Worker Modal State
  const [showAdd, setShowAdd] = useState(false);
  const [showDeleteWorker, setShowDeleteWorker] = useState<WorkerRow | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [wageType, setWageType] = useState<Database["public"]["Enums"]["wage_type"]>("daily");
  const [wageRate, setWageRate] = useState("");
  const [status, setStatus] = useState<Database["public"]["Enums"]["worker_status"]>("active");

  // Work Log Modal State
  const [showLogWork, setShowLogWork] = useState(false);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>("");
  const [activityType, setActivityType] = useState("Drying bed turning");
  const [hoursWorked, setHoursWorked] = useState("8");
  const [logDate, setLogDate] = useState(new Date().toISOString().split("T")[0]);

  const { data: workers, isLoading } = useQuery({
    queryKey: ["workers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("workers").select("*").order("name");
      if (error) throw error;
      return (data || []) as WorkerRow[];
    },
  });

  const { data: workLogs, isLoading: loadingLogs } = useWorkLogs();
  const recordWork = useRecordWorkLog();

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim() || !orgId) throw new Error("Name is required");
      const payload = {
        name: name.trim(),
        role: role.trim() || null,
        wage_type: wageType,
        wage_rate: Number(wageRate) || 0,
        status,
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
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteWorker = useMutation({
    mutationFn: async (workerId: string) => {
      const { error } = await supabase.from("workers").delete().eq("id", workerId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workers"] });
      toast({ title: "Worker deleted successfully" });
      setShowDeleteWorker(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
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

  const openEdit = (w: WorkerRow) => {
    setEditId(w.id);
    setName(w.name);
    setRole(w.role || "");
    setWageType(w.wage_type);
    setWageRate(String(w.wage_rate));
    setStatus(w.status);
    setShowAdd(true);
  };

  const openQuickLog = (workerId: string) => {
    setSelectedWorkerId(workerId);
    setShowLogWork(true);
  };

  const handleRecordWork = async () => {
    if (!selectedWorkerId) {
      toast({ title: "Please select a worker", variant: "destructive" });
      return;
    }
    const hours = parseFloat(hoursWorked);
    if (isNaN(hours) || hours <= 0 || hours > 24) {
      toast({ title: "Invalid hours (must be between 0.5 and 24)", variant: "destructive" });
      return;
    }

    try {
      await recordWork.mutateAsync({
        workerId: selectedWorkerId,
        activityType,
        hoursWorked: hours,
        date: logDate,
      });
      setShowLogWork(false);
      setHoursWorked("8");
    } catch {
      // Handled in mutation
    }
  };

  const active = workers?.filter((w) => w.status === "active").length || 0;
  const onLeave = workers?.filter((w) => w.status === "on_leave").length || 0;
  const totalHoursLoggedThisWeek = (workLogs || []).reduce((acc: number, cur: WorkLogRow) => acc + (Number(cur.hours_worked) || 0), 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-serif text-foreground">Workers & Operations Team</h1>
          <p className="text-muted-foreground mt-1">Manage farm personnel, log work activities, and track daily operational hours</p>
        </div>
        <div className="flex items-center gap-2">
          <ResetModuleButton module="work_logs" moduleLabel="Work Logs" />
          {canManage && (
            <>
              <Button variant="outline" onClick={() => setShowLogWork(true)} className="gap-2">
                <Clock className="w-4 h-4" /> Log Daily Activity
              </Button>
              <Button onClick={() => setShowAdd(true)} className="gap-2">
                <Plus className="w-4 h-4" /> Add Worker
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard title="Total Workers" value={workers?.length || 0} icon={<Users className="w-4 h-4" />} />
        <MetricCard title="Active Staff" value={active} />
        <MetricCard title="Recent Activity Hours" value={`${totalHoursLoggedThisWeek.toFixed(1)} hrs`} icon={<Clock className="w-4 h-4" />} />
      </div>

      <Tabs defaultValue="roster" className="space-y-4">
        <TabsList>
          <TabsTrigger value="roster" className="gap-2">
            <Users className="w-4 h-4" /> Staff Roster
          </TabsTrigger>
          <TabsTrigger value="work-logs" className="gap-2">
            <Clock className="w-4 h-4" /> Activity Logs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="roster">
          <div className="bg-card rounded-xl card-shadow border border-border/50 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Role</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Wage Basis</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Rate (ETB)</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">Loading workers roster...</td></tr>
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
                        <td className="px-5 py-3.5 text-sm font-mono">{Number(w.wage_rate).toLocaleString()} ETB</td>
                        <td className="px-5 py-3.5">
                          <span className={`status-badge ${statusBadge[w.status] || "bg-muted text-muted-foreground"}`}>
                            {w.status.replace("_", " ")}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right space-x-1">
                          {canManage && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs gap-1"
                                onClick={() => openQuickLog(w.id)}
                              >
                                <Clock className="w-3 h-3" /> Log Work
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => openEdit(w)} title="Edit Worker">
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => setShowDeleteWorker(w)} title="Delete Worker">
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">No workers registered yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="work-logs">
          <div className="bg-card rounded-xl card-shadow border border-border/50 overflow-hidden">
            <div className="p-4 border-b border-border/50 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-foreground">Operational Work Activity Logs</h2>
                <p className="text-xs text-muted-foreground">Daily logged shifts used for deterministic payroll calculations</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setShowLogWork(true)} className="gap-1.5 text-xs">
                <Plus className="w-3.5 h-3.5" /> Log Activity
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Date</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Worker</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Activity</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Hours</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Role</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingLogs ? (
                    <tr><td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">Loading activity logs...</td></tr>
                  ) : workLogs && workLogs.length > 0 ? (
                    workLogs.map((log: WorkLogRow) => (
                      <tr key={log.id} className="border-b border-border/50 hover:bg-muted/20">
                        <td className="px-5 py-3.5 text-sm font-mono text-muted-foreground flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5" /> {log.date}
                        </td>
                        <td className="px-5 py-3.5 text-sm font-medium">{log.workers?.name || "Unknown"}</td>
                        <td className="px-5 py-3.5 text-sm">{log.activity_type}</td>
                        <td className="px-5 py-3.5 text-sm font-semibold">{log.hours_worked} hrs</td>
                        <td className="px-5 py-3.5 text-sm text-muted-foreground">{log.workers?.role || "—"}</td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">No work activities recorded yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Add / Edit Worker Dialog */}
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
              <Input placeholder="e.g. Bed Operator, Grinder, Sorter" value={role} onChange={(e) => setRole(e.target.value)} />
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

      {/* Log Work Activity Dialog */}
      <Dialog open={showLogWork} onOpenChange={setShowLogWork}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">Log Work Activity</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Worker</Label>
              <Select value={selectedWorkerId} onValueChange={setSelectedWorkerId}>
                <SelectTrigger><SelectValue placeholder="Select worker..." /></SelectTrigger>
                <SelectContent>
                  {workers?.filter((w) => w.status === "active").map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name} ({w.role || "Worker"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Activity Type</Label>
              <Select value={activityType} onValueChange={setActivityType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Drying bed turning">Drying bed turning & moisture checks</SelectItem>
                  <SelectItem value="Cherry floating & sorting">Cherry floating & manual sorting</SelectItem>
                  <SelectItem value="Hulling & grinding">Hulling, grinding & milling</SelectItem>
                  <SelectItem value="Bagging & warehousing">Bagging & warehouse stacking</SelectItem>
                  <SelectItem value="Washing station operation">Washing station pulper operation</SelectItem>
                  <SelectItem value="General station maintenance">General station maintenance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Hours Worked</Label>
              <Input
                type="number"
                step="0.5"
                min="0.5"
                max="24"
                value={hoursWorked}
                onChange={(e) => setHoursWorked(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLogWork(false)}>Cancel</Button>
            <Button onClick={handleRecordWork} disabled={recordWork.isPending} className="gap-2">
              <CheckCircle2 className="w-4 h-4" />
              {recordWork.isPending ? "Recording..." : "Record Activity"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Worker Confirmation Dialog */}
      <AlertDialog open={!!showDeleteWorker} onOpenChange={(v) => { if (!v) setShowDeleteWorker(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Worker</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete worker "{showDeleteWorker?.name}"? All associated past work records may be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteWorker.mutate(showDeleteWorker?.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default WorkersPage;
