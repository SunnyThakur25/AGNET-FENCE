CREATE TABLE `runtimeCredentials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`agentId` int NOT NULL,
	`tokenId` varchar(64) NOT NULL,
	`runtimeCredentialStatus` enum('active','revoked','expired') NOT NULL DEFAULT 'active',
	`expiresAt` timestamp NOT NULL,
	`revokedAt` timestamp,
	`issuedBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `runtimeCredentials_id` PRIMARY KEY(`id`),
	CONSTRAINT `runtime_credentials_token_id_unique` UNIQUE(`tokenId`)
);
--> statement-breakpoint
CREATE TABLE `runtimeNonces` (
	`id` int AUTO_INCREMENT NOT NULL,
	`runtimeCredentialId` int NOT NULL,
	`nonce` varchar(96) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `runtimeNonces_id` PRIMARY KEY(`id`),
	CONSTRAINT `runtime_nonces_credential_nonce_unique` UNIQUE(`runtimeCredentialId`,`nonce`)
);
--> statement-breakpoint
ALTER TABLE `runtimeCredentials` ADD CONSTRAINT `runtimeCredentials_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `runtimeCredentials` ADD CONSTRAINT `runtimeCredentials_agentId_agents_id_fk` FOREIGN KEY (`agentId`) REFERENCES `agents`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `runtimeCredentials` ADD CONSTRAINT `runtimeCredentials_issuedBy_users_id_fk` FOREIGN KEY (`issuedBy`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `runtimeNonces` ADD CONSTRAINT `runtimeNonces_runtimeCredentialId_runtimeCredentials_id_fk` FOREIGN KEY (`runtimeCredentialId`) REFERENCES `runtimeCredentials`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `runtime_credentials_org_agent_idx` ON `runtimeCredentials` (`organizationId`,`agentId`);--> statement-breakpoint
CREATE INDEX `runtime_nonces_expiry_idx` ON `runtimeNonces` (`expiresAt`);