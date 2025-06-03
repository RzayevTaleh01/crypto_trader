import { storage } from "../storage";
import type { InsertTrade } from "@shared/schema";
import { binanceService } from "./binanceService";
import { telegramService } from "./telegramService";

class TradingEngine {
  private activeBots = new Map<number, NodeJS.Timeout>();

  async executeTrade(tradeData: InsertTrade) {
    try {
      // Get current user and crypto data
      const user = await storage.getUser(tradeData.userId);
      const crypto = await storage.getCryptocurrency(tradeData.cryptoId);
      
      if (!user || !crypto) {
        throw new Error("User or cryptocurrency not found");
      }

      const currentBalance = parseFloat(user.balance);
      const tradeAmount = parseFloat(tradeData.amount);
      const tradePrice = parseFloat(tradeData.price);
      const total = tradeAmount * tradePrice;

      // Validate trade
      if (tradeData.type === 'buy' && currentBalance < total) {
        throw new Error("Insufficient balance");
      }

      // Calculate P&L for sell orders
      let pnl = "0";
      if (tradeData.type === 'sell') {
        const portfolioItem = await storage.getPortfolioItem(tradeData.userId, tradeData.cryptoId);
        if (portfolioItem) {
          const avgPrice = parseFloat(portfolioItem.averagePrice);
          pnl = ((tradePrice - avgPrice) * tradeAmount).toString();
        }
      }

      // Create trade record
      const trade = await storage.createTrade({
        ...tradeData,
        total: total.toString(),
        pnl
      });

      // Update user balance
      const newBalance = tradeData.type === 'buy' 
        ? currentBalance - total 
        : currentBalance + total;
      
      await storage.updateUserBalance(tradeData.userId, newBalance.toString());

      // Update portfolio
      await this.updatePortfolio(tradeData.userId, tradeData.cryptoId, tradeData.type, tradeAmount, tradePrice);

      return {
        trade,
        newBalance: newBalance.toString(),
        message: `${tradeData.type.toUpperCase()} order executed successfully`
      };
    } catch (error) {
      throw new Error(`Trade execution failed: ${error.message}`);
    }
  }

  private async updatePortfolio(userId: number, cryptoId: number, type: string, amount: number, price: number) {
    const existingItem = await storage.getPortfolioItem(userId, cryptoId);

    if (type === 'buy') {
      if (existingItem) {
        // Update existing position
        const currentAmount = parseFloat(existingItem.amount);
        const currentTotal = parseFloat(existingItem.totalInvested);
        
        const newAmount = currentAmount + amount;
        const newTotal = currentTotal + (amount * price);
        const newAvgPrice = newTotal / newAmount;

        await storage.updatePortfolioItem(
          userId,
          cryptoId,
          newAmount.toString(),
          newAvgPrice.toString(),
          newTotal.toString()
        );
      } else {
        // Create new position
        await storage.createPortfolioItem({
          userId,
          cryptoId,
          amount: amount.toString(),
          averagePrice: price.toString(),
          totalInvested: (amount * price).toString()
        });
      }
    } else if (type === 'sell' && existingItem) {
      // Reduce position
      const currentAmount = parseFloat(existingItem.amount);
      const newAmount = currentAmount - amount;

      if (newAmount <= 0) {
        // Remove position entirely
        await storage.deletePortfolioItem(userId, cryptoId);
      } else {
        // Update position
        const currentTotal = parseFloat(existingItem.totalInvested);
        const reduction = (amount / currentAmount) * currentTotal;
        const newTotal = currentTotal - reduction;

        await storage.updatePortfolioItem(
          userId,
          cryptoId,
          newAmount.toString(),
          existingItem.averagePrice,
          newTotal.toString()
        );
      }
    }
  }

  async startBot(userId: number) {
    if (this.activeBots.has(userId)) {
      return; // Bot already running
    }

    const botSettings = await storage.getBotSettings(userId);
    if (!botSettings || !botSettings.isActive) {
      throw new Error("Bot settings not found or bot not active");
    }

    // Simulate automated trading
    const botInterval = setInterval(async () => {
      try {
        await this.executeBotTrade(userId, botSettings);
      } catch (error) {
        console.error(`Bot trade error for user ${userId}:`, error);
      }
    }, 15000); // Execute trades every 15 seconds

    this.activeBots.set(userId, botInterval);
    console.log(`Trading bot started for user ${userId}`);
  }

  stopBot(userId: number) {
    const botInterval = this.activeBots.get(userId);
    if (botInterval) {
      clearInterval(botInterval);
      this.activeBots.delete(userId);
      console.log(`Trading bot stopped for user ${userId}`);
    }
  }

  private async executeBotTrade(userId: number, botSettings: any) {
    try {
      // Try to use advanced Binance strategy first
      await binanceService.executeAdvancedStrategy(userId, botSettings.strategy, botSettings.riskLevel);
    } catch (error) {
      console.error('Advanced strategy failed, falling back to basic strategy:', error);
      
      // Fallback to basic strategy
      const cryptos = await storage.getAllCryptocurrencies();
      if (cryptos.length === 0) return;

      // Simple trading strategy: buy if price is down, sell if up
      const randomCrypto = cryptos[Math.floor(Math.random() * Math.min(5, cryptos.length))];
      const priceChange = parseFloat(randomCrypto.priceChange24h);
      
      // Enhanced technical analysis with higher probability strategies
      const riskMultiplier = parseInt(botSettings.riskLevel) / 10;
      const volatility = Math.abs(priceChange);
      
      // Multi-factor trading decision with higher success probability
      const momentumFactor = volatility > 3 ? 0.8 : 0.4; // High volatility = better opportunity
      const trendFactor = priceChange > 0 ? 0.7 : 0.3; // Uptrend preference
      const riskFactor = riskMultiplier;
      
      const user = await storage.getUser(userId);
      if (!user) return;

      const balance = parseFloat(user.balance);
      
      const tradingProbability = (momentumFactor + trendFactor + riskFactor) / 3;
      const shouldTrade = Math.random() < Math.min(tradingProbability, 0.85); // Max 85% trade probability
      
      console.log(`Bot trading check for ${randomCrypto.symbol}: shouldTrade=${shouldTrade}, probability=${tradingProbability.toFixed(2)}, priceChange=${priceChange}%, balance=$${balance}`);
      
      if (!shouldTrade) {
        console.log(`No trade this cycle - probability not met`);
        return;
      }
      const maxTradeAmount = balance * 0.15 * riskMultiplier; // Max 15% of balance per trade for higher profits

      if (maxTradeAmount < 1) return; // Don't trade amounts less than $1

      try {
        const portfolioItem = await storage.getPortfolioItem(userId, randomCrypto.id);
        const currentPrice = parseFloat(randomCrypto.currentPrice);
        
        if (priceChange < -0.5 && balance > maxTradeAmount) {
          // Price dropped, consider buying
          const amount = maxTradeAmount / currentPrice;
          
          console.log(`Executing BUY trade: ${randomCrypto.symbol} at $${currentPrice}, amount: ${amount}`);
          
          const result = await this.executeTrade({
            userId,
            cryptoId: randomCrypto.id,
            type: 'buy',
            amount: amount.toString(),
            price: currentPrice.toString(),
            total: maxTradeAmount.toString(),
            isBot: true
          });

          // Send Telegram notification
          await telegramService.sendTradeNotification(result.trade, randomCrypto);
          
        } else if (priceChange > 0.5 && portfolioItem) {
          // Price increased, consider selling
          const amount = Math.min(
            parseFloat(portfolioItem.amount) * 0.3, // Sell max 30% of position
            maxTradeAmount / currentPrice
          );
          
          if (amount > 0) {
            const result = await this.executeTrade({
              userId,
              cryptoId: randomCrypto.id,
              type: 'sell',
              amount: amount.toString(),
              price: currentPrice.toString(),
              total: (amount * currentPrice).toString(),
              isBot: true
            });

            // Send Telegram notification
            await telegramService.sendTradeNotification(result.trade, randomCrypto);
          }
        }
      } catch (tradeError) {
        console.error(`Bot trade execution error:`, tradeError);
      }
    }
  }
}

export const tradingEngine = new TradingEngine();
