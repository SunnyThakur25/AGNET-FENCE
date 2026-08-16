CREATE TABLE `agents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`teamId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`identity` varchar(160) NOT NULL,
	`description` text,
	`agentEnvironment` enum('development','staging','production') NOT NULL DEFAULT 'development',
	`ownerUserId` int NOT NULL,
	`agentRiskLevel` enum('low','medium','high','critical') NOT NULL DEFAULT 'medium',
	`agentStatus` enum('active','paused','retired') NOT NULL DEFAULT 'active',
	`version` varchar(64) NOT NULL DEFAULT '1.0.0',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `agents_id` PRIMARY KEY(`id`),
	CONSTRAINT `agents_org_identity_unique` UNIQUE(`organizationId`,`identity`)
);
--> statement-breakpoint
CREATE TABLE `approvals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`toolCallId` int NOT NULL,
	`approvalStatus` enum('pending','approved','rejected','expired') NOT NULL DEFAULT 'pending',
	`requestedBy` varchar(160) NOT NULL,
	`reviewerUserId` int,
	`decisionReason` text,
	`expiresAt` timestamp NOT NULL,
	`decidedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `approvals_id` PRIMARY KEY(`id`),
	CONSTRAINT `approvals_tool_call_unique` UNIQUE(`toolCallId`)
);
--> statement-breakpoint
CREATE TABLE `attackSimulations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`agentId` int NOT NULL,
	`scenarioName` varchar(160) NOT NULL,
	`scenarioType` varchar(48) NOT NULL,
	`simulationStatus` enum('passed','failed','needs_review') NOT NULL,
	`expectedControl` text NOT NULL,
	`actualOutcome` text NOT NULL,
	`remediation` text NOT NULL,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `attackSimulations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `auditEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`sequence` int NOT NULL,
	`eventType` varchar(120) NOT NULL,
	`actorType` varchar(32) NOT NULL,
	`actorIdentity` varchar(160) NOT NULL,
	`agentId` int,
	`toolCallId` int,
	`policyId` int,
	`approvalId` int,
	`actionDecision` enum('allowed','blocked','approval_required','approved','rejected','simulated') NOT NULL,
	`payload` json NOT NULL,
	`previousHash` varchar(64) NOT NULL,
	`eventHash` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auditEvents_id` PRIMARY KEY(`id`),
	CONSTRAINT `audit_events_org_sequence_unique` UNIQUE(`organizationId`,`sequence`),
	CONSTRAINT `audit_events_hash_unique` UNIQUE(`eventHash`)
);
--> statement-breakpoint
CREATE TABLE `dataGuardFindings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`toolCallId` int NOT NULL,
	`classification` varchar(32) NOT NULL,
	`detector` varchar(100) NOT NULL,
	`actionTaken` varchar(32) NOT NULL,
	`occurrences` int NOT NULL DEFAULT 1,
	`destinationApproved` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `dataGuardFindings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `evidenceExports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`framework` varchar(32) NOT NULL,
	`status` varchar(32) NOT NULL DEFAULT 'ready',
	`storageKey` varchar(255) NOT NULL,
	`storageUrl` varchar(500) NOT NULL,
	`evidenceHash` varchar(64) NOT NULL,
	`generatedBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `evidenceExports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`recipientUserId` int,
	`notificationSeverity` enum('info','medium','high','critical') NOT NULL DEFAULT 'info',
	`title` varchar(180) NOT NULL,
	`content` text NOT NULL,
	`relatedType` varchar(60),
	`relatedId` int,
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`slug` varchar(80) NOT NULL,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `organizations_id` PRIMARY KEY(`id`),
	CONSTRAINT `organizations_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `policies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`teamId` int,
	`agentId` int,
	`name` varchar(160) NOT NULL,
	`description` text,
	`policyEffect` enum('allow','deny','require_approval') NOT NULL,
	`toolPattern` varchar(120) NOT NULL DEFAULT '*',
	`actionPattern` varchar(120) NOT NULL DEFAULT '*',
	`parameterConstraints` json,
	`dataSensitivity` varchar(32) NOT NULL DEFAULT 'any',
	`destinationPattern` varchar(180) NOT NULL DEFAULT '*',
	`priority` int NOT NULL DEFAULT 100,
	`policyStatus` enum('active','disabled') NOT NULL DEFAULT 'active',
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `policies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `teamMemberships` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`teamId` int NOT NULL,
	`userId` int NOT NULL,
	`membershipRole` enum('admin','operator') NOT NULL DEFAULT 'operator',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `teamMemberships_id` PRIMARY KEY(`id`),
	CONSTRAINT `team_memberships_team_user_unique` UNIQUE(`teamId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `teams` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `teams_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `toolCalls` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`agentId` int NOT NULL,
	`toolName` varchar(120) NOT NULL,
	`action` varchar(120) NOT NULL,
	`redactedParameters` json NOT NULL,
	`dataSensitivity` varchar(32) NOT NULL DEFAULT 'internal',
	`destination` varchar(180) NOT NULL DEFAULT 'internal',
	`agentRiskLevel` enum('low','medium','high','critical') NOT NULL DEFAULT 'medium',
	`actionDecision` enum('allowed','blocked','approval_required','approved','rejected','simulated') NOT NULL,
	`matchedPolicyId` int,
	`initiatedBy` varchar(160) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `toolCalls_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vaultCredentials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`teamId` int,
	`name` varchar(120) NOT NULL,
	`provider` varchar(100) NOT NULL,
	`externalReference` varchar(255) NOT NULL,
	`allowedScopes` json NOT NULL,
	`tokenTtlSeconds` int NOT NULL DEFAULT 300,
	`status` varchar(24) NOT NULL DEFAULT 'active',
	`lastRotatedAt` timestamp,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `vaultCredentials_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `agents` ADD CONSTRAINT `agents_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agents` ADD CONSTRAINT `agents_teamId_teams_id_fk` FOREIGN KEY (`teamId`) REFERENCES `teams`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agents` ADD CONSTRAINT `agents_ownerUserId_users_id_fk` FOREIGN KEY (`ownerUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `approvals` ADD CONSTRAINT `approvals_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `approvals` ADD CONSTRAINT `approvals_toolCallId_toolCalls_id_fk` FOREIGN KEY (`toolCallId`) REFERENCES `toolCalls`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `approvals` ADD CONSTRAINT `approvals_reviewerUserId_users_id_fk` FOREIGN KEY (`reviewerUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attackSimulations` ADD CONSTRAINT `attackSimulations_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attackSimulations` ADD CONSTRAINT `attackSimulations_agentId_agents_id_fk` FOREIGN KEY (`agentId`) REFERENCES `agents`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attackSimulations` ADD CONSTRAINT `attackSimulations_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `auditEvents` ADD CONSTRAINT `auditEvents_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `auditEvents` ADD CONSTRAINT `auditEvents_agentId_agents_id_fk` FOREIGN KEY (`agentId`) REFERENCES `agents`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `auditEvents` ADD CONSTRAINT `auditEvents_toolCallId_toolCalls_id_fk` FOREIGN KEY (`toolCallId`) REFERENCES `toolCalls`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `auditEvents` ADD CONSTRAINT `auditEvents_policyId_policies_id_fk` FOREIGN KEY (`policyId`) REFERENCES `policies`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `auditEvents` ADD CONSTRAINT `auditEvents_approvalId_approvals_id_fk` FOREIGN KEY (`approvalId`) REFERENCES `approvals`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dataGuardFindings` ADD CONSTRAINT `dataGuardFindings_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dataGuardFindings` ADD CONSTRAINT `dataGuardFindings_toolCallId_toolCalls_id_fk` FOREIGN KEY (`toolCallId`) REFERENCES `toolCalls`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `evidenceExports` ADD CONSTRAINT `evidenceExports_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `evidenceExports` ADD CONSTRAINT `evidenceExports_generatedBy_users_id_fk` FOREIGN KEY (`generatedBy`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_recipientUserId_users_id_fk` FOREIGN KEY (`recipientUserId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `organizations` ADD CONSTRAINT `organizations_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `policies` ADD CONSTRAINT `policies_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `policies` ADD CONSTRAINT `policies_teamId_teams_id_fk` FOREIGN KEY (`teamId`) REFERENCES `teams`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `policies` ADD CONSTRAINT `policies_agentId_agents_id_fk` FOREIGN KEY (`agentId`) REFERENCES `agents`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `policies` ADD CONSTRAINT `policies_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `teamMemberships` ADD CONSTRAINT `teamMemberships_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `teamMemberships` ADD CONSTRAINT `teamMemberships_teamId_teams_id_fk` FOREIGN KEY (`teamId`) REFERENCES `teams`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `teamMemberships` ADD CONSTRAINT `teamMemberships_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `teams` ADD CONSTRAINT `teams_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `toolCalls` ADD CONSTRAINT `toolCalls_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `toolCalls` ADD CONSTRAINT `toolCalls_agentId_agents_id_fk` FOREIGN KEY (`agentId`) REFERENCES `agents`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `toolCalls` ADD CONSTRAINT `toolCalls_matchedPolicyId_policies_id_fk` FOREIGN KEY (`matchedPolicyId`) REFERENCES `policies`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vaultCredentials` ADD CONSTRAINT `vaultCredentials_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vaultCredentials` ADD CONSTRAINT `vaultCredentials_teamId_teams_id_fk` FOREIGN KEY (`teamId`) REFERENCES `teams`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vaultCredentials` ADD CONSTRAINT `vaultCredentials_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `agents_org_idx` ON `agents` (`organizationId`);--> statement-breakpoint
CREATE INDEX `agents_team_idx` ON `agents` (`teamId`);--> statement-breakpoint
CREATE INDEX `approvals_org_status_idx` ON `approvals` (`organizationId`,`approvalStatus`);--> statement-breakpoint
CREATE INDEX `attack_simulations_org_idx` ON `attackSimulations` (`organizationId`);--> statement-breakpoint
CREATE INDEX `audit_events_org_created_idx` ON `auditEvents` (`organizationId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `data_guard_findings_org_idx` ON `dataGuardFindings` (`organizationId`);--> statement-breakpoint
CREATE INDEX `evidence_exports_org_idx` ON `evidenceExports` (`organizationId`);--> statement-breakpoint
CREATE INDEX `notifications_org_created_idx` ON `notifications` (`organizationId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `policies_org_idx` ON `policies` (`organizationId`);--> statement-breakpoint
CREATE INDEX `policies_agent_idx` ON `policies` (`agentId`);--> statement-breakpoint
CREATE INDEX `team_memberships_org_user_idx` ON `teamMemberships` (`organizationId`,`userId`);--> statement-breakpoint
CREATE INDEX `teams_org_idx` ON `teams` (`organizationId`);--> statement-breakpoint
CREATE INDEX `tool_calls_org_created_idx` ON `toolCalls` (`organizationId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `tool_calls_agent_idx` ON `toolCalls` (`agentId`);--> statement-breakpoint
CREATE INDEX `vault_credentials_org_idx` ON `vaultCredentials` (`organizationId`);