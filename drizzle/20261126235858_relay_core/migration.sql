CREATE TABLE `client_policy` (
	`client_id` text PRIMARY KEY,
	`mode` text DEFAULT 'code' NOT NULL,
	`read_only` integer DEFAULT false NOT NULL,
	`allowed_provider_ids` text DEFAULT '[]' NOT NULL,
	`revoked_at` integer,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_client_policy_client_id_oauth_client_client_id_fk` FOREIGN KEY (`client_id`) REFERENCES `oauth_client`(`client_id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `execution_log` (
	`id` text PRIMARY KEY,
	`client_id` text,
	`client_name` text,
	`kind` text NOT NULL,
	`provider_slug` text,
	`tool_name` text,
	`code` text,
	`tool_call_count` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`error_message` text,
	`duration_ms` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `provider` (
	`id` text PRIMARY KEY,
	`slug` text NOT NULL UNIQUE,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`read_only` integer DEFAULT false NOT NULL,
	`url` text,
	`auth_type` text DEFAULT 'oauth' NOT NULL,
	`encrypted_auth_secret` text,
	`builtin_key` text,
	`encrypted_config` text,
	`last_synced_at` integer,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `provider_oauth_state` (
	`provider_id` text PRIMARY KEY,
	`encrypted_client_info` text,
	`encrypted_tokens` text,
	`discovery_state` text,
	`encrypted_code_verifier` text,
	`oauth_state` text,
	`oauth_state_expires_at` integer,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_provider_oauth_state_provider_id_provider_id_fk` FOREIGN KEY (`provider_id`) REFERENCES `provider`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `provider_tool` (
	`id` text PRIMARY KEY,
	`provider_id` text NOT NULL,
	`name` text NOT NULL,
	`js_name` text NOT NULL,
	`title` text,
	`description` text DEFAULT '' NOT NULL,
	`input_schema` text NOT NULL,
	`output_schema` text,
	`read_only` integer DEFAULT false NOT NULL,
	`destructive` integer DEFAULT false NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_provider_tool_provider_id_provider_id_fk` FOREIGN KEY (`provider_id`) REFERENCES `provider`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `executionLog_createdAt_idx` ON `execution_log` (`created_at`);--> statement-breakpoint
CREATE INDEX `providerOauthState_oauthState_idx` ON `provider_oauth_state` (`oauth_state`);--> statement-breakpoint
CREATE INDEX `providerTool_providerId_idx` ON `provider_tool` (`provider_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `providerTool_providerId_name_uidx` ON `provider_tool` (`provider_id`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `providerTool_providerId_jsName_uidx` ON `provider_tool` (`provider_id`,`js_name`);--> statement-breakpoint
CREATE VIRTUAL TABLE IF NOT EXISTS `provider_tool_fts` USING fts5(
	`tool_id` UNINDEXED,
	`provider_slug`,
	`name`,
	`js_name`,
	`title`,
	`description`,
	`schema_keys`,
	tokenize = 'porter unicode61'
);