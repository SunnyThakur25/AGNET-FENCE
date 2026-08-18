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
const demoApiUrl = process.env.DEMO_API_URL || "http://localhost:3000/api/demo-crm-target";

if (!endpoint || !runtimeCredential) {
  throw new Error("Set AGENTFENCE_URL and AGENTFENCE_RUNTIME_CREDENTIAL before running this demo.");
}

const agentFence = createAgentFenceRuntimeClient({ endpoint, credential: runtimeCredential });

const caseReadRequest = { caseId: "CASE-DEMO-001" };
const exportRequest = { customerIds: ["demo-customer-001"], exportFormat: "csv" };

async function runGuardedCaseRead() {
  return agentFence.guardAndDeliver(
    {
      toolName: "crm",
      action: "case.read",
      parameters: caseReadRequest,
      outboundPayload: caseReadRequest,
      dataSensitivity: "internal",
      destination: "demo-crm-api.company.test",
      riskLevel: "low",
    },
    async safePayload => {
      const response = await fetch(`${demoApiUrl}/cases/read`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(safePayload),
      });
      if (!response.ok) throw new Error(`Demo API returned ${response.status}`);
      return response.json() as Promise<{ requestId: string; case: { id: string; status: string; synthetic: true } }>;
    },
  );
}

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

async function runDemo() {
  const allowedRead = await runGuardedCaseRead();
  console.log("Allowed case read reached the safe target:", allowedRead);
  try {
    await runGuardedExport();
  } catch (error) {
    console.log("Blocked export never reached the safe target:", error instanceof Error ? error.message : error);
  }
}

runDemo().catch(error => console.error("Demo cannot begin until the narrow policies are independently approved and a runtime credential is issued:", error.message));
