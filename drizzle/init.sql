-- 초기 DB 스키마 (drizzle-kit push 대신 직접 실행할 경우 사용)

CREATE TABLE IF NOT EXISTS `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `openId` varchar(255) NOT NULL,
  `name` varchar(255),
  `email` varchar(255),
  `loginMethod` varchar(50),
  `role` varchar(50) NOT NULL DEFAULT 'user',
  `lastSignedIn` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `openId` (`openId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `transactions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `txDate` date NOT NULL,
  `txTime` varchar(8) NOT NULL DEFAULT '',
  `txType` varchar(20) NOT NULL,
  `category` varchar(50) NOT NULL,
  `subCategory` varchar(50),
  `content` varchar(255) NOT NULL,
  `amount` decimal(15,2) NOT NULL,
  `currency` varchar(10) NOT NULL DEFAULT 'KRW',
  `paymentMethod` varchar(100),
  `memo` varchar(500),
  `customCategory` varchar(50),
  `dedupHash` varchar(64) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `dedupHash` (`dedupHash`),
  KEY `userId_txDate` (`userId`, `txDate`),
  CONSTRAINT `transactions_userId_fk` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `user_settings` (
  `userId` int NOT NULL,
  `excludedCategories` text,
  `includeTransfer` tinyint(1) NOT NULL DEFAULT 0,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`userId`),
  CONSTRAINT `user_settings_userId_fk` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `excluded_transactions` (
  `userId` int NOT NULL,
  `transactionId` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`userId`, `transactionId`),
  CONSTRAINT `et_userId_fk` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `et_transactionId_fk` FOREIGN KEY (`transactionId`) REFERENCES `transactions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `category_rules` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `keyword` varchar(255) NOT NULL,
  `category` varchar(50) NOT NULL,
  `isExact` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `userId_keyword` (`userId`, `keyword`),
  KEY `userId` (`userId`),
  CONSTRAINT `cr_userId_fk` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
