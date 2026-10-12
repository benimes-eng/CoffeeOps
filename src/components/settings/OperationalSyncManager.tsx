import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useOrg } from "@/hooks/use-org";
import { useRole } from "@/hooks/use-role";
import {
  exportOperationalSnapshot,
  importOperationalSnapshot,
  validateSnapshot,
  OperationalSnapshot,
} from "@/services/operationalSyncService";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import {
  Download,
  Upload,
  RefreshCw,
  Database,
  CheckCircle2,
  FileJson,
  Layers,
  ArrowRight,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function OperationalSyncManager() {
  const { orgId, orgName } = useOrg();
  const { isOwner, isSuperAdmin } = useRole();
  const queryClient = useQueryClient();

  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [pendingSnapshot, setPendingSnapshot] = useState<OperationalSnapshot | null>(null);
  const [syncStrategy, setSyncStrategy] = useState<"skip_existing" | "overwrite_existing">("skip_existing");
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOwner && !isSuperAdmin) {
    return null;
  }

  // Handle Export to Local File
  const handleExport = async () => {
    if (!orgId) {
      toast({ title: "Organization missing", description: "No active organization detected.", variant: "destructive" });
      return;
    }

    setIsExporting(true);
    try {
      const snapshot = await exportOperationalSnapshot(orgId, orgName);
      const jsonStr = JSON.stringify(snapshot, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const dateStr = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.download = `coffeeops-operation-backup-${dateStr}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      const totalItems = Object.values(snapshot.counts).reduce((a, b) => a + b, 0);
      toast({
        title: "Operational Data Exported",
        description: `Exported ${totalItems} records across lots, beds, workers, and inventory with SHA-256 integrity verification.`,
      });
    } catch (e: any) {
      toast({
        title: "Export Failed",
        description: e.message || "Failed to compile operational snapshot.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  // Handle File Selection
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const validation = await validateSnapshot(parsed);

      if (!validation.valid) {
        toast({
          title: "Corrupted or Invalid Backup File",
          description: validation.error || "The snapshot failed integrity verification.",
          variant: "destructive",
        });
        return;
      }

      setPendingSnapshot(parsed);
      setSyncStrategy("skip_existing");
    } catch {
      toast({
        title: "Invalid JSON File",
        description: "The selected file is not valid JSON.",
        variant: "destructive",
      });
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // Confirm Import & Sync to Live Cloud
  const handleConfirmImport = async () => {
    if (!pendingSnapshot) return;

    setIsImporting(true);
    try {
      const res = await importOperationalSnapshot(pendingSnapshot, syncStrategy);
      await queryClient.invalidateQueries();

      toast({
        title: "Synchronization Complete",
        description: `Added ${res.insertedCount} new records, updated ${res.updatedCount} records, and kept ${res.skippedCount} existing records unchanged.`,
      });
      setPendingSnapshot(null);
    } catch (e: any) {
      toast({
        title: "Synchronization Failed",
        description: e.message || "Could not merge operational records.",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="bg-card rounded-xl p-6 card-shadow border border-border/50 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-emerald-500/10 text-emerald-600 rounded-lg">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-serif text-lg text-foreground">Local & Cloud Data Synchronization</h3>
            <p className="text-xs text-muted-foreground">
              Export recorded washing station operations for local offline archival, or restore and sync local snapshots into live cloud storage.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
        {/* Export Card */}
        <div className="border border-border/60 rounded-xl p-4 bg-muted/20 space-y-3">
          <div className="flex items-center gap-2">
            <Download className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Export Whole Operation</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Generates a tamper-evident, SHA-256 verified JSON archive containing all lots, drying beds, grinding batches, export consignments, workers, work logs, and stock ledgers.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={isExporting}
            className="w-full gap-2 border-primary/30 text-primary hover:bg-primary/10"
          >
            {isExporting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            {isExporting ? "Compiling Snapshot..." : "Download Operational Snapshot"}
          </Button>
        </div>

        {/* Import & Sync Card */}
        <div className="border border-border/60 rounded-xl p-4 bg-muted/20 space-y-3">
          <div className="flex items-center gap-2">
            <Upload className="w-4 h-4 text-emerald-600" />
            <span className="text-sm font-semibold text-foreground">Import & Sync Live</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Upload a local operational backup to merge updates into the live cloud system. Existing cloud records are safely preserved while local changes are reconciled.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="w-full gap-2 bg-emerald-700 hover:bg-emerald-800 text-white"
          >
            {isImporting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {isImporting ? "Synchronizing Live..." : "Upload & Sync Snapshot"}
          </Button>
        </div>
      </div>

      {/* Confirmation Modal */}
      <AlertDialog open={!!pendingSnapshot} onOpenChange={(v) => !v && setPendingSnapshot(null)}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <div className="flex items-center gap-2 text-foreground font-serif text-lg font-bold">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              Verify & Synchronize Operation
            </div>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-2 text-left">
                <div className="p-3 bg-muted/40 rounded-lg text-xs space-y-1.5 border border-border/50">
                  <div className="flex items-center justify-between font-mono">
                    <span className="text-muted-foreground">Exported Date:</span>
                    <span className="text-foreground font-medium">
                      {pendingSnapshot ? new Date(pendingSnapshot.exportedAt).toLocaleString() : ""}
                    </span>
                  </div>
                  <div className="flex items-center justify-between font-mono">
                    <span className="text-muted-foreground">Original Estate:</span>
                    <span className="text-foreground font-medium">{pendingSnapshot?.organizationName}</span>
                  </div>
                  <div className="flex items-center justify-between font-mono">
                    <span className="text-muted-foreground">Integrity SHA-256:</span>
                    <span className="text-foreground font-medium truncate max-w-[200px]">
                      {pendingSnapshot?.checksum.slice(0, 16)}...
                    </span>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">Payload Summary:</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-[11px] font-mono">
                    <span className="bg-background/80 p-1 rounded border">Lots: {pendingSnapshot?.counts.lots || 0}</span>
                    <span className="bg-background/80 p-1 rounded border">Beds: {pendingSnapshot?.counts.beds || 0}</span>
                    <span className="bg-background/80 p-1 rounded border">Workers: {pendingSnapshot?.counts.workers || 0}</span>
                    <span className="bg-background/80 p-1 rounded border">Work Logs: {pendingSnapshot?.counts.work_logs || 0}</span>
                    <span className="bg-background/80 p-1 rounded border">Payroll: {pendingSnapshot?.counts.payroll || 0}</span>
                    <span className="bg-background/80 p-1 rounded border">Shipments: {pendingSnapshot?.counts.shipments || 0}</span>
                  </div>
                </div>

                {/* Conflict Resolution Strategy Options */}
                <div className="space-y-2 pt-1">
                  <p className="text-xs font-semibold text-foreground">Import & Conflict Strategy:</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setSyncStrategy("skip_existing")}
                      className={`cursor-pointer rounded-lg p-3 border transition-all text-xs flex flex-col justify-between select-none ${
                        syncStrategy === "skip_existing"
                          ? "border-emerald-600 bg-emerald-500/10 text-foreground ring-1 ring-emerald-600"
                          : "border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/40"
                      }`}
                    >
                      <div className="font-semibold text-foreground flex items-center gap-1.5 mb-1">
                        <CheckCircle2 className={`w-3.5 h-3.5 ${syncStrategy === "skip_existing" ? "text-emerald-600" : "text-muted-foreground"}`} />
                        Merge New Only (Safe)
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Preserves all existing cloud records as they are. Only new records will be added. No duplicate records.
                      </p>
                    </div>

                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setSyncStrategy("overwrite_existing")}
                      className={`cursor-pointer rounded-lg p-3 border transition-all text-xs flex flex-col justify-between select-none ${
                        syncStrategy === "overwrite_existing"
                          ? "border-amber-600 bg-amber-500/10 text-foreground ring-1 ring-amber-600"
                          : "border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/40"
                      }`}
                    >
                      <div className="font-semibold text-foreground flex items-center gap-1.5 mb-1">
                        <RefreshCw className={`w-3.5 h-3.5 ${syncStrategy === "overwrite_existing" ? "text-amber-600" : "text-muted-foreground"}`} />
                        Replace & Overwrite
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Replaces matching existing records with values from the backup, and imports any new records.
                      </p>
                    </div>
                  </div>
                </div>

                <p className="text-xs bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 p-2.5 rounded border border-emerald-500/20">
                  💡 <strong>Zero Duplication:</strong> Records are identified by natural keys (Lot number, Worker name, Bed number). Same data will never be duplicated.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingSnapshot(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmImport}
              disabled={isImporting}
              className="bg-emerald-700 hover:bg-emerald-800 text-white gap-2"
            >
              {isImporting ? "Applying Sync..." : "Confirm & Sync Live"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
