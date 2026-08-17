export type ActionMetricInput = {
  toolName: string;
  action: string;
  decision: string;
  targetOutcome: string | null;
};

export type ActionMetricSummary = {
  key: string;
  toolName: string;
  action: string;
  count: number;
  completed: number;
  succeeded: number;
  failed: number;
  pending: number;
  successRate: number | null;
};

/**
 * Aggregates already tenant-scoped tool calls. It deliberately treats only
 * explicit target outcomes as completed business results; an allow without a
 * wrapped integration report remains pending rather than being counted as a
 * success.
 */
export function aggregateActionSummary(calls: ActionMetricInput[], limit = 8): ActionMetricSummary[] {
  const groups = new Map<string, ActionMetricSummary>();
  for (const call of calls) {
    const key = `${call.toolName}.${call.action}`;
    const current = groups.get(key) ?? {
      key,
      toolName: call.toolName,
      action: call.action,
      count: 0,
      completed: 0,
      succeeded: 0,
      failed: 0,
      pending: 0,
      successRate: null,
    };
    current.count += 1;
    if (call.targetOutcome === "succeeded") {
      current.completed += 1;
      current.succeeded += 1;
    } else if (call.targetOutcome === "failed") {
      current.completed += 1;
      current.failed += 1;
    } else {
      current.pending += 1;
    }
    current.successRate = current.completed ? Math.round((current.succeeded / current.completed) * 100) : null;
    groups.set(key, current);
  }
  return Array.from(groups.values())
    .sort((left, right) => right.count - left.count || (right.successRate ?? -1) - (left.successRate ?? -1) || left.key.localeCompare(right.key))
    .slice(0, limit);
}
