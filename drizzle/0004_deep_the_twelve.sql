ALTER TABLE `toolCalls` ADD `targetOutcomeStatus` enum('succeeded','failed');--> statement-breakpoint
ALTER TABLE `toolCalls` ADD `targetStatusCode` int;--> statement-breakpoint
ALTER TABLE `toolCalls` ADD `targetReference` varchar(160);--> statement-breakpoint
ALTER TABLE `toolCalls` ADD `targetRecordedAt` timestamp;