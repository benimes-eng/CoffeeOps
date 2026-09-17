import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";

interface OrgProfile {
  organization_id: string;
  name: string | null;
  organizations: {
    name: string;
  } | null;
}

export function useOrg() {
  const { user } = useAuth();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["my-profile", user?.id],
    queryFn: async () => {
      if (!user) return null;

      const { data, error } = await supabase
        .from("profiles")
        .select("organization_id, name, organizations(name)")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        throw error;
      }
      return data as unknown as OrgProfile | null;
    },
    enabled: !!user,
  });

  return {
    orgId: profile?.organization_id ?? null,
    orgName: profile?.organizations?.name ?? null,
    profileName: profile?.name ?? null,
    isLoading,
  };
}

