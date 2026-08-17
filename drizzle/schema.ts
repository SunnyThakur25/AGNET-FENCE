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

export const membershipRole = mysqlEnum("membershipRole", ["admin", "operator"]);
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
    createdBy: int("createdBy").notNull().references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("policies_org_idx").on(table.organizationId),
    index("policies_agent_idx").on(table.agentId),
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
