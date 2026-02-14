import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";

export function useOrg() {
  const { user } = useAuth();

  const { data: profile } = useQuery({
    queryKey: ["my-profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("organization_id, name, organizations(name)")
        .eq("user_id", user.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  return {
    orgId: profile?.organization_id ?? null,
    orgName: (profile as any)?.organizations?.name ?? null,
    profileName: profile?.name ?? null,
  };
}
