import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ClipboardList, User, Calendar } from "lucide-react";
import { format } from "date-fns";

const actionLabels: Record<string, { label: string; color: string }> = {
  create: { label: "Created", color: "bg-success/10 text-success" },
  update: { label: "Updated", color: "bg-primary/10 text-primary" },
  delete: { label: "Deleted", color: "bg-destructive/10 text-destructive" },
  approve_user: { label: "Approved User", color: "bg-success/10 text-success" },
  reject_user: { label: "Rejected User", color: "bg-destructive/10 text-destructive" },
  assign_role: { label: "Assigned Role", color: "bg-primary/10 text-primary" },
  remove_role: { label: "Removed Role", color: "bg-warning/10 text-warning" },
  mark_complete: { label: "Marked Complete", color: "bg-success/10 text-success" },
  start_grinding: { label: "Started Grinding", color: "bg-primary/10 text-primary" },
  complete_grinding: { label: "Completed Grinding", color: "bg-success/10 text-success" },
  create_shipment: { label: "Created Shipment", color: "bg-primary/10 text-primary" },
  confirm_shipment: { label: "Confirmed Shipment", color: "bg-success/10 text-success" },
  merge_lots: { label: "Merged Lots", color: "bg-accent text-accent-foreground" },
};

const AuditLogPage = () => {
  const { data: logs, isLoading } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;

      // Fetch profile names for user_ids
      const userIds = [...new Set(data.map((l: any) => l.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, name, email")
        .in("user_id", userIds);

      const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) ?? []);
      return data.map((log: any) => ({
        ...log,
        user_name: profileMap.get(log.user_id)?.name ?? profileMap.get(log.user_id)?.email ?? "Unknown",
      }));
    },
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-serif text-foreground">Audit Log</h1>
        <p className="text-muted-foreground mt-1">Complete activity history — who did what and when</p>
      </div>

      <div className="bg-card rounded-xl card-shadow border border-border/50 overflow-hidden">
        {isLoading ? (
          <p className="text-muted-foreground text-center py-12">Loading audit logs...</p>
        ) : logs && logs.length > 0 ? (
          <div className="divide-y divide-border/50">
            {logs.map((log: any) => {
              const actionMeta = actionLabels[log.action] ?? { label: log.action, color: "bg-muted text-muted-foreground" };
              const details = log.details as Record<string, unknown> | null;
              return (
                <div key={log.id} className="px-5 py-4 hover:bg-muted/20 transition-colors">
                  <div className="flex items-start gap-4">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <User className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground">{log.user_name}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide ${actionMeta.color}`}>
                          {actionMeta.label}
                        </span>
                        <span className="text-xs text-muted-foreground capitalize">{log.entity_type.replace("_", " ")}</span>
                      </div>
                      {details && Object.keys(details).length > 0 && (
                        <p className="text-xs text-muted-foreground mt-1 truncate">
                          {Object.entries(details).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
                      <Calendar className="w-3 h-3" />
                      {format(new Date(log.created_at), "MMM d, yyyy HH:mm")}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <ClipboardList className="w-10 h-10 mb-3 opacity-40" />
            <p className="text-sm">No audit logs yet</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditLogPage;
