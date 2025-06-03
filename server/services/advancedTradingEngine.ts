import { storage } from '../storage';
import { InsertTrade } from '@shared/schema';

interface ProfitTarget {
  percentage: number;
  sellRatio: number;
  confidence: number;
}

interface StopLoss {
  percentage: number;
  sellRatio: number;
}

export class AdvancedTradingEngine {
  private broadcastFn: ((data: any) => void) | null = null;

  setBroadcastFunction(fn: (data: any) => void) {
    this.broadcastFn = fn;
  }

  // RSI-based momentum trading with immediate profit capture
  async executeRSIMomentumStrategy(userId: number): Promise<void> {
    const user = await storage.getUser(userId);
    if (!user) return;

    const balance = parseFloat(user.balance);
    const cryptos = await storage.getAllCryptocurrencies();
    
    for (const crypto of cryptos.slice(0, 5)) {
      const currentPrice = parseFloat(crypto.currentPrice);
      const priceChange = parseFloat(crypto.priceChange24h);
      
      // Check existing position first (priority on profit-taking)
      const portfolioItem = await storage.getPortfolioItem(userId, crypto.id);
      
      if (portfolioItem) {
        const sellSignal = await this.evaluateSellOpportunity(userId, crypto, portfolioItem);
        if (sellSignal.shouldSell) {
          await this.executeSellOrder(userId, crypto, sellSignal.amount, sellSignal.reason);
          continue;
        }
      }
      
      // RSI-style buy signal (oversold conditions)
      if (priceChange < -3 && Math.abs(priceChange) > 2) {
        const buyAmount = this.calculateBuyAmount(balance, portfolioItem, 5);
        if (buyAmount > 0) {
          await this.executeBuyOrder(userId, crypto, buyAmount, `RSI momentum: ${priceChange.toFixed(2)}% oversold`);
        }
      }
    }
  }

  // MACD-style crossover strategy with profit locks
  async executeMACDCrossoverStrategy(userId: number): Promise<void> {
    const user = await storage.getUser(userId);
    if (!user) return;

    const balance = parseFloat(user.balance);
    const cryptos = await storage.getAllCryptocurrencies();
    
    for (const crypto of cryptos.slice(0, 8)) {
      const currentPrice = parseFloat(crypto.currentPrice);
      const priceChange = parseFloat(crypto.priceChange24h);
      const volatility = Math.abs(priceChange);
      
      const portfolioItem = await storage.getPortfolioItem(userId, crypto.id);
      
      // Priority: Profit-taking and loss prevention
      if (portfolioItem) {
        const sellSignal = await this.evaluateAdvancedSellSignal(userId, crypto, portfolioItem);
        if (sellSignal.shouldSell) {
          await this.executeSellOrder(userId, crypto, sellSignal.amount, sellSignal.reason);
          continue;
        }
      }
      
      // MACD-style bullish crossover (strong momentum)
      if (priceChange > 3 && volatility > 4) {
        const buyAmount = this.calculateMomentumBuyAmount(balance, portfolioItem, volatility);
        if (buyAmount > 0) {
          await this.executeBuyOrder(userId, crypto, buyAmount, `MACD crossover: ${priceChange.toFixed(2)}% bullish momentum`);
        }
      }
    }
  }

  // Bollinger Bands strategy with tight profit margins
  async executeBollingerBandsStrategy(userId: number): Promise<void> {
    const user = await storage.getUser(userId);
    if (!user) return;

    const balance = parseFloat(user.balance);
    const cryptos = await storage.getAllCryptocurrencies();
    
    for (const crypto of cryptos.slice(0, 6)) {
      const currentPrice = parseFloat(crypto.currentPrice);
      const priceChange = parseFloat(crypto.priceChange24h);
      
      const portfolioItem = await storage.getPortfolioItem(userId, crypto.id);
      
      // Immediate profit capture (Bollinger strategy focuses on quick reversals)
      if (portfolioItem) {
        const profitSignal = await this.evaluateQuickProfitSignal(userId, crypto, portfolioItem);
        if (profitSignal.shouldSell) {
          await this.executeSellOrder(userId, crypto, profitSignal.amount, profitSignal.reason);
          continue;
        }
      }
      
      // Bollinger lower band bounce (oversold)
      if (priceChange < -4) {
        const buyAmount = this.calculateReversalBuyAmount(balance, portfolioItem);
        if (buyAmount > 0) {
          await this.executeBuyOrder(userId, crypto, buyAmount, `Bollinger bounce: ${priceChange.toFixed(2)}% oversold reversal`);
        }
      }
    }
  }

  private async evaluateSellOpportunity(userId: number, crypto: any, portfolioItem: any) {
    const currentPrice = parseFloat(crypto.currentPrice);
    const avgPrice = parseFloat(portfolioItem.averagePrice);
    const profitPercent = ((currentPrice - avgPrice) / avgPrice) * 100;
    const holdingAmount = parseFloat(portfolioItem.amount);

    // Aggressive profit-taking
    if (profitPercent > 1.5) {
      return {
        shouldSell: true,
        amount: holdingAmount * 0.7,
        reason: `Profit lock: ${profitPercent.toFixed(2)}% gain secured`
      };
    }

    // Stop-loss protection
    if (profitPercent < -2.5) {
      return {
        shouldSell: true,
        amount: holdingAmount * 0.4,
        reason: `Stop-loss: ${profitPercent.toFixed(2)}% loss cut`
      };
    }

    return { shouldSell: false, amount: 0, reason: '' };
  }

  private async evaluateAdvancedSellSignal(userId: number, crypto: any, portfolioItem: any) {
    const currentPrice = parseFloat(crypto.currentPrice);
    const avgPrice = parseFloat(portfolioItem.averagePrice);
    const profitPercent = ((currentPrice - avgPrice) / avgPrice) * 100;
    const priceChange = parseFloat(crypto.priceChange24h);
    const holdingAmount = parseFloat(portfolioItem.amount);

    // Technical profit-taking (momentum reversal)
    if (profitPercent > 2 || (profitPercent > 0.8 && priceChange < -1)) {
      return {
        shouldSell: true,
        amount: holdingAmount * 0.6,
        reason: `Technical exit: ${profitPercent.toFixed(2)}% profit + momentum shift`
      };
    }

    // Advanced stop-loss
    if (profitPercent < -3 || (profitPercent < -1.5 && priceChange < -3)) {
      return {
        shouldSell: true,
        amount: holdingAmount * 0.5,
        reason: `Advanced stop: ${profitPercent.toFixed(2)}% loss + negative momentum`
      };
    }

    return { shouldSell: false, amount: 0, reason: '' };
  }

  private async evaluateQuickProfitSignal(userId: number, crypto: any, portfolioItem: any) {
    const currentPrice = parseFloat(crypto.currentPrice);
    const avgPrice = parseFloat(portfolioItem.averagePrice);
    const profitPercent = ((currentPrice - avgPrice) / avgPrice) * 100;
    const holdingAmount = parseFloat(portfolioItem.amount);

    // Quick profit capture (any positive movement)
    if (profitPercent > 0.5) {
      return {
        shouldSell: true,
        amount: holdingAmount * 0.8,
        reason: `Quick profit: ${profitPercent.toFixed(2)}% immediate capture`
      };
    }

    return { shouldSell: false, amount: 0, reason: '' };
  }

  private calculateBuyAmount(balance: number, portfolioItem: any, riskLevel: number): number {
    const maxPosition = balance * 0.15 * (riskLevel / 10);
    const currentInvestment = portfolioItem ? parseFloat(portfolioItem.totalInvested) : 0;
    return Math.max(0, maxPosition - currentInvestment);
  }

  private calculateMomentumBuyAmount(balance: number, portfolioItem: any, volatility: number): number {
    const maxPosition = balance * 0.2 * Math.min(volatility / 5, 1);
    const currentInvestment = portfolioItem ? parseFloat(portfolioItem.totalInvested) : 0;
    return Math.max(0, maxPosition - currentInvestment);
  }

  private calculateReversalBuyAmount(balance: number, portfolioItem: any): number {
    const maxPosition = balance * 0.18;
    const currentInvestment = portfolioItem ? parseFloat(portfolioItem.totalInvested) : 0;
    return Math.max(0, maxPosition - currentInvestment);
  }

  private async executeBuyOrder(userId: number, crypto: any, amount: number, reason: string) {
    const currentPrice = parseFloat(crypto.currentPrice);
    const quantity = amount / currentPrice;
    
    if (quantity < 0.001) return; // Minimum trade size

    const tradeData: InsertTrade = {
      userId,
      cryptoId: crypto.id,
      type: 'buy',
      amount: quantity.toString(),
      price: currentPrice.toString(),
      total: amount.toString(),
      isBot: true
    };

    await storage.createTrade(tradeData);
    await this.updatePortfolioAfterBuy(userId, crypto.id, quantity, currentPrice);
    await storage.updateUserBalance(userId, (parseFloat((await storage.getUser(userId))!.balance) - amount).toString());

    if (this.broadcastFn) {
      this.broadcastFn({
        type: 'trade',
        data: {
          action: 'buy',
          symbol: crypto.symbol,
          amount: quantity.toFixed(6),
          price: currentPrice.toFixed(2),
          total: amount.toFixed(2),
          strategy: reason
        }
      });
    }
  }

  private async executeSellOrder(userId: number, crypto: any, amount: number, reason: string) {
    const currentPrice = parseFloat(crypto.currentPrice);
    const total = amount * currentPrice;

    const tradeData: InsertTrade = {
      userId,
      cryptoId: crypto.id,
      type: 'sell',
      amount: amount.toString(),
      price: currentPrice.toString(),
      total: total.toString(),
      isBot: true
    };

    await storage.createTrade(tradeData);
    await this.updatePortfolioAfterSell(userId, crypto.id, amount, currentPrice);
    await storage.updateUserBalance(userId, (parseFloat((await storage.getUser(userId))!.balance) + total).toString());

    if (this.broadcastFn) {
      this.broadcastFn({
        type: 'trade',
        data: {
          action: 'sell',
          symbol: crypto.symbol,
          amount: amount.toFixed(6),
          price: currentPrice.toFixed(2),
          total: total.toFixed(2),
          strategy: reason
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

  private async updatePortfolioAfterSell(userId: number, cryptoId: number, quantity: number, price: number) {
    const existing = await storage.getPortfolioItem(userId, cryptoId);
    
    if (existing) {
      const currentAmount = parseFloat(existing.amount);
      const newAmount = Math.max(0, currentAmount - quantity);
      
      if (newAmount < 0.001) {
        await storage.deletePortfolioItem(userId, cryptoId);
      } else {
        const currentTotal = parseFloat(existing.totalInvested);
        const soldRatio = quantity / currentAmount;
        const newTotal = currentTotal * (1 - soldRatio);
        
        await storage.updatePortfolioItem(userId, cryptoId, newAmount.toString(), existing.averagePrice, newTotal.toString());
      }
    }
  }
}

export const advancedTradingEngine = new AdvancedTradingEngine();