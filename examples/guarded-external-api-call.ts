/**
 * AgentFence guarded external API call — safe integration template.
 *
 * Run this inside a trusted server-side agent runtime, worker, or sidecar.
 * Do not put the runtime credential or a customer API key in browser code.
 *
 * The AgentFence guard runs BEFORE the fetch callback. If policy returns block
 * or approval_required, guardAndDeliver throws and fetch is never invoked.
 */
import { createAgentFenceRuntimeClient } from "../shared/agentfence-runtime-client";

const endpoint = process.env.AGENTFENCE_URL;
const runtimeCredential = process.env.AGENTFENCE_RUNTIME_CREDENTIAL;
const demoApiUrl = process.env.DEMO_API_URL;

if (!endpoint || !runtimeCredential || !demoApiUrl) {
  throw new Error("Set AGENTFENCE_URL, AGENTFENCE_RUNTIME_CREDENTIAL, and DEMO_API_URL before running this demo.");
}

const agentFence = createAgentFenceRuntimeClient({ endpoint, credential: runtimeCredential });

const exportRequest = {
  customerIds: ["demo-customer-001"],
  exportFormat: "csv",
};

async function runGuardedExport() {
  return agentFence.guardAndDeliver(
    {
      toolName: "crm",
      action: "customer.export",
      parameters: { customerCount: exportRequest.customerIds.length, exportFormat: exportRequest.exportFormat },
      outboundPayload: exportRequest,
      dataSensitivity: "internal",
      destination: "demo-crm-api.company.test",
      riskLevel: "high",
    },
    async safePayload => {
      // This callback is NOT reached when AgentFence returns blocked or approval_required.
      const response = await fetch(`${demoApiUrl}/exports`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(safePayload),
      });
      if (!response.ok) throw new Error(`Demo API returned ${response.status}`);
      return response.json() as Promise<{ requestId: string; accepted: true }>;
    },
  );
}

runGuardedExport()
  .then(result => console.log("External API was called only after an AgentFence allow decision:", result))
  .catch(error => console.error("No external request was sent because AgentFence did not allow the action:", error.message));
