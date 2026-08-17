CREATE TABLE `operationalResilienceProfiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`ownerName` varchar(120) NOT NULL,
	`backupProvider` varchar(120) NOT NULL,
	`backupEvidenceReference` varchar(500),
	`runbookReference` varchar(500),
	`rtoMinutes` int NOT NULL,
	`rpoMinutes` int NOT NULL,
	`availabilitySloBasisPoints` int NOT NULL,
	`resilienceStatus` enum('draft','declared','exercise_recorded','needs_remediation') NOT NULL DEFAULT 'draft',
	`resilienceExerciseOutcome` enum('passed','failed','partial'),
	`lastExerciseAt` timestamp,
	`lastExerciseEvidenceReference` varchar(500),
	`lastExerciseNotes` text,
	`declaredBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `operationalResilienceProfiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `operational_resilience_profile_org_unique` UNIQUE(`organizationId`)
);
--> statement-breakpoint
ALTER TABLE `operationalResilienceProfiles` ADD CONSTRAINT `operationalResilienceProfiles_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `operationalResilienceProfiles` ADD CONSTRAINT `operationalResilienceProfiles_declaredBy_users_id_fk` FOREIGN KEY (`declaredBy`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;