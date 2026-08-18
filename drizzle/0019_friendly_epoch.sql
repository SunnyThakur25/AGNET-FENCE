ALTER TABLE `notifications` ADD `agentId` int;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_agentId_agents_id_fk` FOREIGN KEY (`agentId`) REFERENCES `agents`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `notifications_org_agent_created_idx` ON `notifications` (`organizationId`,`agentId`,`createdAt`);