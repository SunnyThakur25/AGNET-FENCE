CREATE TABLE `connectorCertifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`connectionId` int NOT NULL,
	`connectorCertificationStatus` enum('pending','certified','failed','activation_required') NOT NULL DEFAULT 'pending',
	`evidenceCode` varchar(80) NOT NULL,
	`certifiedBy` int,
	`certifiedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `connectorCertifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `policyRevisions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`policyId` int NOT NULL,
	`revision` int NOT NULL,
	`baseRevision` int NOT NULL,
	`policyRevisionStatus` enum('draft','pending_review','approved','rejected','promoted','superseded') NOT NULL DEFAULT 'draft',
	`changeSummary` varchar(500) NOT NULL,
	`snapshot` json NOT NULL,
	`createdBy` int NOT NULL,
	`reviewedBy` int,
	`reviewComment` text,
	`reviewedAt` timestamp,
	`promotedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `policyRevisions_id` PRIMARY KEY(`id`),
	CONSTRAINT `policy_revisions_policy_revision_unique` UNIQUE(`policyId`,`revision`)
);
--> statement-breakpoint
ALTER TABLE `policies` ADD `currentRevision` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `connectorCertifications` ADD CONSTRAINT `connectorCertifications_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `connectorCertifications` ADD CONSTRAINT `connectorCertifications_connectionId_enterpriseConnections_id_fk` FOREIGN KEY (`connectionId`) REFERENCES `enterpriseConnections`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `connectorCertifications` ADD CONSTRAINT `connectorCertifications_certifiedBy_users_id_fk` FOREIGN KEY (`certifiedBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `policyRevisions` ADD CONSTRAINT `policyRevisions_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `policyRevisions` ADD CONSTRAINT `policyRevisions_policyId_policies_id_fk` FOREIGN KEY (`policyId`) REFERENCES `policies`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `policyRevisions` ADD CONSTRAINT `policyRevisions_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `policyRevisions` ADD CONSTRAINT `policyRevisions_reviewedBy_users_id_fk` FOREIGN KEY (`reviewedBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `connector_certifications_connection_created_idx` ON `connectorCertifications` (`connectionId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `policy_revisions_org_status_idx` ON `policyRevisions` (`organizationId`,`policyRevisionStatus`);