CREATE TABLE `free_claims` (
	`telegram_user_id` text NOT NULL,
	`product_id` integer NOT NULL,
	`claimed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`order_code` text NOT NULL,
	PRIMARY KEY(`telegram_user_id`, `product_id`),
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
DROP INDEX `orders_one_free_per_telegram_product`;--> statement-breakpoint
INSERT INTO `free_claims` (`telegram_user_id`,`product_id`,`claimed_at`,`order_code`)
SELECT `telegram_user_id`,`product_id`,MAX(`created_at`),MAX(`code`)
FROM `orders` WHERE `amount`=0 AND `status`='DELIVERED'
GROUP BY `telegram_user_id`,`product_id`;
