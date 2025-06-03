import { pgTable, text, serial, integer, boolean, timestamp, decimal, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  balance: decimal("balance", { precision: 20, scale: 8 }).notNull().default("0"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const cryptocurrencies = pgTable("cryptocurrencies", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull().unique(),
  name: text("name").notNull(),
  currentPrice: decimal("current_price", { precision: 20, scale: 8 }).notNull(),
  priceChange24h: decimal("price_change_24h", { precision: 10, scale: 2 }).notNull().default("0"),
  marketCap: decimal("market_cap", { precision: 30, scale: 2 }),
  volume24h: decimal("volume_24h", { precision: 30, scale: 2 }),
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
});

export const trades = pgTable("trades", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  cryptoId: integer("crypto_id").notNull().references(() => cryptocurrencies.id),
  type: text("type").notNull(), // 'buy' or 'sell'
  amount: decimal("amount", { precision: 20, scale: 8 }).notNull(),
  price: decimal("price", { precision: 20, scale: 8 }).notNull(),
  total: decimal("total", { precision: 20, scale: 8 }).notNull(),
  pnl: decimal("pnl", { precision: 20, scale: 8 }),
  isBot: boolean("is_bot").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const portfolio = pgTable("portfolio", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  cryptoId: integer("crypto_id").notNull().references(() => cryptocurrencies.id),
  amount: decimal("amount", { precision: 20, scale: 8 }).notNull(),
  averagePrice: decimal("average_price", { precision: 20, scale: 8 }).notNull(),
  totalInvested: decimal("total_invested", { precision: 20, scale: 8 }).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const botSettings = pgTable("bot_settings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  isActive: boolean("is_active").notNull().default(false),
  strategy: text("strategy").notNull().default("scalping"),
  riskLevel: integer("risk_level").notNull().default(5),
  maxDailyLoss: decimal("max_daily_loss", { precision: 20, scale: 8 }).notNull().default("50"),
  targetProfit: decimal("target_profit", { precision: 20, scale: 8 }).notNull().default("100"),
  tradingPairs: jsonb("trading_pairs").notNull().default([]),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const priceHistory = pgTable("price_history", {
  id: serial("id").primaryKey(),
  cryptoId: integer("crypto_id").notNull().references(() => cryptocurrencies.id),
  price: decimal("price", { precision: 20, scale: 8 }).notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  trades: many(trades),
  portfolio: many(portfolio),
  botSettings: many(botSettings),
}));

export const cryptocurrenciesRelations = relations(cryptocurrencies, ({ many }) => ({
  trades: many(trades),
  portfolio: many(portfolio),
  priceHistory: many(priceHistory),
}));

export const tradesRelations = relations(trades, ({ one }) => ({
  user: one(users, { fields: [trades.userId], references: [users.id] }),
  cryptocurrency: one(cryptocurrencies, { fields: [trades.cryptoId], references: [cryptocurrencies.id] }),
}));

export const portfolioRelations = relations(portfolio, ({ one }) => ({
  user: one(users, { fields: [portfolio.userId], references: [users.id] }),
  cryptocurrency: one(cryptocurrencies, { fields: [portfolio.cryptoId], references: [cryptocurrencies.id] }),
}));

export const botSettingsRelations = relations(botSettings, ({ one }) => ({
  user: one(users, { fields: [botSettings.userId], references: [users.id] }),
}));

export const priceHistoryRelations = relations(priceHistory, ({ one }) => ({
  cryptocurrency: one(cryptocurrencies, { fields: [priceHistory.cryptoId], references: [cryptocurrencies.id] }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const insertCryptocurrencySchema = createInsertSchema(cryptocurrencies).omit({
  id: true,
  lastUpdated: true,
});

export const insertTradeSchema = createInsertSchema(trades).omit({
  id: true,
  createdAt: true,
});

export const insertPortfolioSchema = createInsertSchema(portfolio).omit({
  id: true,
  updatedAt: true,
});

export const insertBotSettingsSchema = createInsertSchema(botSettings).omit({
  id: true,
  updatedAt: true,
});

export const insertPriceHistorySchema = createInsertSchema(priceHistory).omit({
  id: true,
  timestamp: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Cryptocurrency = typeof cryptocurrencies.$inferSelect;
export type InsertCryptocurrency = z.infer<typeof insertCryptocurrencySchema>;

export type Trade = typeof trades.$inferSelect;
export type InsertTrade = z.infer<typeof insertTradeSchema>;

export type Portfolio = typeof portfolio.$inferSelect;
export type InsertPortfolio = z.infer<typeof insertPortfolioSchema>;

export type BotSettings = typeof botSettings.$inferSelect;
export type InsertBotSettings = z.infer<typeof insertBotSettingsSchema>;

export type PriceHistory = typeof priceHistory.$inferSelect;
export type InsertPriceHistory = z.infer<typeof insertPriceHistorySchema>;
