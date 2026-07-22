ALTER TABLE `users` RENAME COLUMN `email` TO `username`;--> statement-breakpoint
DROP INDEX `users_email_unique`;--> statement-breakpoint
UPDATE `users` AS `target`
SET `username` = lower(substr(`target`.`username`, 1, instr(`target`.`username`, '@') - 1))
WHERE instr(`target`.`username`, '@') > 1
  AND NOT EXISTS (
    SELECT 1 FROM `users` AS `other`
    WHERE `other`.`id` <> `target`.`id`
      AND lower(CASE WHEN instr(`other`.`username`, '@') > 1 THEN substr(`other`.`username`, 1, instr(`other`.`username`, '@') - 1) ELSE `other`.`username` END)
        = lower(substr(`target`.`username`, 1, instr(`target`.`username`, '@') - 1))
  );--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);
