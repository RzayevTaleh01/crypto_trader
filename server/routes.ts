import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { db } from "./db";
import { cryptoService } from "./services/cryptoService";
import { portfolioService } from "./services/portfolioService";
import { insertUserSchema, insertTradeSchema, insertBotSettingsSchema, trades as tradesTable, cryptocurrencies as cryptocurrenciesTable } from "@shared/schema";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  
  // Set up WebSocket server on a distinct path
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  // WebSocket connection handling
  wss.on('connection', (ws) => {
    console.log('Client connected to WebSocket');
    
    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message.toString());
        
        if (data.type === 'requestInitialData') {
          const userId = data.userId || 1;
          
          // Fetch all initial data
          const [
            user,
            cryptocurrencies,
            portfolio,
            trades,
            analytics,
            botSettings,
            portfolioPerformance
          ] = await Promise.all([
            storage.getUser(userId),
            storage.getAllCryptocurrencies(),
            storage.getUserPortfolio(userId),
            storage.getUserTrades(userId, 50),
            storage.getUserStats(userId),
            storage.getBotSettings(userId),
            portfolioService.getPortfolioPerformance(userId, 24)
          ]);
          
          // Send initial data
          ws.send(JSON.stringify({
            type: 'initialData',
            data: {
              user,
              cryptocurrencies,
              portfolio,
              trades,
              analytics,
              botSettings,
              portfolioPerformance
            }
          }));
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });
    
    ws.on('close', () => {
      console.log('Client disconnected from WebSocket');
    });
  });

  // Set up WebSocket broadcasting
  const broadcast = (data: any) => {
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(data));
      }
    });
  };

  // Initialize crypto service with broadcast function
  cryptoService.setBroadcastFunction(broadcast);
  
  // Initialize EMA-RSI strategy with broadcast function
  const { emaRsiStrategy } = await import('./services/emaRsiStrategy');
  emaRsiStrategy.setBroadcastFunction(broadcast);

  // User routes
  app.post("/api/auth/register", async (req, res) => {
    try {
      const userData = insertUserSchema.parse(req.body);
      const user = await storage.createUser(userData);

      // Create default bot settings for new user
      await storage.createBotSettings({
        userId: user.id,
        isActive: false,
        strategy: "ema_rsi",
        riskLevel: 5,
        maxDailyLoss: "50",
        targetProfit: "100",
        tradingPairs: ["BTC/USDT", "ETH/USDT"]
      });

      res.json({ user: { id: user.id, username: user.username, email: user.email, balance: user.balance } });
    } catch (error: any) {
      res.status(400).json({ message: "Invalid user data", error: error.message });
    }
  });

  app.get("/api/user/:id", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({ user: { id: user.id, username: user.username, email: user.email, balance: user.balance } });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch user", error: error.message });
    }
  });

  // Stats route
  app.get("/api/stats/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const user = await storage.getUser(userId);
      const stats = await storage.getUserStats(userId);
      const portfolio = await storage.getUserPortfolio(userId);
      
      res.json({
        totalProfit: stats.totalProfit || '0.00',
        activeTrades: portfolio.length || 0,
        winRate: stats.winRate || '0',
        uptime: '99.7',
        currentBalance: user?.balance || '10.00'
      });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch stats", error: error.message });
    }
  });

  app.get("/api/stats", async (req, res) => {
    try {
      const userId = 1; // Default user for demo
      const user = await storage.getUser(userId);
      const stats = await storage.getUserStats(userId);
      const portfolio = await storage.getUserPortfolio(userId);
      
      res.json({
        totalProfit: stats.totalProfit || '0.00',
        activeTrades: portfolio.length || 0,
        winRate: stats.winRate || '0',
        uptime: '99.7',
        currentBalance: user?.balance || '10.00'
      });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch stats", error: error.message });
    }
  });

  // Cryptocurrency routes
  app.get("/api/cryptocurrencies", async (req, res) => {
    try {
      const cryptos = await storage.getAllCryptocurrencies();
      res.json(cryptos);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch cryptocurrencies", error: error.message });
    }
  });

  app.get("/api/cryptocurrencies/:symbol", async (req, res) => {
    try {
      const symbol = req.params.symbol;
      const crypto = await storage.getCryptocurrencyBySymbol(symbol);
      
      if (!crypto) {
        return res.status(404).json({ message: "Cryptocurrency not found" });
      }

      res.json(crypto);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch cryptocurrency", error: error.message });
    }
  });

  // Trading routes - EMA-RSI strategy only
  app.post("/api/trades", async (req, res) => {
    try {
      const tradeData = insertTradeSchema.parse(req.body);
      const trade = await storage.createTrade(tradeData);
      
      broadcast({
        type: 'trade',
        data: trade
      });

      res.json({ trade });
    } catch (error: any) {
      res.status(400).json({ message: "Failed to execute trade", error: error.message });
    }
  });

  app.get("/api/trades/user/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const trades = await storage.getUserTrades(userId, limit);
      res.json(trades);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch trades", error: error.message });
    }
  });

  app.get("/api/trades/recent/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const trades = await storage.getUserTrades(userId, 10);
      
      // Get crypto details for each trade
      const activities = await Promise.all(trades.map(async (trade) => {
        const crypto = await storage.getCryptocurrency(trade.cryptoId);
        return {
          timestamp: trade.createdAt.toISOString(),
          action: trade.type,
          symbol: crypto?.symbol || 'Unknown',
          amount: trade.amount,
          price: trade.price,
          total: trade.total,
          type: trade.type,
          strategy: 'EMA-RSI'
        };
      }));
      
      res.json(activities);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch recent trades", error: error.message });
    }
  });

  // Sold coins endpoint
  app.get("/api/trades/sold/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const trades = await storage.getUserTrades(userId, 100); // Get more trades to find sells
      
      // Filter only sell trades and get crypto details
      const sellTrades = trades.filter(trade => trade.type === 'SELL');
      const soldCoins = await Promise.all(sellTrades.map(async (trade) => {
        const crypto = await storage.getCryptocurrency(trade.cryptoId);
        
        // Find the corresponding buy trade to calculate profit
        const buyTrades = trades.filter(t => 
          t.cryptoId === trade.cryptoId && 
          t.type === 'BUY' && 
          t.createdAt < trade.createdAt
        ).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        
        const lastBuyTrade = buyTrades[0];
        const buyPrice = lastBuyTrade ? parseFloat(lastBuyTrade.price) : 0;
        const sellPrice = parseFloat(trade.price);
        const quantity = parseFloat(trade.amount);
        const sellValue = parseFloat(trade.total);
        const buyValue = buyPrice * quantity;
        const profit = sellValue - buyValue;
        const profitPercentage = buyValue > 0 ? ((profit / buyValue) * 100) : 0;
        
        return {
          id: trade.id,
          symbol: crypto?.symbol || 'Unknown',
          name: crypto?.name || 'Unknown',
          soldQuantity: trade.amount,
          sellPrice: trade.price,
          buyPrice: buyPrice.toString(),
          sellValue: trade.total,
          profit: profit.toString(),
          profitPercentage: profitPercentage.toString(),
          soldAt: trade.createdAt.toISOString()
        };
      }));
      
      res.json(soldCoins);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch sold coins", error: error.message });
    }
  });

  app.get("/api/trades/recent", async (req, res) => {
    try {
      const userId = 1; // Default user for demo
      const trades = await storage.getUserTrades(userId, 10);
      
      // Get crypto details for each trade
      const activities = await Promise.all(trades.map(async (trade) => {
        const crypto = await storage.getCryptocurrency(trade.cryptoId);
        return {
          timestamp: trade.createdAt.toISOString(),
          action: trade.type,
          symbol: crypto?.symbol || 'Unknown',
          amount: trade.amount,
          price: trade.price,
          total: trade.total,
          type: trade.type,
          strategy: 'EMA-RSI'
        };
      }));
      
      res.json(activities);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch recent trades", error: error.message });
    }
  });

  // Portfolio routes
  app.get("/api/portfolio/user", async (req, res) => {
    try {
      const userId = 1; // Default user for demo
      const portfolio = await portfolioService.getUserPortfolioWithDetails(userId);
      res.json(portfolio);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch portfolio", error: error.message });
    }
  });

  app.get("/api/portfolio/user/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const portfolio = await portfolioService.getUserPortfolioWithDetails(userId);
      res.json(portfolio);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch portfolio", error: error.message });
    }
  });

  app.get("/api/portfolio/performance", async (req, res) => {
    try {
      const userId = 1; // Default user for demo
      const hours = req.query.hours ? parseInt(req.query.hours as string) : 24;
      const performance = await portfolioService.getPortfolioPerformance(userId, hours);
      res.json(performance);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch portfolio performance", error: error.message });
    }
  });

  app.get("/api/portfolio/performance/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const hours = req.query.hours ? parseInt(req.query.hours as string) : 24;
      const performance = await portfolioService.getPortfolioPerformance(userId, hours);
      res.json(performance);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch portfolio performance", error: error.message });
    }
  });

  // Bot settings routes
  app.get("/api/bot-settings", async (req, res) => {
    try {
      const userId = 1; // Default user for demo
      let settings = await storage.getBotSettings(userId);
      
      if (!settings) {
        settings = await storage.createBotSettings({
          userId,
          isActive: false,
          strategy: "ema_rsi",
          riskLevel: 5,
          maxDailyLoss: "50",
          targetProfit: "100",
          tradingPairs: ["BTC/USDT", "ETH/USDT"]
        });
      }

      res.json(settings);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch bot settings", error: error.message });
    }
  });

  app.get("/api/bot-settings/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      let settings = await storage.getBotSettings(userId);
      
      if (!settings) {
        settings = await storage.createBotSettings({
          userId,
          isActive: false,
          strategy: "ema_rsi",
          riskLevel: 5,
          maxDailyLoss: "50",
          targetProfit: "100",
          tradingPairs: ["BTC/USDT", "ETH/USDT"]
        });
      }

      res.json(settings);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch bot settings", error: error.message });
    }
  });

  app.put("/api/bot-settings/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const settingsData = insertBotSettingsSchema.partial().parse(req.body);
      
      await storage.updateBotSettings(userId, settingsData);
      res.json({ message: "Bot settings updated successfully" });
    } catch (error: any) {
      res.status(400).json({ message: "Failed to update bot settings", error: error.message });
    }
  });

  app.patch("/api/bot-settings/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const settingsData = insertBotSettingsSchema.partial().parse(req.body);
      
      await storage.updateBotSettings(userId, settingsData);
      
      if (settingsData.isActive !== undefined) {
        if (settingsData.isActive) {
          const { emaRsiStrategy } = await import('./services/emaRsiStrategy');
          const { binanceService } = await import('./services/binanceService');
          const { cryptoService } = await import('./services/cryptoService');
          
          console.log('🤖 EMA-RSI bot activated for user:', userId);
          
          // Initialize Binance API connection immediately
          binanceService.initialize();
          
          // Start cryptocurrency price monitoring
          cryptoService.startPriceUpdates();
          
          // Start continuous trading strategy
          emaRsiStrategy.startContinuousTrading(userId);
          
          console.log('📊 Binance API calls initiated, trading strategy started');
        } else {
          const { emaRsiStrategy } = await import('./services/emaRsiStrategy');
          const { cryptoService } = await import('./services/cryptoService');
          
          console.log('🛑 EMA-RSI bot deactivated for user:', userId);
          
          // Stop all trading activities
          emaRsiStrategy.stopContinuousTrading();
          cryptoService.stopPriceUpdates();
        }
      }

      broadcast({
        type: 'botStatus',
        data: { userId, isActive: settingsData.isActive }
      });

      res.json({ message: "Bot settings updated successfully" });
    } catch (error: any) {
      res.status(400).json({ message: "Failed to update bot settings", error: error.message });
    }
  });

  // Balance management route
  app.patch("/api/user/:id/balance", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const { balance } = req.body;
      
      if (!balance || isNaN(parseFloat(balance))) {
        return res.status(400).json({ message: "Valid balance amount required" });
      }
      
      await storage.updateUserBalance(userId, balance);
      
      // Broadcast balance update to WebSocket clients
      broadcast({
        type: 'balanceUpdate',
        data: { userId, balance: parseFloat(balance) }
      });
      
      res.json({ message: "Balance updated successfully", newBalance: balance });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to update balance", error: error.message });
    }
  });

  // Analytics route
  app.get("/api/analytics/user", async (req, res) => {
    try {
      const userId = 1; // Default user for demo
      const stats = await storage.getUserStats(userId);
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch analytics", error: error.message });
    }
  });

  app.get("/api/analytics/user/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const stats = await storage.getUserStats(userId);
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch analytics", error: error.message });
    }
  });

  // Get Available Trading Strategies
  app.get('/api/strategies/available', async (req, res) => {
    try {
      const strategies = [
        {
          id: 'ema_rsi',
          name: 'EMA-RSI Strategy',
          description: 'Python əsaslı EMA20/EMA50 crossover və RSI sinyalları ilə treyd',
          riskLevel: 'Optimal',
          expectedReturn: '15-35%',
          timeframe: '5-30 dəqiqə'
        }
      ];
      
      res.json({ success: true, strategies });
    } catch (error: any) {
      console.log('Strategies list error:', error);
      res.status(500).json({ success: false, message: 'Failed to get strategies' });
    }
  });

  // Update Bot Strategy
  app.put('/api/bot-settings/strategy', async (req, res) => {
    try {
      const userId = 1; // Default user
      const { strategy } = req.body;
      
      const validStrategies = ['ema_rsi'];
      if (!validStrategies.includes(strategy)) {
        return res.status(400).json({ success: false, message: 'Invalid strategy' });
      }
      
      await storage.updateBotSettings(userId, { strategy });
      
      // Restart bot with new strategy if it's active
      const { autonomousTradingEngine } = await import('./services/autonomousTradingEngine');
      const botSettings = await storage.getBotSettings(userId);
      if (botSettings && botSettings.isActive) {
        autonomousTradingEngine.stopBot(userId);
        autonomousTradingEngine.startBot(userId);
      }
      
      res.json({ success: true, message: 'Strategy updated successfully' });
    } catch (error: any) {
      console.log('Strategy update error:', error);
      res.status(500).json({ success: false, message: 'Failed to update strategy' });
    }
  });

  async function updatePortfolioAfterBuy(userId: number, cryptoId: number, quantity: number, price: number) {
    const existing = await storage.getPortfolioItem(userId, cryptoId);
    
    if (existing) {
      const newAmount = parseFloat(existing.amount) + quantity;
      const newTotal = parseFloat(existing.totalInvested) + (quantity * price);
      const newAvgPrice = newTotal / newAmount;
      
      await storage.updatePortfolioItem(userId, cryptoId, newAmount.toString(), newAvgPrice.toString(), newTotal.toString());
    } else {
      await storage.createPortfolioItem({
        userId,
        cryptoId,
        amount: quantity.toString(),
        averagePrice: price.toString(),
        totalInvested: (quantity * price).toString()
      });
    }
  }

  async function updatePortfolioAfterSell(userId: number, cryptoId: number, soldAmount: number) {
    const existing = await storage.getPortfolioItem(userId, cryptoId);
    
    if (existing) {
      const currentAmount = parseFloat(existing.amount);
      const newAmount = Math.max(0, currentAmount - soldAmount);
      
      if (newAmount < 0.001) {
        await storage.deletePortfolioItem(userId, cryptoId);
      } else {
        const sellRatio = soldAmount / currentAmount;
        const currentTotal = parseFloat(existing.totalInvested);
        const newTotal = currentTotal * (1 - sellRatio);
        
        await storage.updatePortfolioItem(userId, cryptoId, newAmount.toString(), existing.averagePrice, newTotal.toString());
      }
    }
  }

  return httpServer;
}