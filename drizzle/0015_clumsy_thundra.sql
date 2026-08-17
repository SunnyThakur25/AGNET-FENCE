CREATE TABLE `auditExportSchedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`framework` varchar(32) NOT NULL,
	`auditExportDeliveryMode` enum('managed_archive','customer_storage_activation_required') NOT NULL DEFAULT 'managed_archive',
	`auditExportScheduleStatus` enum('draft','active','paused','unhealthy') NOT NULL DEFAULT 'draft',
	`scheduleCronTaskUid` varchar(65),
	`lastRunAt` timestamp,
	`lastRunCode` varchar(80),
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `auditExportSchedules_id` PRIMARY KEY(`id`),
	CONSTRAINT `audit_export_schedules_org_framework_unique` UNIQUE(`organizationId`,`framework`),
	CONSTRAINT `audit_export_schedules_task_uid_unique` UNIQUE(`scheduleCronTaskUid`)
);
--> statement-breakpoint
CREATE TABLE `tenantQuotaPolicies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`gatewayEvaluationsPerMinute` int NOT NULL DEFAULT 600,
	`evidenceExportsPerDay` int NOT NULL DEFAULT 24,
	`updatedBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tenantQuotaPolicies_id` PRIMARY KEY(`id`),
	CONSTRAINT `tenant_quota_policies_org_unique` UNIQUE(`organizationId`)
);
--> statement-breakpoint
CREATE TABLE `tenantUsageWindows` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`tenantUsageKind` enum('gateway_evaluations','evidence_exports') NOT NULL,
	`windowStartedAt` timestamp NOT NULL,
	`usedCount` int NOT NULL DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tenantUsageWindows_id` PRIMARY KEY(`id`),
	CONSTRAINT `tenant_usage_windows_org_kind_start_unique` UNIQUE(`organizationId`,`tenantUsageKind`,`windowStartedAt`)
);
--> statement-breakpoint
ALTER TABLE `evidenceExports` ADD `scheduleId` int;--> statement-breakpoint
ALTER TABLE `evidenceExports` ADD `scheduleRunKey` varchar(32);--> statement-breakpoint
ALTER TABLE `toolCalls` ADD `policyDecisionLatencyMs` int;--> statement-breakpoint
ALTER TABLE `evidenceExports` ADD CONSTRAINT `evidence_exports_schedule_run_unique` UNIQUE(`scheduleId`,`scheduleRunKey`);--> statement-breakpoint
ALTER TABLE `auditExportSchedules` ADD CONSTRAINT `auditExportSchedules_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `auditExportSchedules` ADD CONSTRAINT `auditExportSchedules_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tenantQuotaPolicies` ADD CONSTRAINT `tenantQuotaPolicies_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tenantQuotaPolicies` ADD CONSTRAINT `tenantQuotaPolicies_updatedBy_users_id_fk` FOREIGN KEY (`updatedBy`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tenantUsageWindows` ADD CONSTRAINT `tenantUsageWindows_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `audit_export_schedules_org_status_idx` ON `auditExportSchedules` (`organizationId`,`auditExportScheduleStatus`);--> statement-breakpoint
CREATE INDEX `tenant_usage_windows_org_kind_idx` ON `tenantUsageWindows` (`organizationId`,`tenantUsageKind`);