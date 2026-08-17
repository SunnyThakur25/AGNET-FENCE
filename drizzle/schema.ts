import {
  boolean,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
    name: text("name"),
    email: varchar("email", { length: 320 }),
    avatarUrl: varchar("avatarUrl", { length: 500 }),
    avatarStorageKey: varchar("avatarStorageKey", { length: 255 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const membershipRole = mysqlEnum("membershipRole", ["admin", "operator", "viewer", "billing_admin"]);
export const agentEnvironment = mysqlEnum("agentEnvironment", ["development", "staging", "production"]);
export const agentRiskLevel = mysqlEnum("agentRiskLevel", ["low", "medium", "high", "critical"]);
export const agentStatus = mysqlEnum("agentStatus", ["active", "paused", "retired"]);
export const policyEffect = mysqlEnum("policyEffect", ["allow", "deny", "require_approval"]);
export const policyStatus = mysqlEnum("policyStatus", ["active", "disabled"]);
export const actionDecision = mysqlEnum("actionDecision", ["allowed", "blocked", "approval_required", "approved", "rejected", "simulated"]);
export const approvalStatus = mysqlEnum("approvalStatus", ["pending", "approved", "rejected", "expired"]);
export const notificationSeverity = mysqlEnum("notificationSeverity", ["info", "medium", "high", "critical"]);
export const simulationStatus = mysqlEnum("simulationStatus", ["passed", "failed", "needs_review"]);
export const runtimeCredentialStatus = mysqlEnum("runtimeCredentialStatus", ["active", "revoked", "expired"]);
export const targetOutcomeStatus = mysqlEnum("targetOutcomeStatus", ["succeeded", "failed"]);
export const enterpriseConnectionKind = mysqlEnum("enterpriseConnectionKind", ["splunk_hec", "microsoft_sentinel", "pagerduty_events", "oidc", "scim", "vault_approle"]);
export const enterpriseConnectionStatus = mysqlEnum("enterpriseConnectionStatus", ["not_configured", "pending_activation", "ready", "unhealthy"]);
export const subscriptionPlan = mysqlEnum("subscriptionPlan", ["pilot", "growth", "enterprise"]);
export const policyRevisionStatus = mysqlEnum("policyRevisionStatus", ["draft", "pending_review", "approved", "rejected", "promoted", "superseded"]);
export const connectorCertificationStatus = mysqlEnum("connectorCertificationStatus", ["pending", "certified", "failed", "activation_required"]);
export const mcpServerStatus = mysqlEnum("mcpServerStatus", ["pending_review", "trusted", "unhealthy", "disabled"]);
export const mcpToolStatus = mysqlEnum("mcpToolStatus", ["discovered", "enabled", "disabled"]);
export const auditAnchorStatus = mysqlEnum("auditAnchorStatus", ["prepared", "external_receipt_recorded", "verification_failed"]);
export const siemDeliveryStatus = mysqlEnum("siemDeliveryStatus", ["queued", "delivered", "retrying", "failed", "skipped"]);
export const resilienceStatus = mysqlEnum("resilienceStatus", ["draft", "declared", "exercise_recorded", "needs_remediation"]);
export const resilienceExerciseOutcome = mysqlEnum("resilienceExerciseOutcome", ["passed", "failed", "partial"]);

export const organizations = mysqlTable(
  "organizations",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    slug: varchar("slug", { length: 80 }).notNull(),
    createdBy: int("createdBy").notNull().references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("organizations_slug_unique").on(table.slug)],
);

export const teams = mysqlTable(
  "teams",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("teams_org_idx").on(table.organizationId)],
);

export const teamMemberships = mysqlTable(
  "teamMemberships",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    teamId: int("teamId").notNull().references(() => teams.id, { onDelete: "cascade" }),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: membershipRole.notNull().default("operator"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("team_memberships_team_user_unique").on(table.teamId, table.userId),
    index("team_memberships_org_user_idx").on(table.organizationId, table.userId),
  ],
);

export const agents = mysqlTable(
  "agents",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    teamId: int("teamId").notNull().references(() => teams.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 120 }).notNull(),
    identity: varchar("identity", { length: 160 }).notNull(),
    description: text("description"),
    environment: agentEnvironment.notNull().default("development"),
    ownerUserId: int("ownerUserId").notNull().references(() => users.id, { onDelete: "restrict" }),
    riskLevel: agentRiskLevel.notNull().default("medium"),
    status: agentStatus.notNull().default("active"),
    version: varchar("version", { length: 64 }).notNull().default("1.0.0"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("agents_org_identity_unique").on(table.organizationId, table.identity),
    index("agents_org_idx").on(table.organizationId),
    index("agents_team_idx").on(table.teamId),
  ],
);

export const policies = mysqlTable(
  "policies",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    teamId: int("teamId").references(() => teams.id, { onDelete: "cascade" }),
    agentId: int("agentId").references(() => agents.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    description: text("description"),
    effect: policyEffect.notNull(),
    toolPattern: varchar("toolPattern", { length: 120 }).notNull().default("*"),
    actionPattern: varchar("actionPattern", { length: 120 }).notNull().default("*"),
    parameterConstraints: json("parameterConstraints"),
    dataSensitivity: varchar("dataSensitivity", { length: 32 }).notNull().default("any"),
    destinationPattern: varchar("destinationPattern", { length: 180 }).notNull().default("*"),
    priority: int("priority").notNull().default(100),
    status: policyStatus.notNull().default("active"),
    currentRevision: int("currentRevision").notNull().default(0),
    createdBy: int("createdBy").notNull().references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("policies_org_idx").on(table.organizationId),
    index("policies_agent_idx").on(table.agentId),
  ],
);

/** Immutable proposal snapshot; only a promoted, approved revision may change an active policy. */
export const policyRevisions = mysqlTable(
  "policyRevisions",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    policyId: int("policyId").notNull().references(() => policies.id, { onDelete: "cascade" }),
    revision: int("revision").notNull(),
    baseRevision: int("baseRevision").notNull(),
    status: policyRevisionStatus.notNull().default("draft"),
    changeSummary: varchar("changeSummary", { length: 500 }).notNull(),
    snapshot: json("snapshot").notNull(),
    createdBy: int("createdBy").notNull().references(() => users.id, { onDelete: "restrict" }),
    reviewedBy: int("reviewedBy").references(() => users.id, { onDelete: "set null" }),
    reviewComment: text("reviewComment"),
    reviewedAt: timestamp("reviewedAt"),
    promotedAt: timestamp("promotedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("policy_revisions_policy_revision_unique").on(table.policyId, table.revision),
    index("policy_revisions_org_status_idx").on(table.organizationId, table.status),
  ],
);

export const vaultCredentials = mysqlTable(
  "vaultCredentials",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    teamId: int("teamId").references(() => teams.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    provider: varchar("provider", { length: 100 }).notNull(),
    externalReference: varchar("externalReference", { length: 255 }).notNull(),
    allowedScopes: json("allowedScopes").notNull(),
    tokenTtlSeconds: int("tokenTtlSeconds").notNull().default(300),
    status: varchar("status", { length: 24 }).notNull().default("active"),
    lastRotatedAt: timestamp("lastRotatedAt"),
    createdBy: int("createdBy").notNull().references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("vault_credentials_org_idx").on(table.organizationId)],
);

export const toolCalls = mysqlTable(
  "toolCalls",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    agentId: int("agentId").notNull().references(() => agents.id, { onDelete: "cascade" }),
    toolName: varchar("toolName", { length: 120 }).notNull(),
    action: varchar("action", { length: 120 }).notNull(),
    redactedParameters: json("redactedParameters").notNull(),
    dataSensitivity: varchar("dataSensitivity", { length: 32 }).notNull().default("internal"),
    destination: varchar("destination", { length: 180 }).notNull().default("internal"),
    riskLevel: agentRiskLevel.notNull().default("medium"),
    decision: actionDecision.notNull(),
    matchedPolicyId: int("matchedPolicyId").references(() => policies.id, { onDelete: "set null" }),
    initiatedBy: varchar("initiatedBy", { length: 160 }).notNull(),
    targetOutcome: targetOutcomeStatus,
    targetStatusCode: int("targetStatusCode"),
    targetReference: varchar("targetReference", { length: 160 }),
    targetRecordedAt: timestamp("targetRecordedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("tool_calls_org_created_idx").on(table.organizationId, table.createdAt),
    index("tool_calls_agent_idx").on(table.agentId),
  ],
);

export const runtimeCredentials = mysqlTable(
  "runtimeCredentials",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    agentId: int("agentId").notNull().references(() => agents.id, { onDelete: "cascade" }),
    vaultCredentialId: int("vaultCredentialId").references(() => vaultCredentials.id, { onDelete: "set null" }),
    tokenId: varchar("tokenId", { length: 64 }).notNull(),
    allowedScopes: json("allowedScopes"),
    status: runtimeCredentialStatus.notNull().default("active"),
    expiresAt: timestamp("expiresAt").notNull(),
    revokedAt: timestamp("revokedAt"),
    issuedBy: int("issuedBy").notNull().references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("runtime_credentials_token_id_unique").on(table.tokenId),
    index("runtime_credentials_org_agent_idx").on(table.organizationId, table.agentId),
    index("runtime_credentials_vault_credential_idx").on(table.vaultCredentialId),
  ],
);

export const runtimeNonces = mysqlTable(
  "runtimeNonces",
  {
    id: int("id").autoincrement().primaryKey(),
    runtimeCredentialId: int("runtimeCredentialId").notNull().references(() => runtimeCredentials.id, { onDelete: "cascade" }),
    nonce: varchar("nonce", { length: 96 }).notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("runtime_nonces_credential_nonce_unique").on(table.runtimeCredentialId, table.nonce),
    index("runtime_nonces_expiry_idx").on(table.expiresAt),
  ],
);

export const approvals = mysqlTable(
  "approvals",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    toolCallId: int("toolCallId").notNull().references(() => toolCalls.id, { onDelete: "cascade" }),
    status: approvalStatus.notNull().default("pending"),
    requestedBy: varchar("requestedBy", { length: 160 }).notNull(),
    reviewerUserId: int("reviewerUserId").references(() => users.id, { onDelete: "set null" }),
    decisionReason: text("decisionReason"),
    expiresAt: timestamp("expiresAt").notNull(),
    decidedAt: timestamp("decidedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("approvals_org_status_idx").on(table.organizationId, table.status),
    uniqueIndex("approvals_tool_call_unique").on(table.toolCallId),
  ],
);

export const auditEvents = mysqlTable(
  "auditEvents",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    sequence: int("sequence").notNull(),
    eventType: varchar("eventType", { length: 120 }).notNull(),
    actorType: varchar("actorType", { length: 32 }).notNull(),
    actorIdentity: varchar("actorIdentity", { length: 160 }).notNull(),
    agentId: int("agentId").references(() => agents.id, { onDelete: "set null" }),
    toolCallId: int("toolCallId").references(() => toolCalls.id, { onDelete: "set null" }),
    policyId: int("policyId").references(() => policies.id, { onDelete: "set null" }),
    approvalId: int("approvalId").references(() => approvals.id, { onDelete: "set null" }),
    outcome: actionDecision.notNull(),
    payload: json("payload").notNull(),
    previousHash: varchar("previousHash", { length: 64 }).notNull(),
    eventHash: varchar("eventHash", { length: 64 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("audit_events_org_sequence_unique").on(table.organizationId, table.sequence),
    uniqueIndex("audit_events_hash_unique").on(table.eventHash),
    index("audit_events_org_created_idx").on(table.organizationId, table.createdAt),
  ],
);

export const dataGuardFindings = mysqlTable(
  "dataGuardFindings",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    toolCallId: int("toolCallId").notNull().references(() => toolCalls.id, { onDelete: "cascade" }),
    classification: varchar("classification", { length: 32 }).notNull(),
    detector: varchar("detector", { length: 100 }).notNull(),
    actionTaken: varchar("actionTaken", { length: 32 }).notNull(),
    occurrences: int("occurrences").notNull().default(1),
    destinationApproved: boolean("destinationApproved").notNull().default(false),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("data_guard_findings_org_idx").on(table.organizationId)],
);

export const notifications = mysqlTable(
  "notifications",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    recipientUserId: int("recipientUserId").references(() => users.id, { onDelete: "cascade" }),
    severity: notificationSeverity.notNull().default("info"),
    title: varchar("title", { length: 180 }).notNull(),
    content: text("content").notNull(),
    relatedType: varchar("relatedType", { length: 60 }),
    relatedId: int("relatedId"),
    readAt: timestamp("readAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("notifications_org_created_idx").on(table.organizationId, table.createdAt)],
);

export const evidenceExports = mysqlTable(
  "evidenceExports",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    framework: varchar("framework", { length: 32 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("ready"),
    storageKey: varchar("storageKey", { length: 255 }).notNull(),
    storageUrl: varchar("storageUrl", { length: 500 }).notNull(),
    evidenceHash: varchar("evidenceHash", { length: 64 }).notNull(),
    generatedBy: int("generatedBy").notNull().references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("evidence_exports_org_idx").on(table.organizationId)],
);

/**
 * Export-ready audit head checkpoints. Platform storage is not represented as
 * independently immutable; a customer must retain the bundle under their own
 * WORM policy and record a non-secret receipt reference.
 */
export const auditAnchors = mysqlTable(
  "auditAnchors",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    ledgerSequence: int("ledgerSequence").notNull(),
    ledgerEventHash: varchar("ledgerEventHash", { length: 64 }).notNull(),
    anchorHash: varchar("anchorHash", { length: 64 }).notNull(),
    storageKey: varchar("storageKey", { length: 255 }).notNull(),
    storageUrl: varchar("storageUrl", { length: 500 }).notNull(),
    status: auditAnchorStatus.notNull().default("prepared"),
    externalProvider: varchar("externalProvider", { length: 48 }),
    externalReference: varchar("externalReference", { length: 500 }),
    retentionMode: varchar("retentionMode", { length: 48 }),
    receiptRecordedBy: int("receiptRecordedBy").references(() => users.id, { onDelete: "set null" }),
    receiptRecordedAt: timestamp("receiptRecordedAt"),
    createdBy: int("createdBy").notNull().references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("audit_anchors_org_created_idx").on(table.organizationId, table.createdAt),
    uniqueIndex("audit_anchors_org_sequence_unique").on(table.organizationId, table.ledgerSequence),
  ],
);

export const attackSimulations = mysqlTable(
  "attackSimulations",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    agentId: int("agentId").notNull().references(() => agents.id, { onDelete: "cascade" }),
    scenarioName: varchar("scenarioName", { length: 160 }).notNull(),
    scenarioType: varchar("scenarioType", { length: 48 }).notNull(),
    status: simulationStatus.notNull(),
    expectedControl: text("expectedControl").notNull(),
    actualOutcome: text("actualOutcome").notNull(),
    remediation: text("remediation").notNull(),
    createdBy: int("createdBy").notNull().references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("attack_simulations_org_idx").on(table.organizationId)],
);

export const activeSessions = mysqlTable(
  "activeSessions",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    sessionTokenHash: varchar("sessionTokenHash", { length: 64 }).notNull(),
    deviceInfo: varchar("deviceInfo", { length: 255 }),
    ipAddress: varchar("ipAddress", { length: 45 }),
    lastActiveAt: timestamp("lastActiveAt").defaultNow().notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    revokedAt: timestamp("revokedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("active_sessions_hash_unique").on(table.sessionTokenHash),
    index("active_sessions_user_idx").on(table.userId),
  ],
);

/**
 * A tenant-owned, server-side connection profile. It stores only safe metadata
 * and optional Vault paths; raw provider tokens, application secrets, and
 * webhook secrets must remain in deployment secrets or customer Vault.
 */
export const enterpriseConnections = mysqlTable(
  "enterpriseConnections",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    kind: enterpriseConnectionKind.notNull(),
    displayName: varchar("displayName", { length: 120 }).notNull(),
    endpoint: varchar("endpoint", { length: 500 }),
    safeConfig: json("safeConfig"),
    vaultSecretPath: varchar("vaultSecretPath", { length: 255 }),
    status: enterpriseConnectionStatus.notNull().default("not_configured"),
    lastTestedAt: timestamp("lastTestedAt"),
    lastErrorCode: varchar("lastErrorCode", { length: 64 }),
    createdBy: int("createdBy").notNull().references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("enterprise_connections_org_kind_unique").on(table.organizationId, table.kind),
    index("enterprise_connections_org_idx").on(table.organizationId),
  ],
);

/** Controlled SIEM certification evidence; no raw secret, provider response body, or event payload is retained. */
export const connectorCertifications = mysqlTable(
  "connectorCertifications",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    connectionId: int("connectionId").notNull().references(() => enterpriseConnections.id, { onDelete: "cascade" }),
    status: connectorCertificationStatus.notNull().default("pending"),
    evidenceCode: varchar("evidenceCode", { length: 80 }).notNull(),
    certifiedBy: int("certifiedBy").references(() => users.id, { onDelete: "set null" }),
    certifiedAt: timestamp("certifiedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("connector_certifications_connection_created_idx").on(table.connectionId, table.createdAt)],
);

/**
 * One tenant-owned continuous delivery profile per Splunk HEC connection. The
 * AppRole path and HEC token stay outside this table; the schedule task UID is
 * the only accepted identity for a scheduled delivery callback.
 */
export const siemDeliverySettings = mysqlTable(
  "siemDeliverySettings",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    connectionId: int("connectionId").notNull().references(() => enterpriseConnections.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(false),
    scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
    batchSize: int("batchSize").notNull().default(25),
    maxAttempts: int("maxAttempts").notNull().default(5),
    lastEnqueuedSequence: int("lastEnqueuedSequence").notNull().default(0),
    lastDeliveryAt: timestamp("lastDeliveryAt"),
    lastDeliveryCode: varchar("lastDeliveryCode", { length: 80 }),
    createdBy: int("createdBy").notNull().references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("siem_delivery_settings_connection_unique").on(table.connectionId),
    uniqueIndex("siem_delivery_settings_task_uid_unique").on(table.scheduleCronTaskUid),
    index("siem_delivery_settings_org_enabled_idx").on(table.organizationId, table.enabled),
  ],
);

/** A privacy-safe, immutable-at-creation delivery envelope. Raw audit payloads and tokens are never queued. */
export const siemDeliveryOutbox = mysqlTable(
  "siemDeliveryOutbox",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    connectionId: int("connectionId").notNull().references(() => enterpriseConnections.id, { onDelete: "cascade" }),
    auditEventId: int("auditEventId").notNull().references(() => auditEvents.id, { onDelete: "cascade" }),
    safeEnvelope: json("safeEnvelope").notNull(),
    status: siemDeliveryStatus.notNull().default("queued"),
    attempts: int("attempts").notNull().default(0),
    nextAttemptAt: timestamp("nextAttemptAt").defaultNow().notNull(),
    lastAttemptAt: timestamp("lastAttemptAt"),
    deliveredAt: timestamp("deliveredAt"),
    lastDeliveryCode: varchar("lastDeliveryCode", { length: 80 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("siem_delivery_outbox_connection_audit_unique").on(table.connectionId, table.auditEventId),
    index("siem_delivery_outbox_due_idx").on(table.connectionId, table.status, table.nextAttemptAt),
    index("siem_delivery_outbox_org_created_idx").on(table.organizationId, table.createdAt),
  ],
);

/**
 * Customer-declared resilience targets and exercise evidence. Neither declared
 * targets nor reported exercises are provider-verifiable backup guarantees.
 */
export const operationalResilienceProfiles = mysqlTable(
  "operationalResilienceProfiles",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    ownerName: varchar("ownerName", { length: 120 }).notNull(),
    backupProvider: varchar("backupProvider", { length: 120 }).notNull(),
    backupEvidenceReference: varchar("backupEvidenceReference", { length: 500 }),
    runbookReference: varchar("runbookReference", { length: 500 }),
    rtoMinutes: int("rtoMinutes").notNull(),
    rpoMinutes: int("rpoMinutes").notNull(),
    availabilitySloBasisPoints: int("availabilitySloBasisPoints").notNull(),
    status: resilienceStatus.notNull().default("draft"),
    lastExerciseOutcome: resilienceExerciseOutcome,
    lastExerciseAt: timestamp("lastExerciseAt"),
    lastExerciseEvidenceReference: varchar("lastExerciseEvidenceReference", { length: 500 }),
    lastExerciseNotes: text("lastExerciseNotes"),
    declaredBy: int("declaredBy").notNull().references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("operational_resilience_profile_org_unique").on(table.organizationId)],
);

/**
 * Native remote MCP server registry. Servers are explicitly trusted by an
 * organization administrator before a discovered tool may be enabled or used.
 * Upstream authorization values never appear in this table; only a tenant-safe
 * Vault reference is stored when a remote server requires a bearer token.
 */
export const mcpServers = mysqlTable(
  "mcpServers",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    displayName: varchar("displayName", { length: 120 }).notNull(),
    endpoint: varchar("endpoint", { length: 500 }).notNull(),
    transport: varchar("transport", { length: 32 }).notNull().default("streamable_http"),
    status: mcpServerStatus.notNull().default("pending_review"),
    vaultSecretPath: varchar("vaultSecretPath", { length: 255 }),
    protocolVersion: varchar("protocolVersion", { length: 32 }),
    toolsDigest: varchar("toolsDigest", { length: 64 }),
    lastDiscoveredAt: timestamp("lastDiscoveredAt"),
    lastErrorCode: varchar("lastErrorCode", { length: 64 }),
    createdBy: int("createdBy").notNull().references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("mcp_servers_org_endpoint_unique").on(table.organizationId, table.endpoint),
    index("mcp_servers_org_status_idx").on(table.organizationId, table.status),
  ],
);

/**
 * A reviewable catalog copied from an upstream MCP `tools/list` response.
 * The schemas are upstream metadata, not trust assertions, and a tool remains
 * non-invocable until an organization administrator explicitly enables it.
 */
export const mcpTools = mysqlTable(
  "mcpTools",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    serverId: int("serverId").notNull().references(() => mcpServers.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    title: varchar("title", { length: 240 }),
    description: text("description"),
    inputSchema: json("inputSchema").notNull(),
    outputSchema: json("outputSchema"),
    status: mcpToolStatus.notNull().default("discovered"),
    lastDiscoveredAt: timestamp("lastDiscoveredAt").defaultNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("mcp_tools_server_name_unique").on(table.serverId, table.name),
    index("mcp_tools_org_server_idx").on(table.organizationId, table.serverId),
  ],
);

/**
 * Invitation tokens are stored only as hashes. The plaintext token is revealed
 * one time to the administrator who creates the invitation.
 */
export const teamInvitations = mysqlTable(
  "teamInvitations",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    teamId: int("teamId").notNull().references(() => teams.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 320 }).notNull(),
    role: membershipRole.notNull().default("viewer"),
    tokenHash: varchar("tokenHash", { length: 64 }).notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    acceptedAt: timestamp("acceptedAt"),
    revokedAt: timestamp("revokedAt"),
    createdBy: int("createdBy").notNull().references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("team_invitations_token_hash_unique").on(table.tokenHash),
    index("team_invitations_org_email_idx").on(table.organizationId, table.email),
  ],
);

/**
 * Minimal local Stripe reference state. Amounts, payment methods, invoices,
 * and subscription lifecycle details remain the source of truth in Stripe.
 */
export const organizationBilling = mysqlTable(
  "organizationBilling",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    stripeCustomerId: varchar("stripeCustomerId", { length: 255 }),
    stripeSubscriptionId: varchar("stripeSubscriptionId", { length: 255 }),
    stripePriceId: varchar("stripePriceId", { length: 255 }),
    plan: subscriptionPlan.notNull().default("pilot"),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("organization_billing_org_unique").on(table.organizationId)],
);
