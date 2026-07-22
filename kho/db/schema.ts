import { sql } from "drizzle-orm";
import { integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  role: text("role", { enum: ["admin", "user"] }).notNull().default("user"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  mustChangePassword: integer("must_change_password", {mode:"boolean"}).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const sessions = sqliteTable("sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  price: real("price").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  ownerId: integer("owner_id").references(() => users.id),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const stockItems = sqliteTable("stock_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: integer("product_id").notNull().references(() => products.id),
  encryptedValue: text("encrypted_value").notNull(),
  iv: text("iv").notNull(),
  hint: text("hint").notNull().default("Key đã mã hóa"),
  status: text("status", { enum: ["AVAILABLE", "RESERVED", "SOLD"] }).notNull().default("AVAILABLE"),
  reservedUntil: text("reserved_until"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  telegramUserId: text("telegram_user_id").notNull(),
  telegramChatId: text("telegram_chat_id").notNull(),
  productId: integer("product_id").notNull().references(() => products.id),
  stockItemId: integer("stock_item_id").references(() => stockItems.id),
  quantity: integer("quantity").notNull().default(1),
  amount: real("amount").notNull(),
  status: text("status", { enum: ["PENDING", "PAID", "DELIVERED", "CANCELLED", "REFUND_REQUIRED"] }).notNull().default("PENDING"),
  deliveredAt: text("delivered_at"),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const orderItems = sqliteTable("order_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id").notNull().references(() => orders.id),
  stockItemId: integer("stock_item_id").notNull().references(() => stockItems.id),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const freeClaims = sqliteTable("free_claims", {
  telegramUserId: text("telegram_user_id").notNull(),
  productId: integer("product_id").notNull().references(() => products.id),
  claimedAt: text("claimed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  orderCode: text("order_code").notNull(),
}, (table) => [primaryKey({columns:[table.telegramUserId,table.productId]})]);

export const payments = sqliteTable("payments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  transactionId: text("transaction_id").notNull().unique(),
  orderCode: text("order_code").notNull(),
  amount: real("amount").notNull(),
  rawPayload: text("raw_payload").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const systemSettings = sqliteTable("system_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const secretSettings = sqliteTable("secret_settings", {
  key: text("key").primaryKey(),
  encryptedValue: text("encrypted_value").notNull(),
  iv: text("iv").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const accountSettings = sqliteTable("account_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id),
  key: text("key").notNull(),
  value: text("value").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const accountBots = sqliteTable("account_bots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().unique().references(() => users.id),
  encryptedToken: text("encrypted_token").notNull(),
  iv: text("iv").notNull(),
  botId: text("bot_id").notNull(),
  botUsername: text("bot_username").notNull(),
  botName: text("bot_name").notNull().default(""),
  challengeNonce: text("challenge_nonce"),
  codeHash: text("code_hash"),
  codeExpiresAt: text("code_expires_at"),
  adminTelegramId: text("admin_telegram_id"),
  verifiedAt: text("verified_at"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const accountBotConnections = sqliteTable("account_bot_connections", {
  userId: integer("user_id").notNull().references(() => users.id),
  kind: text("kind", {enum:["sales","admin"]}).notNull(),
  encryptedToken: text("encrypted_token").notNull(),
  iv: text("iv").notNull(),
  botId: text("bot_id").notNull(),
  botUsername: text("bot_username").notNull(),
  botName: text("bot_name").notNull().default(""),
  challengeNonce: text("challenge_nonce"),
  codeHash: text("code_hash"),
  codeExpiresAt: text("code_expires_at"),
  telegramUserId: text("telegram_user_id"),
  verifiedAt: text("verified_at"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [primaryKey({columns:[table.userId,table.kind]}),uniqueIndex("account_bot_connections_bot_id_unique").on(table.botId)]);
