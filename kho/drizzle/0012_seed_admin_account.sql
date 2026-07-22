INSERT INTO `users` (`username`, `password_hash`, `password_salt`, `role`, `active`, `must_change_password`)
SELECT 'admin', '42abeb46bb3b232b53e11d058187005d84d84abe23de66503a878b8da91bebfc', '+057z420C/Epgx2y1CUZRA==', 'admin', 1, 0
WHERE NOT EXISTS (
	SELECT 1 FROM `users` WHERE `username` = 'admin' OR `role` = 'admin'
);
