CREATE TABLE `enterpriseConnections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`enterpriseConnectionKind` enum('splunk_hec','microsoft_sentinel','pagerduty_events','oidc','scim','vault_approle') NOT NULL,
	`displayName` varchar(120) NOT NULL,
	`endpoint` varchar(500),
	`safeConfig` json,
	`vaultSecretPath` varchar(255),
	`enterpriseConnectionStatus` enum('not_configured','pending_activation','ready','unhealthy') NOT NULL DEFAULT 'not_configured',
	`lastTestedAt` timestamp,
	`lastErrorCode` varchar(64),
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `enterpriseConnections_id` PRIMARY KEY(`id`),
	CONSTRAINT `enterprise_connections_org_kind_unique` UNIQUE(`organizationId`,`enterpriseConnectionKind`)
);
--> statement-breakpoint
CREATE TABLE `organizationBilling` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`stripeCustomerId` varchar(255),
	`stripeSubscriptionId` varchar(255),
	`stripePriceId` varchar(255),
	`subscriptionPlan` enum('pilot','growth','enterprise') NOT NULL DEFAULT 'pilot',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `organizationBilling_id` PRIMARY KEY(`id`),
	CONSTRAINT `organization_billing_org_unique` UNIQUE(`organizationId`)
);
--> statement-breakpoint
CREATE TABLE `teamInvitations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`teamId` int NOT NULL,
	`email` varchar(320) NOT NULL,
	`membershipRole` enum('admin','operator','viewer','billing_admin') NOT NULL DEFAULT 'viewer',
	`tokenHash` varchar(64) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`acceptedAt` timestamp,
	`revokedAt` timestamp,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `teamInvitations_id` PRIMARY KEY(`id`),
	CONSTRAINT `team_invitations_token_hash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
ALTER TABLE `teamMemberships` MODIFY COLUMN `membershipRole` enum('admin','operator','viewer','billing_admin') NOT NULL DEFAULT 'operator';--> statement-breakpoint
ALTER TABLE `enterpriseConnections` ADD CONSTRAINT `enterpriseConnections_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `enterpriseConnections` ADD CONSTRAINT `enterpriseConnections_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `organizationBilling` ADD CONSTRAINT `organizationBilling_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `teamInvitations` ADD CONSTRAINT `teamInvitations_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `teamInvitations` ADD CONSTRAINT `teamInvitations_teamId_teams_id_fk` FOREIGN KEY (`teamId`) REFERENCES `teams`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `teamInvitations` ADD CONSTRAINT `teamInvitations_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `enterprise_connections_org_idx` ON `enterpriseConnections` (`organizationId`);--> statement-breakpoint
CREATE INDEX `team_invitations_org_email_idx` ON `teamInvitations` (`organizationId`,`email`);