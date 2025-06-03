import { storage } from '../storage';
import { InsertTrade } from '@shared/schema';

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
    
    const botInterval = setInterval(async () => {
      try {
        const botSettings = await storage.getBotSettings(userId);
        if (!botSettings || !botSettings.isActive) {
          this.stopBot(userId);
          return;
        }
        
        await this.executeStrategy(userId, botSettings);
      } catch (error) {
        console.log('Autonomous trading error:', error);
      }
    }, 10000); // Execute every 10 seconds

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

    // Step 1: Sell profitable positions
    await this.sellProfitablePositions(userId, portfolio);

    // Step 2: Execute buy strategy if balance allows
    if (balance > 50) {
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

      // Sell if profitable (minimum 1% profit)
      if (profitPercentage > 1) {
        const sellAmount = amount * 0.6; // Sell 60% of profitable position
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
      }
    }
  }

  private async executeBuyStrategy(userId: number, botSettings: any, cryptos: any[], balance: number) {
    const strategy = botSettings.strategy;
    const riskLevel = botSettings.riskLevel;

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
      case 'grid':
        await this.executeGridStrategy(userId, cryptos, balance, riskLevel);
        break;
      default:
        await this.executeScalpingStrategy(userId, cryptos, balance, riskLevel);
    }
  }

  private async executeScalpingStrategy(userId: number, cryptos: any[], balance: number, riskLevel: number) {
    // Look for high-volume, quick price movements
    const candidates = cryptos
      .filter(crypto => {
        const priceChange = parseFloat(crypto.priceChange24h);
        return Math.abs(priceChange) > 2; // At least 2% movement
      })
      .sort((a, b) => Math.abs(parseFloat(b.priceChange24h)) - Math.abs(parseFloat(a.priceChange24h)))
      .slice(0, 3);

    for (const crypto of candidates) {
      await this.executeBuy(userId, crypto, balance * 0.05, 'Scalping opportunity');
    }
  }

  private async executeMomentumStrategy(userId: number, cryptos: any[], balance: number, riskLevel: number) {
    // Buy cryptocurrencies with strong upward momentum
    const candidates = cryptos
      .filter(crypto => parseFloat(crypto.priceChange24h) > 3)
      .sort((a, b) => parseFloat(b.priceChange24h) - parseFloat(a.priceChange24h))
      .slice(0, 2);

    for (const crypto of candidates) {
      await this.executeBuy(userId, crypto, balance * 0.08, 'Momentum trading');
    }
  }

  private async executeMeanReversionStrategy(userId: number, cryptos: any[], balance: number, riskLevel: number) {
    // Buy cryptocurrencies that have dropped significantly (value buying)
    const candidates = cryptos
      .filter(crypto => parseFloat(crypto.priceChange24h) < -3)
      .sort((a, b) => parseFloat(a.priceChange24h) - parseFloat(b.priceChange24h))
      .slice(0, 2);

    for (const crypto of candidates) {
      await this.executeBuy(userId, crypto, balance * 0.06, 'Mean reversion');
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
    if (balance < 50) return;

    const investAmount = Math.min(maxAmount, balance * 0.1);
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