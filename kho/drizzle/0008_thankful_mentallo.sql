CREATE TABLE `account_bot_connections` (
	`user_id` integer NOT NULL,
	`kind` text NOT NULL,
	`encrypted_token` text NOT NULL,
	`iv` text NOT NULL,
	`bot_id` text NOT NULL,
	`bot_username` text NOT NULL,
	`bot_name` text DEFAULT '' NOT NULL,
	`challenge_nonce` text,
	`code_hash` text,
	`code_expires_at` text,
	`telegram_user_id` text,
	`verified_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`user_id`, `kind`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
