CREATE TABLE `endpointAgentBindings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`endpointId` int NOT NULL,
	`agentId` int NOT NULL,
	`endpointBindingKind` enum('sdk','browser_wrapper','native_mcp') NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `endpointAgentBindings_id` PRIMARY KEY(`id`),
	CONSTRAINT `endpoint_agent_bindings_unique` UNIQUE(`endpointId`,`agentId`,`endpointBindingKind`)
);
--> statement-breakpoint
CREATE TABLE `endpointContainments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`endpointId` int NOT NULL,
	`endpointContainmentStatus` enum('active','released') NOT NULL DEFAULT 'active',
	`reason` varchar(500) NOT NULL,
	`initiatedBy` int,
	`releasedBy` int,
	`releasedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `endpointContainments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `managedEndpoints` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`teamId` int,
	`ownerUserId` int,
	`deviceIdentity` varchar(160) NOT NULL,
	`displayName` varchar(120) NOT NULL,
	`endpointOperatingSystem` enum('windows','macos','linux') NOT NULL,
	`endpointSensorStatus` enum('registered','healthy','degraded','offline','isolated') NOT NULL DEFAULT 'registered',
	`sensorVersion` varchar(64),
	`deploymentReference` varchar(255),
	`lastSeenAt` timestamp,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `managedEndpoints_id` PRIMARY KEY(`id`),
	CONSTRAINT `managed_endpoints_org_device_unique` UNIQUE(`organizationId`,`deviceIdentity`)
);
--> statement-breakpoint
ALTER TABLE `endpointAgentBindings` ADD CONSTRAINT `endpointAgentBindings_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `endpointAgentBindings` ADD CONSTRAINT `endpointAgentBindings_endpointId_managedEndpoints_id_fk` FOREIGN KEY (`endpointId`) REFERENCES `managedEndpoints`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `endpointAgentBindings` ADD CONSTRAINT `endpointAgentBindings_agentId_agents_id_fk` FOREIGN KEY (`agentId`) REFERENCES `agents`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `endpointAgentBindings` ADD CONSTRAINT `endpointAgentBindings_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `endpointContainments` ADD CONSTRAINT `endpointContainments_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `endpointContainments` ADD CONSTRAINT `endpointContainments_endpointId_managedEndpoints_id_fk` FOREIGN KEY (`endpointId`) REFERENCES `managedEndpoints`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `endpointContainments` ADD CONSTRAINT `endpointContainments_initiatedBy_users_id_fk` FOREIGN KEY (`initiatedBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `endpointContainments` ADD CONSTRAINT `endpointContainments_releasedBy_users_id_fk` FOREIGN KEY (`releasedBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `managedEndpoints` ADD CONSTRAINT `managedEndpoints_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `managedEndpoints` ADD CONSTRAINT `managedEndpoints_teamId_teams_id_fk` FOREIGN KEY (`teamId`) REFERENCES `teams`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `managedEndpoints` ADD CONSTRAINT `managedEndpoints_ownerUserId_users_id_fk` FOREIGN KEY (`ownerUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `managedEndpoints` ADD CONSTRAINT `managedEndpoints_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `endpoint_agent_bindings_org_agent_idx` ON `endpointAgentBindings` (`organizationId`,`agentId`);--> statement-breakpoint
CREATE INDEX `endpoint_containments_org_status_idx` ON `endpointContainments` (`organizationId`,`endpointContainmentStatus`);--> statement-breakpoint
CREATE INDEX `endpoint_containments_endpoint_idx` ON `endpointContainments` (`endpointId`);--> statement-breakpoint
CREATE INDEX `managed_endpoints_org_status_idx` ON `managedEndpoints` (`organizationId`,`endpointSensorStatus`);