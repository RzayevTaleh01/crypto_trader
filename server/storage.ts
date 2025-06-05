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

  async updateUserBalance(userId: number, balance: string): Promise<void> {
    const balanceNumber = parseFloat(balance);
    
    // Prevent negative balance updates
    if (balanceNumber < 0) {
      console.log(`❌ Attempted to set negative balance: $${balanceNumber.toFixed(2)} for user ${userId}`);
      return;
    }
    
    await db
      .update(users)
      .set({ balance })
      .where(eq(users.id, userId));
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

  async getUserTrades(userId: number, limit = 50): Promise<Trade[]> {
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

  // Analytics operations
  async getUserStats(userId: number): Promise<any> {
    // Get user data and current portfolio value
    const user = await this.getUser(userId);
    const currentBalance = parseFloat(user?.balance || '0');
    
    // Calculate current portfolio value using SQL query
    const portfolioValue = await db.execute(sql`
      SELECT COALESCE(SUM(CAST(p.amount AS DECIMAL) * CAST(c.current_price AS DECIMAL)), 0) as portfolio_value
      FROM portfolio p 
      JOIN cryptocurrencies c ON p.crypto_id = c.id 
      WHERE p.user_id = ${userId}
    `);
    
    const currentPortfolioValue = parseFloat(portfolioValue[0]?.portfolio_value || '0');
    const totalCurrentValue = currentBalance + currentPortfolioValue;
    
    // Calculate total profit from initial $100
    const startingAmount = 100.00;
    const totalProfit = totalCurrentValue - startingAmount;
    const profitPercentage = (totalProfit / startingAmount) * 100;
    
    // Get trade statistics
    const userTrades = await this.getUserTrades(userId);
    const userPortfolio = await this.getUserPortfolio(userId);
    const activeTrades = userPortfolio.filter(item => parseFloat(item.amount) > 0).length;
    
    // Calculate win rate from sell trades
    const sellTrades = userTrades.filter(trade => trade.type === 'SELL');
    let winningTrades = 0;
    
    for (const sellTrade of sellTrades) {
      const pnl = parseFloat(sellTrade.pnl || '0');
      if (pnl > 0) winningTrades++;
    }
    
    const winRate = sellTrades.length > 0 ? (winningTrades / sellTrades.length) * 100 : 0;
    
    // Calculate today's profit from today's sell trades
    const today = new Date();
    const todayTrades = sellTrades.filter(trade => {
      const tradeDate = new Date(trade.createdAt);
      return tradeDate.toDateString() === today.toDateString();
    });
    
    const todayProfit = todayTrades.reduce((sum, trade) => {
      return sum + parseFloat(trade.pnl || '0');
    }, 0);

    return {
      totalProfit: totalProfit.toFixed(2),
      totalProfitPercentage: profitPercentage.toFixed(2),
      currentBalance: currentBalance.toFixed(2),
      portfolioValue: currentPortfolioValue.toFixed(2),
      totalValue: totalCurrentValue.toFixed(2),
      activeTrades,
      winRate: winRate.toFixed(1),
      todayProfit: todayProfit.toFixed(2),
      uptime: "99.7"
    };
  }
}

export const storage = new DatabaseStorage();
