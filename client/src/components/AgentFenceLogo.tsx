import { ShieldCheck } from "lucide-react";
import React from "react";

export function AgentFenceLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="agentfence-logo flex items-center gap-3 min-w-0">
      <div className="logo-mark"><ShieldCheck size={18} strokeWidth={2.25} /></div>
      {!compact && (
        <div className="agentfence-logo-copy min-w-0">
          <div className="font-display text-[15px] leading-none font-semibold tracking-[-0.03em] text-white">AgentFence</div>
          <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">Control plane</div>
        </div>
      )}
    </div>
  );
}
