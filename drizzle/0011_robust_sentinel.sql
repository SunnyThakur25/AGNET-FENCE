CREATE TABLE `mcpServers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`displayName` varchar(120) NOT NULL,
	`endpoint` varchar(500) NOT NULL,
	`transport` varchar(32) NOT NULL DEFAULT 'streamable_http',
	`mcpServerStatus` enum('pending_review','trusted','unhealthy','disabled') NOT NULL DEFAULT 'pending_review',
	`vaultSecretPath` varchar(255),
	`protocolVersion` varchar(32),
	`toolsDigest` varchar(64),
	`lastDiscoveredAt` timestamp,
	`lastErrorCode` varchar(64),
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mcpServers_id` PRIMARY KEY(`id`),
	CONSTRAINT `mcp_servers_org_endpoint_unique` UNIQUE(`organizationId`,`endpoint`)
);
--> statement-breakpoint
CREATE TABLE `mcpTools` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`serverId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`title` varchar(240),
	`description` text,
	`inputSchema` json NOT NULL,
	`outputSchema` json,
	`mcpToolStatus` enum('discovered','enabled','disabled') NOT NULL DEFAULT 'discovered',
	`lastDiscoveredAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mcpTools_id` PRIMARY KEY(`id`),
	CONSTRAINT `mcp_tools_server_name_unique` UNIQUE(`serverId`,`name`)
);
--> statement-breakpoint
ALTER TABLE `mcpServers` ADD CONSTRAINT `mcpServers_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mcpServers` ADD CONSTRAINT `mcpServers_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mcpTools` ADD CONSTRAINT `mcpTools_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mcpTools` ADD CONSTRAINT `mcpTools_serverId_mcpServers_id_fk` FOREIGN KEY (`serverId`) REFERENCES `mcpServers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `mcp_servers_org_status_idx` ON `mcpServers` (`organizationId`,`mcpServerStatus`);--> statement-breakpoint
CREATE INDEX `mcp_tools_org_server_idx` ON `mcpTools` (`organizationId`,`serverId`);