import {
  users,
  cryptocurrencies,
  trades,
  portfolio,
  botSettings,
  priceHistory,
  type User,
  type InsertUser,
  type Cryptocurrency,
  type InsertCryptocurrency,
  type Trade,
  type InsertTrade,
  type Portfolio,
  type InsertPortfolio,
  type BotSettings,
  type InsertBotSettings,
  type PriceHistory,
  type InsertPriceHistory
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, gte, sql } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserBalance(userId: number, balance: string): Promise<void>;
  updateUserProfitBalance(userId: number, newProfitBalance: string): Promise<void>;
  updateUserBalances(userId: number, balance?: string, profitBalance?: string): Promise<void>;

  // Cryptocurrency operations
  getCryptocurrency(id: number): Promise<Cryptocurrency | undefined>;
  getCryptocurrencyBySymbol(symbol: string): Promise<Cryptocurrency | undefined>;
  getAllCryptocurrencies(): Promise<Cryptocurrency[]>;
  createCryptocurrency(crypto: InsertCryptocurrency): Promise<Cryptocurrency>;
  updateCryptocurrencyPrice(id: number, price: string, priceChange24h: string): Promise<void>;

  // Trade operations
  createTrade(trade: InsertTrade): Promise<Trade>;
  getUserTrades(userId: number, limit?: number): Promise<Trade[]>;
  getTradeById(id: number): Promise<Trade | undefined>;

  // Portfolio operations
  getUserPortfolio(userId: number): Promise<Portfolio[]>;
  getPortfolioItem(userId: number, cryptoId: number): Promise<Portfolio | undefined>;
  createPortfolioItem(item: InsertPortfolio): Promise<Portfolio>;
  updatePortfolioItem(userId: number, cryptoId: number, amount: string, averagePrice: string, totalInvested: string): Promise<void>;
  deletePortfolioItem(userId: number, cryptoId: number): Promise<void>;

  // Bot settings operations
  getBotSettings(userId: number): Promise<BotSettings | undefined>;
  createBotSettings(settings: InsertBotSettings): Promise<BotSettings>;
  updateBotSettings(userId: number, settings: Partial<InsertBotSettings>): Promise<void>;

  // Price history operations
  createPriceHistory(history: InsertPriceHistory): Promise<PriceHistory>;
  getPriceHistory(cryptoId: number, hours: number): Promise<PriceHistory[]>;

  // Analytics operations
  getUserStats(userId: number): Promise<any>;

  // Reset user data
  resetUserData(userId: number): Promise<void>;
  executeTrade(userId: number, trade: InsertTrade): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
        .insert(users)
        .values(insertUser)
        .returning();
    return user;
  }

  async updateUserBalance(userId: number, newBalance: string): Promise<void> {
    await db.update(users)
      .set({ balance: newBalance })
      .where(eq(users.id, userId));
  }

  async addToMainBalance(userId: number, amount: number): Promise<void> {
    const user = await this.getUser(userId);
    if (user) {
      const currentBalance = parseFloat(user.balance || '0');
      const newBalance = (currentBalance + amount).toFixed(8);
      await this.updateUserBalance(userId, newBalance);
      console.log(`💰 Added $${amount.toFixed(4)} to main balance. New balance: $${newBalance}`);
    }
  }

  async addProfitToBalance(userId: number, profitAmount: number): Promise<void> {
    const user = await this.getUser(userId);
    if (user && profitAmount > 0) {
      const currentProfitBalance = parseFloat(user.profitBalance || '0');
      const newProfitBalance = (currentProfitBalance + profitAmount).toFixed(2);

      await db.update(users)
        .set({ profitBalance: newProfitBalance, updatedAt: new Date() })
        .where(eq(users.id, userId));

      console.log(`💚 Kar balansına $${profitAmount.toFixed(2)} əlavə edildi. Yeni kar balansı: $${newProfitBalance}`);
    }
  }

  async addProfit(userId: number, profitAmount: number): Promise<void> {
    const user = await this.getUser(userId);
    if (user) {
      const currentProfitBalance = parseFloat(user.profitBalance || '0');
      const newProfitBalance = (currentProfitBalance + profitAmount).toFixed(8);

      await db.update(users)
        .set({ profitBalance: newProfitBalance })
        .where(eq(users.id, userId));

      console.log(`💚 Added $${profitAmount.toFixed(4)} to profit balance. New profit balance: $${newProfitBalance}`);
    }
  }

  async updateUserProfitBalance(userId: number, newProfitBalance: string): Promise<void> {
    await db
        .update(users)
        .set({ profitBalance: newProfitBalance, updatedAt: new Date() })
        .where(eq(users.id, userId));
  }

  async updateUserBalances(userId: number, balance?: string, profitBalance?: string): Promise<void> {
    const updateData: any = { updatedAt: new Date() };
    if (balance !== undefined) updateData.balance = balance;
    if (profitBalance !== undefined) updateData.profitBalance = profitBalance;

    await db
        .update(users)
        .set(updateData)
        .where(eq(users.id, userId));
  }

  async subtractFromMainBalance(userId: number, amount: number): Promise<void> {
    const user = await this.getUser(userId);
    if (user) {
      const newBalance = Math.max(0, parseFloat(user.balance || '0') - amount);
      await db.update(users).set({ 
        balance: newBalance.toString(),
        updatedAt: new Date()
      }).where(eq(users.id, userId));
    }
  }

  async resetUserData(userId: number): Promise<void> {
    // Delete all trades
    await db
        .delete(trades)
        .where(eq(trades.userId, userId));

    // Delete all portfolio positions  
    await db
        .delete(portfolio)
        .where(eq(portfolio.userId, userId));

    // Reset both balances to 0
    await db
        .update(users)
        .set({ 
          balance: "0.00",
          profitBalance: "0.00",
          updatedAt: new Date()
        })
        .where(eq(users.id, userId));

    console.log(`🔄 Reset user ${userId} data - all balances set to $0, all trades and portfolio cleared`);
  }

  // Cryptocurrency operations
  async getCryptocurrency(id: number): Promise<Cryptocurrency | undefined> {
    const [crypto] = await db.select().from(cryptocurrencies).where(eq(cryptocurrencies.id, id));
    return crypto || undefined;
  }

  async getCryptocurrencyBySymbol(symbol: string): Promise<Cryptocurrency | undefined> {
    const [crypto] = await db.select().from(cryptocurrencies).where(eq(cryptocurrencies.symbol, symbol));
    return crypto || undefined;
  }

  async getAllCryptocurrencies(): Promise<Cryptocurrency[]> {
    return await db.select().from(cryptocurrencies).orderBy(desc(cryptocurrencies.marketCap));
  }

  async createCryptocurrency(crypto: InsertCryptocurrency): Promise<Cryptocurrency> {
    const [created] = await db
        .insert(cryptocurrencies)
        .values(crypto)
        .returning();
    return created;
  }

  async updateCryptocurrencyPrice(id: number, price: string, priceChange24h: string): Promise<void> {
    await db
        .update(cryptocurrencies)
        .set({
          currentPrice: price,
          priceChange24h,
          lastUpdated: new Date()
        })
        .where(eq(cryptocurrencies.id, id));
  }

  // Trade operations
  async createTrade(trade: InsertTrade): Promise<Trade> {
    const [created] = await db
        .insert(trades)
        .values(trade)
        .returning();
    return created;
  }

  async getUserTrades(userId: number, limit = 500): Promise<Trade[]> {
    return await db
        .select()
        .from(trades)
        .where(eq(trades.userId, userId))
        .orderBy(desc(trades.createdAt))
        .limit(limit);
  }

  async getTradeById(id: number): Promise<Trade | undefined> {
    const [trade] = await db.select().from(trades).where(eq(trades.id, id));
    return trade || undefined;
  }

  // Portfolio operations
  async getUserPortfolio(userId: number): Promise<Portfolio[]> {
    return await db
        .select({
          id: portfolio.id,
          userId: portfolio.userId,
          cryptoId: portfolio.cryptoId,
          amount: portfolio.amount,
          averagePrice: portfolio.averagePrice,
          totalInvested: portfolio.totalInvested,
          cryptocurrency: {
            id: cryptocurrencies.id,
            symbol: cryptocurrencies.symbol,
            name: cryptocurrencies.name,
            currentPrice: cryptocurrencies.currentPrice,
            priceChange24h: cryptocurrencies.priceChange24h
          }
        })
        .from(portfolio)
        .leftJoin(cryptocurrencies, eq(portfolio.cryptoId, cryptocurrencies.id))
        .where(eq(portfolio.userId, userId));
  }

  async getPortfolioItem(userId: number, cryptoId: number): Promise<Portfolio | undefined> {
    const [item] = await db
        .select()
        .from(portfolio)
        .where(and(eq(portfolio.userId, userId), eq(portfolio.cryptoId, cryptoId)));
    return item || undefined;
  }

  async createPortfolioItem(item: InsertPortfolio): Promise<Portfolio> {
    const [created] = await db
        .insert(portfolio)
        .values(item)
        .returning();
    return created;
  }

  async updatePortfolioItem(userId: number, cryptoId: number, amount: string, averagePrice: string, totalInvested: string): Promise<void> {
    await db
        .update(portfolio)
        .set({
          amount,
          averagePrice,
          totalInvested,
          updatedAt: new Date()
        })
        .where(and(eq(portfolio.userId, userId), eq(portfolio.cryptoId, cryptoId)));
  }

  async deletePortfolioItem(userId: number, cryptoId: number): Promise<void> {
    await db
        .delete(portfolio)
        .where(and(eq(portfolio.userId, userId), eq(portfolio.cryptoId, cryptoId)));
  }

  // Bot settings operations
  async getBotSettings(userId: number): Promise<BotSettings | undefined> {
    const [settings] = await db
        .select()
        .from(botSettings)
        .where(eq(botSettings.userId, userId));
    return settings || undefined;
  }

  async createBotSettings(settings: InsertBotSettings): Promise<BotSettings> {
    const [created] = await db
        .insert(botSettings)
        .values(settings)
        .returning();
    return created;
  }

  async updateBotSettings(userId: number, settings: Partial<InsertBotSettings>): Promise<void> {
    await db
        .update(botSettings)
        .set({
          ...settings,
          updatedAt: new Date()
        })
        .where(eq(botSettings.userId, userId));
  }

  // Price history operations
  async createPriceHistory(history: InsertPriceHistory): Promise<PriceHistory> {
    const [created] = await db
        .insert(priceHistory)
        .values(history)
        .returning();
    return created;
  }

  async getPriceHistory(cryptoId: number, hours: number): Promise<PriceHistory[]> {
    const hoursAgo = new Date(Date.now() - hours * 60 * 60 * 1000);
    return await db
        .select()
        .from(priceHistory)
        .where(and(
            eq(priceHistory.cryptoId, cryptoId),
            gte(priceHistory.timestamp, hoursAgo)
        ))
        .orderBy(priceHistory.timestamp);
  }

  async getUserStats(userId: number) {
    const user = await this.getUser(userId);
    if (!user) {
      return {
        totalProfit: "0.00",
        realizedProfit: "0.00", 
        unrealizedProfit: "0.00",
        totalProfitPercentage: "0.00",
        currentBalance: "0.00",
        portfolioValue: "0.00",
        totalValue: "0.00",
        activeTrades: 0,
        winRate: "0",
        totalTrades: 0,
        winningTrades: 0,
        todayProfit: "0.00",
        todayProfitPercentage: "0.00",
        uptime: "99.7"
      };
    }

    const currentBalance = parseFloat(user.balance || '0');
    const currentProfitBalance = parseFloat(user.profitBalance || '0'); 

    const allTrades = await this.getUserTrades(userId, 1000);
    const portfolioPositions = await this.getUserPortfolio(userId);

    // Calculate current portfolio value
    let currentPortfolioValue = 0;
    for (const position of portfolioPositions) {
      const crypto = await this.getCryptocurrency(position.cryptoId);
      if (crypto) {
        const currentPrice = parseFloat(crypto.currentPrice);
        const amount = parseFloat(position.amount);
        currentPortfolioValue += (amount * currentPrice);
      }
    }

    // Total current value = ONLY main balance + portfolio value (excluding profit balance from trading calculations)
    const totalCurrentValue = currentBalance + currentPortfolioValue;

    // Calculate starting balance from buy trades
    const buyTrades = allTrades.filter(t => t.type === 'BUY');
    const totalInvested = buyTrades.reduce((sum, trade) => sum + parseFloat(trade.total), 0);

    // Calculate realized profit from sell trades only
    const sellTrades = allTrades.filter(t => t.type === 'SELL');
    const realizedProfit = sellTrades.reduce((sum, trade) => sum + parseFloat(trade.pnl || '0'), 0);

    // Calculate unrealized profit from current portfolio
    let unrealizedProfit = 0;
    for (const position of portfolioPositions) {
      const crypto = await this.getCryptocurrency(position.cryptoId);
      if (crypto) {
        const currentValue = parseFloat(position.amount) * parseFloat(crypto.currentPrice);
        const invested = parseFloat(position.totalInvested);
        unrealizedProfit += (currentValue - invested);
      }
    }

    // Count winning trades
    let winningTrades = 0;
    for (const sell of sellTrades) {
      if (parseFloat(sell.pnl || '0') > 0) {
        winningTrades++;
      }
    }

    // Calculate starting balance dynamically
    // Starting balance = total invested from all buy trades (represents user's initial investment)
    const startingBalance = totalInvested > 0 ? totalInvested : currentBalance;

    // Total profit = profit balance (realized profits only, not used for trading)
    const totalProfit = currentProfitBalance;

    // Profit percentage based on actual starting investment
    const profitPercentage = startingBalance > 0 ? (totalProfit / startingBalance) * 100 : 0;

    const activeTrades = portfolioPositions.filter(item => parseFloat(item.amount) > 0).length;
    const winRate = sellTrades.length > 0 ? (winningTrades / sellTrades.length) * 100 : 0;

    // Calculate today's profit
    const today = new Date();
    const todayTrades = sellTrades.filter(trade => {
      const tradeDate = new Date(trade.createdAt);
      return tradeDate.toDateString() === today.toDateString();
    });

    const todayProfit = todayTrades.reduce((sum, trade) => {
      return sum + parseFloat(trade.pnl || '0');
    }, 0);

    const todayProfitPercentage = startingBalance > 0 ? (todayProfit / startingBalance) * 100 : 0;

    console.log(`💰 Updated Balance Logic: Main Trading: $${currentBalance.toFixed(2)}, Portfolio: $${currentPortfolioValue.toFixed(2)}, Profit Storage: $${currentProfitBalance.toFixed(2)}`);
    console.log(`📊 Profit Balance (Storage Only): $${currentProfitBalance.toFixed(2)}, Trading Value: $${totalCurrentValue.toFixed(2)}, ROI: ${profitPercentage.toFixed(2)}%`);

    return {
      totalProfit: totalProfit.toFixed(2),
      realizedProfit: realizedProfit.toFixed(2),
      unrealizedProfit: unrealizedProfit.toFixed(2),
      totalProfitPercentage: profitPercentage.toFixed(2),
      currentBalance: currentBalance.toFixed(2),
      currentProfitBalance: currentProfitBalance.toFixed(2),
      portfolioValue: currentPortfolioValue.toFixed(2),
      totalValue: totalCurrentValue.toFixed(2),
      activeTrades: activeTrades,
      winRate: winRate.toFixed(1),
      totalTrades: sellTrades.length,
      winningTrades: winningTrades,
      todayProfit: todayProfit.toFixed(2),
      todayProfitPercentage: todayProfitPercentage.toFixed(2),
      uptime: "99.7",
      expectedStartingBalance: startingBalance.toFixed(2),
      actualCurrentValue: totalCurrentValue.toFixed(2),
      profitFromExpectedStart: (totalCurrentValue - startingBalance).toFixed(2),
      profitPercentageFromStart: startingBalance > 0 ? (((totalCurrentValue - startingBalance) / startingBalance) * 100).toFixed(2) : "0.00"
    };
  }

  async executeTrade(userId: number, trade: InsertTrade) {
    await db.transaction(async (tx) => {
      // Create the trade
      const [newTrade] = await tx.insert(trades).values(trade).returning();

      const user = await this.getUser(userId);
      if (!user) return;

      const currentMainBalance = parseFloat(user.balance || '0');

      if (trade.type === 'BUY') {
        const tradeTotal = parseFloat(trade.total);

        if (currentMainBalance < tradeTotal) {
          throw new Error('Insufficient balance');
        }
        await this.subtractFromMainBalance(userId, tradeTotal);

      } else if (trade.type === 'SELL') {
        const tradeTotal = parseFloat(trade.total);
        await this.addProfit(userId, tradeTotal);
      }
    });
  }
}

export const storage = new DatabaseStorage();