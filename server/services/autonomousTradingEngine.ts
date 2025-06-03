import { storage } from '../storage';
import { InsertTrade } from '@shared/schema';
import { telegramService } from './telegramService';

export class AutonomousTradingEngine {
  private activeBots = new Map<number, NodeJS.Timeout>();
  private broadcastFn: ((data: any) => void) | null = null;

  setBroadcastFunction(fn: (data: any) => void) {
    this.broadcastFn = fn;
  }

  async startBot(userId: number) {
    if (this.activeBots.has(userId)) {
      this.stopBot(userId);
    }

    console.log(`🤖 Starting autonomous trading bot for user ${userId}`);
    
    // Execute immediately first
    try {
      const botSettings = await storage.getBotSettings(userId);
      if (botSettings && botSettings.isActive) {
        console.log(`📊 Initial strategy execution: ${botSettings.strategy}`);
        await this.executeStrategy(userId, botSettings);
      }
    } catch (error) {
      console.log('Initial trading execution error:', error);
    }
    
    const botInterval = setInterval(async () => {
      try {
        const botSettings = await storage.getBotSettings(userId);
        if (!botSettings || !botSettings.isActive) {
          this.stopBot(userId);
          return;
        }
        
        console.log(`🔄 Strategy cycle: ${botSettings.strategy}`);
        await this.executeStrategy(userId, botSettings);
      } catch (error) {
        console.log('Autonomous trading error:', error);
      }
    }, 5000); // Execute every 5 seconds for faster trading

    this.activeBots.set(userId, botInterval);
  }

  stopBot(userId: number) {
    if (this.activeBots.has(userId)) {
      clearInterval(this.activeBots.get(userId)!);
      this.activeBots.delete(userId);
      console.log(`🛑 Autonomous trading bot stopped for user ${userId}`);
    }
  }

  private async executeStrategy(userId: number, botSettings: any) {
    const user = await storage.getUser(userId);
    if (!user) return;

    const balance = parseFloat(user.balance);
    const cryptos = await storage.getAllCryptocurrencies();
    const portfolio = await storage.getUserPortfolio(userId);

    console.log(`🎯 Executing ${botSettings.strategy} strategy - Balance: $${balance.toFixed(2)}`);

    console.log(`🎯 Executing ${botSettings.strategy} strategy - Balance: $${balance.toFixed(2)}`);

    // Execute specific strategy based on selection
    if (botSettings.strategy === 'ultra_profit') {
      console.log(`🚀 ULTRA PROFIT STRATEGY - Balance: $${balance.toFixed(2)}`);
      const { ultraProfitableStrategy } = await import('./ultraProfitableStrategy');
      ultraProfitableStrategy.setBroadcastFunction(this.broadcastFn);
      await ultraProfitableStrategy.executeUltraProfitStrategy(userId);
      return;
    } else if (botSettings.strategy === 'optimized_scalping' || botSettings.strategy === 'ultra_scalping_max') {
      console.log(`🔥 STARTING HYPER-AGGRESSIVE TRADING for user ${userId}`);
      const { optimizedScalpingStrategy } = await import('./optimizedScalpingStrategy');
      const { hyperAggressiveTrading } = await import('./hyperAggressiveTrading');
      
      // Execute both strategies for maximum trading activity
      await optimizedScalpingStrategy.executeOptimizedScalping(userId);
      await hyperAggressiveTrading.executeHyperAggressive(userId);
      return;
    } else if (botSettings.strategy === 'ultra_scalping_max') {
      console.log(`🔥 EXECUTING FORCED TRADING for user ${userId}`);
      const { forcedTradingExecution } = await import('./forcedTradingExecution');
      
      // Execute forced trading for immediate al sat al sat activity
      await forcedTradingExecution.executeForcedTrades(userId);
      return;
    } else if (botSettings.strategy === 'rsi') {
      const { rsiTradingStrategy } = await import('./rsiTradingStrategy');
      await rsiTradingStrategy.executeRSIStrategy(userId);
      return;
    } else if (botSettings.strategy === 'arbitrage') {
      const { arbitrageTradingStrategy } = await import('./arbitrageTradingStrategy');
      await arbitrageTradingStrategy.executeArbitrageStrategy(userId);
      return;
    }

    // Step 1: Sell profitable positions
    await this.sellProfitablePositions(userId, portfolio);

    // Step 2: Execute buy strategy if balance allows
    if (balance > 5) {
      await this.executeBuyStrategy(userId, botSettings, cryptos, balance);
    }
  }

  private async sellProfitablePositions(userId: number, portfolio: any[]) {
    for (const position of portfolio) {
      const crypto = await storage.getCryptocurrency(position.cryptoId);
      if (!crypto) continue;

      const currentPrice = parseFloat(crypto.currentPrice);
      const avgPrice = parseFloat(position.averagePrice);
      const amount = parseFloat(position.amount);
      const profitPercentage = ((currentPrice - avgPrice) / avgPrice) * 100;

      // Only sell if there's meaningful profit (minimum $0.05 and 0.5%)
      const currentValue = amount * currentPrice;
      const investedValue = amount * avgPrice;
      const absoluteProfit = currentValue - investedValue;

      if (absoluteProfit > 0.05 && profitPercentage > 0.5) {
        let sellRatio = 0.4; // Base sell ratio
        if (profitPercentage > 2) sellRatio = 0.6; // Higher profits, sell more
        if (profitPercentage > 5) sellRatio = 0.8; // Very high profits, sell most
        
        const sellAmount = amount * sellRatio;
        const totalValue = sellAmount * currentPrice;
        const profit = (currentPrice - avgPrice) * sellAmount;

        console.log(`💰 SELLING PROFITABLE: ${sellAmount.toFixed(6)} ${crypto.symbol} for $${totalValue.toFixed(2)} (Profit: $${profit.toFixed(2)})`);

        const tradeData: InsertTrade = {
          userId,
          cryptoId: position.cryptoId,
          type: 'sell',
          amount: sellAmount.toString(),
          price: currentPrice.toString(),
          total: totalValue.toString(),
          isBot: true
        };

        await storage.createTrade(tradeData);
        await this.updatePortfolioAfterSell(userId, position.cryptoId, sellAmount);

        // Update balance
        const user = await storage.getUser(userId);
        if (user) {
          const newBalance = parseFloat(user.balance) + totalValue;
          await storage.updateUserBalance(userId, newBalance.toString());
        }

        // Broadcast real-time update
        if (this.broadcastFn) {
          this.broadcastFn({
            type: 'trade',
            data: {
              action: 'sell',
              symbol: crypto.symbol,
              amount: sellAmount.toFixed(6),
              price: currentPrice.toFixed(2),
              total: totalValue.toFixed(2),
              strategy: `Profit taking: +${profitPercentage.toFixed(2)}%`,
              profit: profit.toFixed(2)
            }
          });
        }

        // No notifications - focus on trading execution only
      }
    }
  }

  private async executeBuyStrategy(userId: number, botSettings: any, cryptos: any[], balance: number) {
    const strategy = botSettings.strategy;
    const riskLevel = botSettings.riskLevel;

    // Dynamic strategy execution based on market conditions
    const marketVolatility = this.calculateMarketVolatility(cryptos);
    console.log(`📊 Market volatility: ${marketVolatility.toFixed(2)}% - Strategy: ${strategy}`);

    // Execute multiple strategies for maximum profit potential
    if (strategy === 'grid' || marketVolatility > 5) {
      // High volatility: execute all strategies
      await this.executeScalpingStrategy(userId, cryptos, balance, riskLevel);
      await this.executeMomentumStrategy(userId, cryptos, balance, riskLevel);
      await this.executeMeanReversionStrategy(userId, cryptos, balance, riskLevel);
    } else if (strategy === 'rsi') {
      // Execute RSI-based strategy
      const { rsiTradingStrategy } = await import('./rsiTradingStrategy');
      await rsiTradingStrategy.executeRSIStrategy(userId);
    } else {
      // Normal volatility: execute selected strategy
      switch (strategy) {
        case 'scalping':
          await this.executeScalpingStrategy(userId, cryptos, balance, riskLevel);
          break;
        case 'momentum':
          await this.executeMomentumStrategy(userId, cryptos, balance, riskLevel);
          break;
        case 'mean-reversion':
          await this.executeMeanReversionStrategy(userId, cryptos, balance, riskLevel);
          break;
        default:
          await this.executeScalpingStrategy(userId, cryptos, balance, riskLevel);
      }
    }
  }

  private calculateMarketVolatility(cryptos: any[]): number {
    const changes = cryptos.map(crypto => Math.abs(parseFloat(crypto.priceChange24h)));
    const avgVolatility = changes.reduce((sum, change) => sum + change, 0) / changes.length;
    return avgVolatility;
  }

  private async executeScalpingStrategy(userId: number, cryptos: any[], balance: number, riskLevel: number) {
    // Enhanced scalping: target high volatility with quick entry/exit
    const candidates = cryptos
      .filter(crypto => {
        const priceChange = parseFloat(crypto.priceChange24h);
        const price = parseFloat(crypto.currentPrice);
        return Math.abs(priceChange) > 3 && price > 0.01; // Higher volatility threshold
      })
      .sort((a, b) => Math.abs(parseFloat(b.priceChange24h)) - Math.abs(parseFloat(a.priceChange24h)))
      .slice(0, 2); // Focus on top 2 most volatile

    for (const crypto of candidates) {
      const investAmount = Math.min(balance * 0.15, 2); // Increase investment per trade
      await this.executeBuy(userId, crypto, investAmount, 'High-volatility scalping');
    }
  }

  private async executeMomentumStrategy(userId: number, cryptos: any[], balance: number, riskLevel: number) {
    // Enhanced momentum: focus on strong upward trends with volume confirmation
    const candidates = cryptos
      .filter(crypto => {
        const priceChange = parseFloat(crypto.priceChange24h);
        const price = parseFloat(crypto.currentPrice);
        return priceChange > 5 && price > 0.001; // Strong upward momentum
      })
      .sort((a, b) => parseFloat(b.priceChange24h) - parseFloat(a.priceChange24h))
      .slice(0, 3);

    for (const crypto of candidates) {
      const investAmount = Math.min(balance * 0.2, 2.5); // Aggressive momentum investing
      await this.executeBuy(userId, crypto, investAmount, `Strong momentum: +${parseFloat(crypto.priceChange24h).toFixed(1)}%`);
    }
  }

  private async executeMeanReversionStrategy(userId: number, cryptos: any[], balance: number, riskLevel: number) {
    // Enhanced mean reversion: target oversold conditions with strong fundamentals
    const candidates = cryptos
      .filter(crypto => {
        const priceChange = parseFloat(crypto.priceChange24h);
        const price = parseFloat(crypto.currentPrice);
        return priceChange < -2 && price > 0.001; // Oversold but not trash coins
      })
      .sort((a, b) => parseFloat(a.priceChange24h) - parseFloat(b.priceChange24h))
      .slice(0, 3);

    for (const crypto of candidates) {
      const investAmount = Math.min(balance * 0.18, 2); // Aggressive value buying
      await this.executeBuy(userId, crypto, investAmount, `Value buy: ${parseFloat(crypto.priceChange24h).toFixed(1)}% dip`);
    }
  }

  private async executeGridStrategy(userId: number, cryptos: any[], balance: number, riskLevel: number) {
    // Diversified approach across multiple cryptocurrencies
    const candidates = cryptos
      .filter(crypto => Math.abs(parseFloat(crypto.priceChange24h)) > 1)
      .slice(0, 4);

    for (const crypto of candidates) {
      await this.executeBuy(userId, crypto, balance * 0.04, 'Grid diversification');
    }
  }

  private async executeBuy(userId: number, crypto: any, maxAmount: number, reason: string) {
    const user = await storage.getUser(userId);
    if (!user) return;

    const balance = parseFloat(user.balance);
    if (balance < 2) return;

    const investAmount = Math.min(maxAmount, Math.max(1, balance * 0.2));
    const currentPrice = parseFloat(crypto.currentPrice);
    const quantity = investAmount / currentPrice;

    console.log(`🔥 BUY: ${quantity.toFixed(6)} ${crypto.symbol} for $${investAmount.toFixed(2)} - ${reason}`);

    const tradeData: InsertTrade = {
      userId,
      cryptoId: crypto.id,
      type: 'buy',
      amount: quantity.toString(),
      price: currentPrice.toString(),
      total: investAmount.toString(),
      isBot: true
    };

    await storage.createTrade(tradeData);
    await this.updatePortfolioAfterBuy(userId, crypto.id, quantity, currentPrice);

    // Update balance
    const newBalance = balance - investAmount;
    await storage.updateUserBalance(userId, newBalance.toString());

    // Broadcast real-time update
    if (this.broadcastFn) {
      this.broadcastFn({
        type: 'trade',
        data: {
          action: 'buy',
          symbol: crypto.symbol,
          amount: quantity.toFixed(6),
          price: currentPrice.toFixed(2),
          total: investAmount.toFixed(2),
          strategy: reason,
          profit: '0.00'
        }
      });
    }

    // Send Telegram notification for buy trade
    try {
      await telegramService.sendTradeNotification(tradeData, crypto);
    } catch (error) {
      console.log('Telegram notification error:', error);
    }
  }

  private async updatePortfolioAfterBuy(userId: number, cryptoId: number, quantity: number, price: number) {
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

  private async updatePortfolioAfterSell(userId: number, cryptoId: number, soldAmount: number) {
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
}

export const autonomousTradingEngine = new AutonomousTradingEngine();