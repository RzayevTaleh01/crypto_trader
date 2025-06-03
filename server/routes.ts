import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { cryptoService } from "./services/cryptoService";
import { tradingEngine } from "./services/tradingEngine";
import { portfolioService } from "./services/portfolioService";
import { insertUserSchema, insertTradeSchema, insertBotSettingsSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // WebSocket setup for real-time updates
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  wss.on('connection', (ws) => {
    console.log('Client connected to WebSocket');
    
    ws.on('close', () => {
      console.log('Client disconnected from WebSocket');
    });
  });

  // Broadcast function for real-time updates
  const broadcast = (data: any) => {
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(data));
      }
    });
  };

  // Initialize crypto service with broadcast function
  cryptoService.setBroadcastFunction(broadcast);

  // User routes
  app.post("/api/auth/register", async (req, res) => {
    try {
      const userData = insertUserSchema.parse(req.body);
      const existingUser = await storage.getUserByEmail(userData.email);
      
      if (existingUser) {
        return res.status(400).json({ message: "User already exists" });
      }

      const user = await storage.createUser(userData);
      
      // Create default bot settings
      await storage.createBotSettings({
        userId: user.id,
        isActive: false,
        strategy: "scalping",
        riskLevel: 5,
        maxDailyLoss: "50",
        targetProfit: "100",
        tradingPairs: ["BTC/USDT", "ETH/USDT"]
      });

      res.json({ user: { id: user.id, username: user.username, email: user.email, balance: user.balance } });
    } catch (error) {
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
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch user", error: error.message });
    }
  });

  // Cryptocurrency routes
  app.get("/api/cryptocurrencies", async (req, res) => {
    try {
      const cryptos = await storage.getAllCryptocurrencies();
      res.json(cryptos);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch cryptocurrencies", error: error.message });
    }
  });

  app.get("/api/cryptocurrencies/:symbol", async (req, res) => {
    try {
      const crypto = await storage.getCryptocurrencyBySymbol(req.params.symbol);
      
      if (!crypto) {
        return res.status(404).json({ message: "Cryptocurrency not found" });
      }

      res.json(crypto);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch cryptocurrency", error: error.message });
    }
  });

  // Trading routes
  app.post("/api/trades", async (req, res) => {
    try {
      const tradeData = insertTradeSchema.parse(req.body);
      const result = await tradingEngine.executeTrade(tradeData);
      
      broadcast({
        type: 'trade',
        data: result.trade
      });

      res.json(result);
    } catch (error) {
      res.status(400).json({ message: "Failed to execute trade", error: error.message });
    }
  });

  app.get("/api/trades/user/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const trades = await storage.getUserTrades(userId, limit);
      
      // Get crypto details for each trade
      const tradesWithDetails = await Promise.all(trades.map(async (trade) => {
        const crypto = await storage.getCryptocurrency(trade.cryptoId);
        return { ...trade, cryptocurrency: crypto };
      }));

      res.json(tradesWithDetails);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch trades", error: error.message });
    }
  });

  // Portfolio routes
  app.get("/api/portfolio/user/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const portfolioData = await portfolioService.getUserPortfolioWithDetails(userId);
      res.json(portfolioData);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch portfolio", error: error.message });
    }
  });

  app.get("/api/portfolio/performance/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const hours = req.query.hours ? parseInt(req.query.hours as string) : 24;
      const performance = await portfolioService.getPortfolioPerformance(userId, hours);
      res.json(performance);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch portfolio performance", error: error.message });
    }
  });

  // Bot settings routes
  app.get("/api/bot-settings/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      let settings = await storage.getBotSettings(userId);
      
      if (!settings) {
        settings = await storage.createBotSettings({
          userId,
          isActive: false,
          strategy: "scalping",
          riskLevel: 5,
          maxDailyLoss: "50",
          targetProfit: "100",
          tradingPairs: ["BTC/USDT", "ETH/USDT"]
        });
      }

      res.json(settings);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch bot settings", error: error.message });
    }
  });

  app.put("/api/bot-settings/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const settingsData = insertBotSettingsSchema.partial().parse(req.body);
      
      await storage.updateBotSettings(userId, settingsData);
      
      if (settingsData.isActive !== undefined) {
        if (settingsData.isActive) {
          tradingEngine.startBot(userId);
        } else {
          tradingEngine.stopBot(userId);
        }
      }

      broadcast({
        type: 'botStatus',
        data: { userId, isActive: settingsData.isActive }
      });

      res.json({ message: "Bot settings updated successfully" });
    } catch (error) {
      res.status(400).json({ message: "Failed to update bot settings", error: error.message });
    }
  });

  // Analytics routes
  app.get("/api/analytics/user", async (req, res) => {
    try {
      const userId = 1; // Default user for demo
      const stats = await storage.getUserStats(userId);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch analytics", error: error.message });
    }
  });

  app.get("/api/analytics/user/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const stats = await storage.getUserStats(userId);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch analytics", error: error.message });
    }
  });

  app.get("/api/price-history/:cryptoId", async (req, res) => {
    try {
      const cryptoId = parseInt(req.params.cryptoId);
      const hours = req.query.hours ? parseInt(req.query.hours as string) : 24;
      const history = await storage.getPriceHistory(cryptoId, hours);
      res.json(history);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch price history", error: error.message });
    }
  });

  // Start crypto price updates
  cryptoService.startPriceUpdates();

  return httpServer;
}
