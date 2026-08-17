import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

type AgentFenceWorkspace = {
  organizationId: number | null;
  ready: boolean;
};

const AgentFenceWorkspaceContext = createContext<AgentFenceWorkspace>({ organizationId: null, ready: false });

export function AgentFenceWorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [organizationId, setOrganizationId] = useState<number | null>(null);
  const bootstrapAttemptedForUser = useRef<number | null>(null);
  const bootstrap = trpc.agentfence.bootstrap.useMutation({
    onSuccess: result => setOrganizationId(result.organizationId),
  });

  useEffect(() => {
    if (!loading && user?.id && !organizationId && bootstrapAttemptedForUser.current !== user.id) {
      bootstrapAttemptedForUser.current = user.id;
      bootstrap.mutate();
    }
  }, [loading, organizationId, user?.id]);

  const value = useMemo(
    () => ({ organizationId, ready: Boolean(organizationId) && !bootstrap.isPending }),
    [bootstrap.isPending, organizationId],
  );

  return <AgentFenceWorkspaceContext.Provider value={value}>{children}</AgentFenceWorkspaceContext.Provider>;
}

export function useAgentFenceWorkspace() {
  return useContext(AgentFenceWorkspaceContext);
}
