ALTER TABLE `runtimeCredentials` ADD `vaultCredentialId` int;--> statement-breakpoint
ALTER TABLE `runtimeCredentials` ADD `allowedScopes` json;--> statement-breakpoint
ALTER TABLE `runtimeCredentials` ADD CONSTRAINT `runtimeCredentials_vaultCredentialId_vaultCredentials_id_fk` FOREIGN KEY (`vaultCredentialId`) REFERENCES `vaultCredentials`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `runtime_credentials_vault_credential_idx` ON `runtimeCredentials` (`vaultCredentialId`);