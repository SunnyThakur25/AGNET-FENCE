CREATE TABLE `activeSessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`sessionTokenHash` varchar(64) NOT NULL,
	`deviceInfo` varchar(255),
	`ipAddress` varchar(45),
	`lastActiveAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `activeSessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `active_sessions_hash_unique` UNIQUE(`sessionTokenHash`)
);
--> statement-breakpoint
ALTER TABLE `activeSessions` ADD CONSTRAINT `activeSessions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `active_sessions_user_idx` ON `activeSessions` (`userId`);