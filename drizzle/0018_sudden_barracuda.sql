CREATE TABLE `incidentRoutingProfiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`incidentRoutingProvider` enum('slack','pagerduty') NOT NULL,
	`incidentRoutingStatus` enum('disabled','activation_required','configured') NOT NULL DEFAULT 'disabled',
	`ownerMembershipId` int,
	`destinationReference` varchar(255),
	`vaultSecretPath` varchar(255),
	`updatedBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `incidentRoutingProfiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `incident_routing_profiles_org_provider_unique` UNIQUE(`organizationId`,`incidentRoutingProvider`)
);
--> statement-breakpoint
ALTER TABLE `incidentResponseSettings` ADD `incidentCommanderMembershipId` int;--> statement-breakpoint
ALTER TABLE `incidentResponseSettings` ADD `containmentRunbookReference` varchar(500);--> statement-breakpoint
ALTER TABLE `incidentResponseSettings` ADD `approvalEscalationMinutes` int DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE `incidentRoutingProfiles` ADD CONSTRAINT `incidentRoutingProfiles_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `incidentRoutingProfiles` ADD CONSTRAINT `incidentRoutingProfiles_ownerMembershipId_teamMemberships_id_fk` FOREIGN KEY (`ownerMembershipId`) REFERENCES `teamMemberships`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `incidentRoutingProfiles` ADD CONSTRAINT `incidentRoutingProfiles_updatedBy_users_id_fk` FOREIGN KEY (`updatedBy`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `incidentResponseSettings` ADD CONSTRAINT `irs_commander_membership_fk` FOREIGN KEY (`incidentCommanderMembershipId`) REFERENCES `teamMemberships`(`id`) ON DELETE set null ON UPDATE no action;
