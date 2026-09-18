import { useMutation, useQueryClient } from "@tanstack/react-query";
import { resetTenantModuleData, ResettableModule } from "@/services/dataManagementService";
import { useToast } from "@/hooks/use-toast";

export function useResetModuleData() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (module: ResettableModule) => resetTenantModuleData(module),
    onSuccess: (_, module) => {
      qc.invalidateQueries();
      toast({
        title: "Data Reset Complete",
        description: `Operational data for ${module} has been successfully cleared.`,
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Reset Failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });
}
