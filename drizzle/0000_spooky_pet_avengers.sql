CREATE TABLE `daily_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_key` text NOT NULL,
	`log_date` text NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`amount` integer,
	`logged_at` integer NOT NULL,
	`source` text DEFAULT 'web' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `daily_logs_user_date_idx` ON `daily_logs` (`user_key`,`log_date`);--> statement-breakpoint
CREATE INDEX `daily_logs_user_kind_idx` ON `daily_logs` (`user_key`,`kind`);--> statement-breakpoint
CREATE TABLE `daily_todos` (
	`id` text PRIMARY KEY NOT NULL,
	`user_key` text NOT NULL,
	`task_date` text NOT NULL,
	`text` text NOT NULL,
	`done` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `daily_todos_user_date_idx` ON `daily_todos` (`user_key`,`task_date`);