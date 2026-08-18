CREATE TABLE `agentContainments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`agentId` int NOT NULL,
	`incidentContainmentStatus` enum('active','released') NOT NULL DEFAULT 'active',
	`incidentContainmentTrigger` enum('manual','critical_block') NOT NULL,
	`reason` varchar(500) NOT NULL,
	`relatedToolCallId` int,
	`initiatedBy` int,
	`releasedBy` int,
	`releasedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `agentContainments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `incidentResponseSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`autoContainCriticalBlocks` boolean NOT NULL DEFAULT false,
	`updatedBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `incidentResponseSettings_id` PRIMARY KEY(`id`),
	CONSTRAINT `incident_response_settings_org_unique` UNIQUE(`organizationId`)
);
--> statement-breakpoint
ALTER TABLE `agentContainments` ADD CONSTRAINT `agentContainments_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agentContainments` ADD CONSTRAINT `agentContainments_agentId_agents_id_fk` FOREIGN KEY (`agentId`) REFERENCES `agents`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agentContainments` ADD CONSTRAINT `agentContainments_relatedToolCallId_toolCalls_id_fk` FOREIGN KEY (`relatedToolCallId`) REFERENCES `toolCalls`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agentContainments` ADD CONSTRAINT `agentContainments_initiatedBy_users_id_fk` FOREIGN KEY (`initiatedBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agentContainments` ADD CONSTRAINT `agentContainments_releasedBy_users_id_fk` FOREIGN KEY (`releasedBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `incidentResponseSettings` ADD CONSTRAINT `incidentResponseSettings_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `incidentResponseSettings` ADD CONSTRAINT `incidentResponseSettings_updatedBy_users_id_fk` FOREIGN KEY (`updatedBy`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `agent_containments_org_status_idx` ON `agentContainments` (`organizationId`,`incidentContainmentStatus`);--> statement-breakpoint
CREATE INDEX `agent_containments_agent_idx` ON `agentContainments` (`agentId`);