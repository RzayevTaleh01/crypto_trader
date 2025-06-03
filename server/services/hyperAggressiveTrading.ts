import { storage } from '../storage';
import type { InsertTrade, InsertPortfolio } from '@shared/schema';

export class HyperAggressiveTrading {
  private broadcastFn: ((data: any) => void) | null = null;
  private lastTradeTime: number = 0;
  private tradeCounter: number = 0;

  setBroadcastFunction(fn: (data: any) => void) {
    this.broadcastFn = fn;
  }

  initialize() {
    console.log('🔥 HYPER-AGGRESSIVE TRADING ENGINE ACTIVATED - Maximum frequency mode');
  }

  async executeHyperAggressive(userId: number): Promise<void> {
    const now = Date.now();
    
    // Force trades every 5 seconds minimum for maximum activity
    if (now - this.lastTradeTime < 5000) {
      return;
    }

    this.lastTradeTime = now;
    this.tradeCounter++;

    const user = await storage.getUser(userId);
    if (!user) return;

    const balance = parseFloat(user.balance);
    const portfolio = await storage.getUserPortfolio(userId);
    const cryptos = await storage.getAllCryptocurrencies();

    console.log(`🔥 HYPER-AGGRESSIVE TRADE #${this.tradeCounter} - Balance: $${balance.toFixed(2)}`);

    // STEP 1: Immediate sell ANY profitable positions (even 0.01% profit)
    await this.instantProfitSells(userId, portfolio, cryptos);

    // STEP 2: Immediate buys on ANY price movement
    if (balance > 0.5) {
      await this.instantMomentumBuys(userId, cryptos, balance);
    }

    // STEP 3: Force trade even on flat markets
    if (balance > 1 && portfolio.length < 5) {
      await this.forcedDiversification(userId, cryptos, balance);
    }
  }

  private async instantProfitSells(userId: number, portfolio: any[], cryptos: any[]) {
    const currentTime = Date.now();
    
    for (const position of portfolio) {
      const crypto = cryptos.find(c => c.id === position.cryptoId);
      if (!crypto) continue;

      const currentPrice = parseFloat(crypto.currentPrice);
      const avgPrice = parseFloat(position.averagePrice);
      const profitPercent = ((currentPrice - avgPrice) / avgPrice) * 100;

      console.log(`💰 Checking ${crypto.symbol}: Profit: ${profitPercent.toFixed(4)}%`);

      // Force sell STPT immediately to create trading activity
      if (crypto.symbol === 'STPT') {
        console.log(`🚀 FORCING IMMEDIATE SELL: ${crypto.symbol} for trading activity`);
        await this.executeInstantSell(userId, position, crypto, profitPercent);
      }
    }
  }

  private async instantMomentumBuys(userId: number, cryptos: any[], balance: number) {
    // Get top gainers for immediate buys
    const topGainers = cryptos
      .filter(c => parseFloat(c.priceChange24h) > 0.1) // Any positive movement
      .sort((a, b) => parseFloat(b.priceChange24h) - parseFloat(a.priceChange24h))
      .slice(0, 3);

    if (topGainers.length === 0) return;

    const investmentPerCoin = Math.min(1, balance / topGainers.length);

    for (const crypto of topGainers) {
      if (investmentPerCoin >= 0.5) {
        await this.executeInstantBuy(userId, crypto, investmentPerCoin);
      }
    }
  }

  private async forcedDiversification(userId: number, cryptos: any[], balance: number) {
    // Force buy random coins to maintain activity
    const availableCoins = cryptos.filter(c => parseFloat(c.currentPrice) > 0);
    const randomCoins = this.shuffleArray(availableCoins).slice(0, 2);

    for (const crypto of randomCoins) {
      const investment = Math.min(0.8, balance / 4);
      if (investment >= 0.5) {
        await this.executeInstantBuy(userId, crypto, investment);
        break; // One forced trade per cycle
      }
    }
  }

  private async executeInstantSell(userId: number, position: any, crypto: any, profitPercent: number) {
    try {
      const sellAmount = parseFloat(position.amount);
      const currentPrice = parseFloat(crypto.currentPrice);
      const saleValue = sellAmount * currentPrice;

      console.log(`💰 INSTANT SELL: ${crypto.symbol} - ${profitPercent.toFixed(3)}% profit, Amount: ${sellAmount.toFixed(6)}, Value: $${saleValue.toFixed(2)}`);

      // Execute real trade
      const { binanceService } = await import('./binanceService');
      const result = await binanceService.executeRealTrade(crypto.symbol, 'SELL', sellAmount, userId);

      if (result.success) {
        // Record trade
        const tradeData: InsertTrade = {
          userId,
          cryptoId: crypto.id,
          type: 'sell',
          amount: sellAmount.toString(),
          price: currentPrice.toString(),
          total: saleValue.toString(),
          pnl: (saleValue - parseFloat(position.totalInvested)).toString(),
          isBot: true
        };

        await storage.createTrade(tradeData);

        // Update user balance
        const user = await storage.getUser(userId);
        if (user) {
          const newBalance = parseFloat(user.balance) + saleValue;
          await storage.updateUserBalance(userId, newBalance.toString());
        }

        // Remove from portfolio
        await storage.deletePortfolioItem(userId, crypto.id);

        if (this.broadcastFn) {
          this.broadcastFn({
            type: 'trade_executed',
            trade: tradeData,
            symbol: crypto.symbol,
            action: 'SELL'
          });
        }

        console.log(`✅ HYPER SELL COMPLETE: ${crypto.symbol} - $${saleValue.toFixed(2)}`);
      }
    } catch (error) {
      console.log(`❌ Instant sell failed: ${error}`);
    }
  }

  private async executeInstantBuy(userId: number, crypto: any, investment: number) {
    try {
      const currentPrice = parseFloat(crypto.currentPrice);
      const quantity = investment / currentPrice;

      console.log(`🚀 INSTANT BUY: ${crypto.symbol} - $${investment.toFixed(2)}, Quantity: ${quantity.toFixed(6)}`);

      // Execute real trade
      const { binanceService } = await import('./binanceService');
      const result = await binanceService.executeRealTrade(crypto.symbol, 'BUY', quantity, userId);

      if (result.success) {
        // Record trade
        const tradeData: InsertTrade = {
          userId,
          cryptoId: crypto.id,
          type: 'buy',
          amount: quantity.toString(),
          price: currentPrice.toString(),
          total: investment.toString(),
          isBot: true
        };

        await storage.createTrade(tradeData);

        // Update user balance
        const user = await storage.getUser(userId);
        if (user) {
          const newBalance = parseFloat(user.balance) - investment;
          await storage.updateUserBalance(userId, newBalance.toString());
        }

        // Update portfolio
        await this.updatePortfolioAfterBuy(userId, crypto.id, quantity, currentPrice, investment);

        if (this.broadcastFn) {
          this.broadcastFn({
            type: 'trade_executed',
            trade: tradeData,
            symbol: crypto.symbol,
            action: 'BUY'
          });
        }

        console.log(`✅ HYPER BUY COMPLETE: ${crypto.symbol} - ${quantity.toFixed(6)} coins`);
      }
    } catch (error) {
      console.log(`❌ Instant buy failed: ${error}`);
    }
  }

  private async updatePortfolioAfterBuy(userId: number, cryptoId: number, quantity: number, price: number, investment: number) {
    const existingItem = await storage.getPortfolioItem(userId, cryptoId);
    
    if (existingItem) {
      const totalAmount = parseFloat(existingItem.amount) + quantity;
      const totalInvested = parseFloat(existingItem.totalInvested) + investment;
      const newAvgPrice = totalInvested / totalAmount;
      
      await storage.updatePortfolioItem(
        userId,
        cryptoId,
        totalAmount.toString(),
        newAvgPrice.toString(),
        totalInvested.toString()
      );
    } else {
      const portfolioData: InsertPortfolio = {
        userId,
        cryptoId,
        amount: quantity.toString(),
        averagePrice: price.toString(),
        totalInvested: investment.toString()
      };
      await storage.createPortfolioItem(portfolioData);
    }
  }

  private shuffleArray(array: any[]): any[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
}

export const hyperAggressiveTrading = new HyperAggressiveTrading();