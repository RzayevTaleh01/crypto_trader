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
  const { emaRsiStrategy } = await import('./services/emaRsiStrategy.ts');
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

      res.json({ user: { id: user.id, username: user.username, email: user.email, balance: user.balance, profitBalance: user.profitBalance } });
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
      const stats = await storage.getUserStats(userId);

      res.json(stats);
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

  // Sell all portfolio endpoint
  app.post("/api/trades/sell-all", async (req, res) => {
    try {
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({ message: "User ID is required" });
      }

      // Get all user portfolio holdings
      const portfolio = await storage.getUserPortfolio(userId);

      if (!portfolio || portfolio.length === 0) {
        return res.status(400).json({ message: "No holdings to sell" });
      }

      const sellResults = [];

      // Sell all holdings
      for (const coin of portfolio) {
        try {
          const crypto = await storage.getCryptocurrency(coin.cryptoId);
          if (!crypto) continue;

          const sellAmount = parseFloat(coin.amount);
          const sellPrice = parseFloat(crypto.currentPrice);
          const sellTotal = sellAmount * sellPrice;
          const profit = sellTotal - parseFloat(coin.totalInvested);

          // Create sell trade record
          const tradeData = {
            userId,
            cryptoId: coin.cryptoId,
            type: 'SELL' as const,
            amount: sellAmount.toString(),
            price: sellPrice.toString(),
            total: sellTotal.toString(),
            pnl: profit.toString(),
            reason: 'Sell all portfolio'
          };

          const trade = await storage.createTrade(tradeData);

          // Remove the position from portfolio
          await storage.deletePortfolioItem(userId, coin.cryptoId);

          // Update user balances using corrected mechanism
          const user = await storage.getUser(userId);
          if (user) {
            const totalInvested = parseFloat(coin.totalInvested);
            const profitLoss = sellTotal - totalInvested;

            console.log(`🔍 SELL ALL: ${crypto.symbol} - Invested: $${totalInvested.toFixed(4)}, Sold for: $${sellTotal.toFixed(4)}, P&L: $${profitLoss.toFixed(4)}`);

            // Always add back the original investment to main balance
            await storage.addToMainBalance(userId, totalInvested);

            // If there's profit, add it to profit balance
            if (profitLoss > 0) {
              await storage.addProfit(userId, profitLoss);
              console.log(`💰 ${crypto.symbol} SELL ALL: Investment: $${totalInvested.toFixed(4)} → Main Balance, Profit: $${profitLoss.toFixed(4)} → Profit Balance`);
            } else {
              console.log(`📉 ${crypto.symbol} SELL ALL: Investment: $${totalInvested.toFixed(4)} → Main Balance, Loss: $${Math.abs(profitLoss).toFixed(4)}`);
            }

            // Get updated user data and broadcast correct balance update
            const updatedUser = await storage.getUser(userId);
            broadcast({
              type: 'balanceUpdate',
              data: { 
                userId, 
                balance: parseFloat(updatedUser.balance), 
                profitBalance: parseFloat(updatedUser.profitBalance || '0')
              }
            });
          }

          sellResults.push({
            symbol: crypto.symbol,
            amount: sellAmount,
            price: sellPrice,
            total: sellTotal,
            profit: profit,
            trade: trade
          });

          console.log(`✅ Sell All: ${crypto.symbol} - ${sellAmount} at $${sellPrice} = $${profit.toFixed(2)} profit`);

        } catch (error) {
          console.error(`❌ Failed to sell ${coin.cryptoId}:`, error);
        }
      }

      // Stop trading bot
      const { emaRsiStrategy } = await import('./services/emaRsiStrategy.ts');
      emaRsiStrategy.stopContinuousTrading();

      // Send Telegram notification for sell all
      const { telegramService } = await import('./services/telegramService');
      const totalSoldValue = sellResults.reduce((sum, result) => sum + result.total, 0);
      const totalProfit = sellResults.reduce((sum, result) => sum + result.profit, 0);

      await telegramService.sendSellAllNotification({
        soldCount: sellResults.length,
        totalValue: totalSoldValue,
        totalProfit: totalProfit,
        coins: sellResults.map(r => ({
          symbol: r.symbol,
          amount: r.amount,
          price: r.price,
          profit: r.profit
        }))
      });

      // Broadcast multiple updates for instant UI refresh
      const updatedPortfolio = await portfolioService.getUserPortfolioWithDetails(userId);
      const stats = await storage.getUserStats(userId);

      // Send individual broadcasts for immediate UI updates
      broadcast({
        type: 'portfolioUpdate',
        data: updatedPortfolio
      });

      broadcast({
        type: 'statsUpdate',
        data: stats
      });

      // Send additional updates for sold coins and recent trades
      broadcast({
        type: 'soldCoinsUpdate',
        data: sellResults
      });

      broadcast({
        type: 'tradeUpdate',
        data: {
          type: 'SELL_ALL',
          message: `Sold ${sellResults.length} positions`,
          timestamp: new Date().toISOString()
        }
      });

      res.json({
        message: "All portfolio sold successfully",
        soldCount: sellResults.length,
        results: sellResults
      });

    } catch (error: any) {
      console.error("Error selling all portfolio:", error);
      res.status(500).json({ message: "Failed to sell portfolio", error: error.message });
    }
  });

  // Manual sell profitable coins endpoint
  app.post("/api/trades/sell", async (req, res) => {
    try {
      const userId = req.body.userId || 1;

      // Get current portfolio with details
      const portfolio = await portfolioService.getUserPortfolioWithDetails(userId);

      // Filter coins with profit > $0.05
      const profitableCoins = portfolio.filter((holding: any) => {
        const currentValue = parseFloat(holding.currentValue);
        const totalInvested = parseFloat(holding.totalInvested);
        const profit = currentValue - totalInvested;
        return profit > 0.02;
      });

      if (profitableCoins.length === 0) {
        return res.status(400).json({ message: "No profitable coins found" });
      }

      const sellResults = [];

      // Sell each profitable coin
      for (const coin of profitableCoins) {
        try {
          const crypto = await storage.getCryptocurrency(coin.cryptoId);
          if (!crypto) continue;

          const sellAmount = parseFloat(coin.amount);
          const sellPrice = parseFloat(crypto.currentPrice);
          const sellTotal = sellAmount * sellPrice;
          const profit = sellTotal - parseFloat(coin.totalInvested);

          // Create sell trade record
          const tradeData = {
            userId,
            cryptoId: coin.cryptoId,
            type: 'SELL' as const,
            amount: sellAmount.toString(),
            price: sellPrice.toString(),
            total: sellTotal.toString(),
            pnl: profit.toString(),
            reason: 'Manual profit sell'
          };

          const trade = await storage.createTrade(tradeData);

          // Update portfolio - remove the position
          await storage.deletePortfolioItem(userId, coin.cryptoId);

          // Update user balances using corrected mechanism
          const user = await storage.getUser(userId);
          if (user) {
            const totalInvested = parseFloat(coin.totalInvested);
            const profitLoss = sellTotal - totalInvested;

            console.log(`🔍 MANUAL SELL: ${crypto.symbol} - Invested: $${totalInvested.toFixed(4)}, Sold for: $${sellTotal.toFixed(4)}, P&L: $${profitLoss.toFixed(4)}`);

            // Always add back the original investment to main balance
            await storage.addToMainBalance(userId, totalInvested);

            // If there's profit, add it to profit balance
            if (profitLoss > 0) {
              await storage.addProfit(userId, profitLoss);
              console.log(`💰 ${crypto.symbol} MANUAL SELL: Investment: $${totalInvested.toFixed(4)} → Main Balance, Profit: $${profitLoss.toFixed(4)} → Profit Balance`);
            } else {
              console.log(`📉 ${crypto.symbol} MANUAL SELL: Investment: $${totalInvested.toFixed(4)} → Main Balance, Loss: $${Math.abs(profitLoss).toFixed(4)}`);
            }

            // Get updated user data and broadcast correct balance update
            const updatedUser = await storage.getUser(userId);
            broadcast({
              type: 'balanceUpdate',
              data: { 
                userId, 
                balance: parseFloat(updatedUser.balance), 
                profitBalance: parseFloat(updatedUser.profitBalance || '0')
              }
            });
          }

          sellResults.push({
            symbol: crypto.symbol,
            amount: sellAmount,
            price: sellPrice,
            total: sellTotal,
            profit: profit,
            trade: trade
          });

          console.log(`✅ Manual SELL: ${crypto.symbol} - ${sellAmount} at $${sellPrice} = $${profit.toFixed(2)} profit`);

        } catch (error) {
          console.error(`❌ Failed to sell ${coin.cryptoId}:`, error);
        }
      }

      // Send Telegram notification for profitable sales
      if (sellResults.length > 0) {
        const { telegramService } = await import('./services/telegramService');
        const totalProfit = sellResults.reduce((sum, result) => sum + result.profit, 0);
        await telegramService.sendProfitableSalesNotification({
          soldCount: sellResults.length,
          totalProfit: totalProfit,
          coins: sellResults.map(r => ({
            symbol: r.symbol,
            amount: r.amount,
            price: r.price,
            profit: r.profit
          }))
        });
      }

      // Broadcast portfolio update
      const updatedPortfolio = await portfolioService.getUserPortfolioWithDetails(userId);
      broadcast({
        type: 'portfolioUpdate',
        data: updatedPortfolio
      });

      // Broadcast stats update
      const stats = await storage.getUserStats(userId);
      broadcast({
        type: 'statsUpdate',
        data: stats
      });

      res.json({
        message: `Successfully sold ${sellResults.length} profitable coins`,
        trades: sellResults
      });

    } catch (error: any) {
      console.error('Manual sell error:', error);
      res.status(500).json({ message: "Failed to sell profitable coins", error: error.message });
    }
  });

  // Get user trades
  app.get('/api/trades/user/:userId', async (req, res) => {
    const userId = parseInt(req.params.userId);
    const limit = parseInt(req.query.limit as string) || 50;

    const trades = await storage.getUserTrades(userId, limit);
    res.json(trades);
  });

  // Get trades for specific coin
  app.get('/api/trades/coin/:symbol', async (req, res) => {
    try {
      const symbol = req.params.symbol.toUpperCase();
      const userId = 1; // Default user ID, replace with actual user ID from session

      const crypto = await storage.getCryptocurrencyBySymbol(symbol);
      if (!crypto) {
        return res.status(404).json({ error: 'Cryptocurrency not found' });
      }

      const allTrades = await storage.getUserTrades(userId, 1000); // Get many trades
      const coinTrades = allTrades.filter(trade => trade.cryptoId === crypto.id);

      // Sort by date descending
      coinTrades.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      res.json(coinTrades);
    } catch (error) {
      console.error('Error fetching coin trades:', error);
      res.status(500).json({ error: 'Internal server error' });
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

  // Get trades for specific coin symbol
  app.get("/api/trades/coin/:symbol", async (req, res) => {
    try {
      const symbol = req.params.symbol.toUpperCase();
      const userId = 1; // Default user ID

      // Get cryptocurrency by symbol
      const crypto = await storage.getCryptocurrencyBySymbol(symbol);
      if (!crypto) {
        return res.status(404).json({ message: "Cryptocurrency not found" });
      }

      // Get all trades for this crypto
      const allTrades = await storage.getUserTrades(userId, 1000);
      const coinTrades = allTrades.filter(trade => trade.cryptoId === crypto.id);

      // Add crypto details to each trade
      const tradesWithDetails = coinTrades.map(trade => ({
        ...trade,
        cryptocurrency: {
          symbol: crypto.symbol,
          name: crypto.name,
          currentPrice: crypto.currentPrice
        }
      }));

      res.json(tradesWithDetails);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch coin trades", error: error.message });
    }
  });

  // Get cryptocurrency by ID
  app.get('/api/cryptocurrencies/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    const crypto = await storage.getCryptocurrency(id);
    if (!crypto) {
      return res.status(404).json({ error: 'Cryptocurrency not found' });
    }
    res.json(crypto);
  });

  // Get cryptocurrency by symbol
  app.get('/api/cryptocurrencies/symbol/:symbol', async (req, res) => {
    try {
      const symbol = req.params.symbol.toUpperCase();
      const crypto = await storage.getCryptocurrencyBySymbol(symbol);
      if (!crypto) {
        return res.status(404).json({ error: 'Cryptocurrency not found' });
      }
      res.json(crypto);
    } catch (error) {
      console.error('Error fetching cryptocurrency by symbol:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Sold coins endpoint
  app.get("/api/trades/sold/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const trades = await storage.getUserTrades(userId, 500); // Get many more trades to ensure all sells are included

      // Filter only sell trades and get crypto details
      const sellTrades = trades.filter(trade => trade.type === 'SELL');
      const soldCoins = await Promise.all(sellTrades.map(async (trade) => {
        const crypto = await storage.getCryptocurrency(trade.cryptoId);

        // Calculate profit using average buy price methodology
        const buyTrades = trades.filter(t =>
            t.cryptoId === trade.cryptoId &&
            t.type === 'BUY' &&
            t.createdAt < trade.createdAt
        );

        // Calculate weighted average buy price
        let totalBuyValue = 0;
        let totalBuyQuantity = 0;

        for (const buyTrade of buyTrades) {
          const buyAmount = parseFloat(buyTrade.amount);
          const buyPrice = parseFloat(buyTrade.price);
          totalBuyValue += buyAmount * buyPrice;
          totalBuyQuantity += buyAmount;
        }

        const avgBuyPrice = totalBuyQuantity > 0 ? totalBuyValue / totalBuyQuantity : 0;
        const sellPrice = parseFloat(trade.price);
        const quantity = parseFloat(trade.amount);
        const sellValue = parseFloat(trade.total);
        const buyValue = avgBuyPrice * quantity;
        const profit = sellValue - buyValue;
        const profitPercentage = buyValue > 0 ? ((profit / buyValue) * 100) : 0;

        return {
          id: trade.id,
          symbol: crypto?.symbol || 'Unknown',
          name: crypto?.name || 'Unknown',
          soldQuantity: trade.amount,
          sellPrice: trade.price,
          buyPrice: avgBuyPrice.toString(),
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
          const { emaRsiStrategy } = await import('./services/emaRsiStrategy.ts');
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
          const { emaRsiStrategy } = await import('./services/emaRsiStrategy.ts');
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

  // Transfer profit balance to main balance
  app.post("/api/user/:id/balance/transfer-profit", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const { amount } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({ message: "Valid transfer amount required" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const currentProfitBalance = parseFloat(user.profitBalance || '0');
      if (amount > currentProfitBalance) {
        return res.status(400).json({ message: "Insufficient profit balance" });
      }

      // Transfer from profit balance to main balance
      const newProfitBalance = currentProfitBalance - amount;
      const currentMainBalance = parseFloat(user.balance || '0');
      const newMainBalance = currentMainBalance + amount;

      await storage.updateUserBalances(userId, newMainBalance.toString(), newProfitBalance.toString());

      // Broadcast balance update
      broadcast({
        type: 'balanceUpdate',
        data: { 
          userId, 
          balance: newMainBalance, 
          profitBalance: newProfitBalance
        }
      });

      res.json({ 
        message: "Transfer successful", 
        transferredAmount: amount,
        newMainBalance: newMainBalance.toString(),
        newProfitBalance: newProfitBalance.toString()
      });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to transfer profit balance", error: error.message });
    }
  });

  // Balance management route
  app.patch("/api/user/:id/balance", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const { balance, profitBalance } = req.body;

      if (balance !== undefined && (balance === null || isNaN(parseFloat(balance)))) {
        return res.status(400).json({ message: "Valid balance amount required" });
      }

      if (profitBalance !== undefined && (profitBalance === null || isNaN(parseFloat(profitBalance)))) {
        return res.status(400).json({ message: "Valid profit balance amount required" });
      }

      // Update balances using the new method
      await storage.updateUserBalances(userId, balance, profitBalance);

      // Get updated user data for broadcast
      const updatedUser = await storage.getUser(userId);

      // Broadcast balance update to WebSocket clients
      broadcast({
        type: 'balanceUpdate',
        data: { 
          userId, 
          balance: parseFloat(updatedUser?.balance || '0'), 
          profitBalance: parseFloat(updatedUser?.profitBalance || '0')
        }
      });

      res.json({ 
        message: "Balance updated successfully", 
        newBalance: updatedUser?.balance,
        newProfitBalance: updatedUser?.profitBalance
      });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to update balance", error: error.message });
    }
  });

  // Reset user data endpoint
  app.post("/api/user/:id/reset", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);

      // Reset all user data
      await storage.resetUserData(userId);

      // Set balance back to $20
      await storage.updateUserBalance(userId, "20.00");

      console.log(`🔄 User ${userId} data reset - balance set to $20.00`);

      // Broadcast multiple updates for complete UI refresh
      broadcast({
        type: 'dataReset',
        data: { userId, newBalance: 20.00 }
      });

      broadcast({
        type: 'portfolioUpdate',
        data: []
      });

      broadcast({
        type: 'statsUpdate',
        data: {
          totalProfit: '0.00',
          activeTrades: 0,
          winRate: '0',
          currentBalance: '20.00',
          totalValue: '20.00',
          portfolioValue: '0.00'        }
      });

      res.json({
        message: "User data reset successfully",
        newBalance: "20.00"
      });

    } catch (error: any) {
      console.error("Reset error:", error);
      res.status(500).json({
        message: "Failed to reset user data",
        error: error.message
      });
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
          description: 'Python əsaslı EMA20/EMA50 crossover və RSI sinyyalları ilə treyd',
          riskLevel: 'Optimal',
          expectedReturn: '15-35%',
          timeframe: '5-30 dəqiqə'
        }
      ];

      res.json({ success: true, strategies });
    } catch (error: any) {
      console.log('Strategies list error:', error);      res.status(500).json({ success: false, message: 'Failed to get strategies' });
    }
  });

  // Run Backtest
  app.post('/api/backtest/run', async (req, res) => {
    try {
      const { backtestService } = await import('./services/backtestService');

      const config = {
        startBalance: req.body.startBalance || 20,
        startDate: req.body.startDate || '2024-01-01',
        endDate: req.body.endDate || '2024-12-31',
        strategy: req.body.strategy || 'ema_rsi',
        riskLevel: req.body.riskLevel || 5
      };

      console.log('🚀 Starting backtest with config:', config);

      const results = await backtestService.runBacktest(config);

      console.log('✅ Backtest completed successfully');
      console.log(`📊 Results: ${results.totalReturnPercent.toFixed(2)}% return, ${results.winRate.toFixed(1)}% win rate`);

      res.json({ 
        success: true, 
        results: results,
        message: 'Backtest completed successfully'
      });
    } catch (error: any) {
      console.log('❌ Backtest error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Backtest failed',
        error: error.message 
      });
    }
  });

  // Update Bot Strategy
  app.put('/api/bot-settings/strategy', async (req, res) => {
    try {
      const userId = 1; // Default user
      const { strategy } = req.body;

      const validStrategies = ['ema_rsi'];
      if (!validStrategies.includes(strategy)) {
        returnres.status(400).json({ success: false, message: 'Invalid strategy' });
      }

      await storage.updateBotSettings(userId, { strategy });

      // Restart bot with new strategy if it's active
      const { emaRsiStrategy } = await import('./services/emaRsiStrategy.ts');
      const botSettings = await storage.getBotSettings(userId);
      if (botSettings && botSettings.isActive) {
        emaRsiStrategy.stopContinuousTrading();
        await emaRsiStrategy.startContinuousTrading(userId);
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

  // Get user trades with cryptocurrency details
  app.get('/api/trades/user', async (req, res) => {
    try {
      const userId = 1; // Hardcoded user ID for now
      const trades = await storage.getUserTrades(userId);

      // Add cryptocurrency details to each trade
      const tradesWithCrypto = await Promise.all(trades.map(async (trade) => {
        const crypto = await storage.getCryptocurrency(trade.cryptoId);
        return {
          ...trade,
          cryptocurrency: crypto ? {
            symbol: crypto.symbol,
            name: crypto.name
          } : {
            symbol: 'Unknown',
            name: 'Unknown'
          }
        };
      }));

      console.log(`📊 User ${userId} trades count:`, tradesWithCrypto.length);
      res.json(tradesWithCrypto);
    } catch (error) {
      console.error('Error fetching user trades:', error);
      res.status(500).json({ error: 'Failed to fetch trades' });
    }
  });

  // Get user trades
  app.get('/api/trades/user/:userId', async (req, res) => {
    const userId = parseInt(req.params.userId);
    const limit = parseInt(req.query.limit as string) || 50;

    const trades = await storage.getUserTrades(userId, limit);
    res.json(trades);
  });

  // Get trades for specific coin
  app.get('/api/trades/coin/:symbol', async (req, res) => {
    try {
      const symbol = req.params.symbol.toUpperCase();
      const userId = 1; // Default user ID, replace with actual user ID from session

      const crypto = await storage.getCryptocurrencyBySymbol(symbol);
      if (!crypto) {
        return res.status(404).json({ error: 'Cryptocurrency not found' });
      }

      const allTrades = await storage.getUserTrades(userId, 1000); // Get many trades
      const coinTrades = allTrades.filter(trade => trade.cryptoId === crypto.id);

      // Sort by date descending
      coinTrades.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      res.json(coinTrades);
    } catch (error) {
      console.error('Error fetching coin trades:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  // Get cryptocurrency by ID
  app.get('/api/cryptocurrencies/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    const crypto = await storage.getCryptocurrency(id);
    if (!crypto) {
      return res.status(404).json({ error: 'Cryptocurrency not found' });
    }
    res.json(crypto);
  });

  // Get cryptocurrency by symbol
  app.get('/api/cryptocurrencies/symbol/:symbol', async (req, res) => {
    try {
      const symbol = req.params.symbol.toUpperCase();
      const crypto = await storage.getCryptocurrencyBySymbol(symbol);
      if (!crypto) {
        return res.status(404).json({ error: 'Cryptocurrency not found' });
      }
      res.json(crypto);
    } catch (error) {
      console.error('Error fetching cryptocurrency by symbol:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Sold coins endpoint
  app.get("/api/trades/sold/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const trades = await storage.getUserTrades(userId, 500); // Get many more trades to ensure all sells are included

      // Filter only sell trades and get crypto details
      const sellTrades = trades.filter(trade => trade.type === 'SELL');
      const soldCoins = await Promise.all(sellTrades.map(async (trade) => {
        const crypto = await storage.getCryptocurrency(trade.cryptoId);

        // Calculate profit using average buy price methodology
        const buyTrades = trades.filter(t =>
            t.cryptoId === trade.cryptoId &&
            t.type === 'BUY' &&
            t.createdAt < trade.createdAt
        );

        // Calculate weighted average buy price
        let totalBuyValue = 0;
        let totalBuyQuantity = 0;

        for (const buyTrade of buyTrades) {
          const buyAmount = parseFloat(buyTrade.amount);
          const buyPrice = parseFloat(buyTrade.price);
          totalBuyValue += buyAmount * buyPrice;
          totalBuyQuantity += buyAmount;
        }

        const avgBuyPrice = totalBuyQuantity > 0 ? totalBuyValue / totalBuyQuantity : 0;
        const sellPrice = parseFloat(trade.price);
        const quantity = parseFloat(trade.amount);
        const sellValue = parseFloat(trade.total);
        const buyValue = avgBuyPrice * quantity;
        const profit = sellValue - buyValue;
        const profitPercentage = buyValue > 0 ? ((profit / buyValue) * 100) : 0;

        return {
          id: trade.id,
          symbol: crypto?.symbol || 'Unknown',
          name: crypto?.name || 'Unknown',
          soldQuantity: trade.amount,
          sellPrice: trade.price,
          buyPrice: avgBuyPrice.toString(),
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
          const { emaRsiStrategy } = await import('./services/emaRsiStrategy.ts');
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
          const { emaRsiStrategy } = await import('./services/emaRsiStrategy.ts');
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

  return httpServer;
}