CREATE TABLE `siemDeliveryOutbox` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`connectionId` int NOT NULL,
	`auditEventId` int NOT NULL,
	`safeEnvelope` json NOT NULL,
	`siemDeliveryStatus` enum('queued','delivered','retrying','failed','skipped') NOT NULL DEFAULT 'queued',
	`attempts` int NOT NULL DEFAULT 0,
	`nextAttemptAt` timestamp NOT NULL DEFAULT (now()),
	`lastAttemptAt` timestamp,
	`deliveredAt` timestamp,
	`lastDeliveryCode` varchar(80),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `siemDeliveryOutbox_id` PRIMARY KEY(`id`),
	CONSTRAINT `siem_delivery_outbox_connection_audit_unique` UNIQUE(`connectionId`,`auditEventId`)
);
--> statement-breakpoint
CREATE TABLE `siemDeliverySettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`connectionId` int NOT NULL,
	`enabled` boolean NOT NULL DEFAULT false,
	`scheduleCronTaskUid` varchar(65),
	`batchSize` int NOT NULL DEFAULT 25,
	`maxAttempts` int NOT NULL DEFAULT 5,
	`lastEnqueuedSequence` int NOT NULL DEFAULT 0,
	`lastDeliveryAt` timestamp,
	`lastDeliveryCode` varchar(80),
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `siemDeliverySettings_id` PRIMARY KEY(`id`),
	CONSTRAINT `siem_delivery_settings_connection_unique` UNIQUE(`connectionId`),
	CONSTRAINT `siem_delivery_settings_task_uid_unique` UNIQUE(`scheduleCronTaskUid`)
);
--> statement-breakpoint
ALTER TABLE `siemDeliveryOutbox` ADD CONSTRAINT `siemDeliveryOutbox_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `siemDeliveryOutbox` ADD CONSTRAINT `siemDeliveryOutbox_connectionId_enterpriseConnections_id_fk` FOREIGN KEY (`connectionId`) REFERENCES `enterpriseConnections`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `siemDeliveryOutbox` ADD CONSTRAINT `siemDeliveryOutbox_auditEventId_auditEvents_id_fk` FOREIGN KEY (`auditEventId`) REFERENCES `auditEvents`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `siemDeliverySettings` ADD CONSTRAINT `siemDeliverySettings_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `siemDeliverySettings` ADD CONSTRAINT `siemDeliverySettings_connectionId_enterpriseConnections_id_fk` FOREIGN KEY (`connectionId`) REFERENCES `enterpriseConnections`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `siemDeliverySettings` ADD CONSTRAINT `siemDeliverySettings_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `siem_delivery_outbox_due_idx` ON `siemDeliveryOutbox` (`connectionId`,`siemDeliveryStatus`,`nextAttemptAt`);--> statement-breakpoint
CREATE INDEX `siem_delivery_outbox_org_created_idx` ON `siemDeliveryOutbox` (`organizationId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `siem_delivery_settings_org_enabled_idx` ON `siemDeliverySettings` (`organizationId`,`enabled`);