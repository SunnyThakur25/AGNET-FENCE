CREATE TABLE `auditAnchors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`ledgerSequence` int NOT NULL,
	`ledgerEventHash` varchar(64) NOT NULL,
	`anchorHash` varchar(64) NOT NULL,
	`storageKey` varchar(255) NOT NULL,
	`storageUrl` varchar(500) NOT NULL,
	`auditAnchorStatus` enum('prepared','external_receipt_recorded','verification_failed') NOT NULL DEFAULT 'prepared',
	`externalProvider` varchar(48),
	`externalReference` varchar(500),
	`retentionMode` varchar(48),
	`receiptRecordedBy` int,
	`receiptRecordedAt` timestamp,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auditAnchors_id` PRIMARY KEY(`id`),
	CONSTRAINT `audit_anchors_org_sequence_unique` UNIQUE(`organizationId`,`ledgerSequence`)
);
--> statement-breakpoint
ALTER TABLE `auditAnchors` ADD CONSTRAINT `auditAnchors_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `auditAnchors` ADD CONSTRAINT `auditAnchors_receiptRecordedBy_users_id_fk` FOREIGN KEY (`receiptRecordedBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `auditAnchors` ADD CONSTRAINT `auditAnchors_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `audit_anchors_org_created_idx` ON `auditAnchors` (`organizationId`,`createdAt`);