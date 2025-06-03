import { storage } from '../storage';
import { InsertTrade } from '@shared/schema';

interface ProfitTakingSignal {
  action: 'sell' | 'hold';
  amount: number;
  reason: string;
  expectedProfit: number;
}

export class ProfitTakingEngine {
  private broadcastFn: ((data: any) => void) | null = null;

  setBroadcastFunction(fn: (data: any) => void) {
    this.broadcastFn = fn;
  }

  async executeImmediateProfitTaking(userId: number): Promise<void> {
    console.log('🔥 EXECUTING IMMEDIATE PROFIT TAKING FOR USER', userId);
    
    const user = await storage.getUser(userId);
    if (!user) return;

    const portfolioItems = await storage.getUserPortfolio(userId);
    if (!portfolioItems.length) return;

    let totalProfitGenerated = 0;

    for (const item of portfolioItems) {
      const crypto = await storage.getCryptocurrency(item.cryptoId);
      if (!crypto) continue;

      const signal = await this.evaluateProfitOpportunity(item, crypto);
      
      if (signal.action === 'sell' && signal.amount > 0) {
        await this.executeProfitSell(userId, crypto, signal);
        totalProfitGenerated += signal.expectedProfit;
        
        // Add delay to prevent overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    if (totalProfitGenerated > 0) {
      console.log(`💰 TOTAL PROFIT GENERATED: $${totalProfitGenerated.toFixed(2)}`);
    }
  }

  private async evaluateProfitOpportunity(portfolioItem: any, crypto: any): Promise<ProfitTakingSignal> {
    const currentPrice = parseFloat(crypto.currentPrice);
    const avgPrice = parseFloat(portfolioItem.averagePrice);
    const amount = parseFloat(portfolioItem.amount);
    const priceChange24h = parseFloat(crypto.priceChange24h);
    
    const profitPercentage = ((currentPrice - avgPrice) / avgPrice) * 100;
    const currentValue = amount * currentPrice;
    const investedValue = parseFloat(portfolioItem.totalInvested);

    console.log(`📊 ${crypto.symbol}: Price: $${currentPrice}, Avg: $${avgPrice}, P&L: ${profitPercentage.toFixed(2)}%`);

    // Only sell if there's ACTUAL profit (price higher than average)
    if (profitPercentage > 0.5) { // Minimum 0.5% profit required
      const sellRatio = this.calculateSellRatio(profitPercentage, priceChange24h);
      const sellAmount = amount * sellRatio;
      const expectedProfit = (currentPrice - avgPrice) * sellAmount;
      
      return {
        action: 'sell',
        amount: sellAmount,
        reason: `Real profit: ${profitPercentage.toFixed(2)}% gain (${expectedProfit.toFixed(2)}$)`,
        expectedProfit
      };
    }

    // Take profits on high momentum ONLY if profitable
    if (priceChange24h > 5 && profitPercentage > 1) {
      const sellAmount = amount * 0.4; // Sell 40% on very strong momentum
      const expectedProfit = (currentPrice - avgPrice) * sellAmount;
      
      return {
        action: 'sell',
        amount: sellAmount,
        reason: `High momentum profit: ${priceChange24h.toFixed(2)}% surge (+${expectedProfit.toFixed(2)}$)`,
        expectedProfit
      };
    }

    // Cut losses early to preserve capital
    if (profitPercentage < -2) {
      const sellAmount = amount * 0.4; // Sell 40% to reduce exposure
      const expectedProfit = (currentPrice - avgPrice) * sellAmount; // This will be negative (loss)
      
      return {
        action: 'sell',
        amount: sellAmount,
        reason: `Loss cutting: ${profitPercentage.toFixed(2)}% stop loss`,
        expectedProfit
      };
    }

    return {
      action: 'hold',
      amount: 0,
      reason: 'No profit opportunity',
      expectedProfit: 0
    };
  }

  private calculateSellRatio(profitPercentage: number, momentum: number): number {
    // More aggressive selling on higher profits
    if (profitPercentage > 5) return 0.8; // Sell 80%
    if (profitPercentage > 3) return 0.6; // Sell 60%
    if (profitPercentage > 1) return 0.5; // Sell 50%
    if (profitPercentage > 0.5) return 0.4; // Sell 40%
    return 0.3; // Sell 30% minimum
  }

  private async executeProfitSell(userId: number, crypto: any, signal: ProfitTakingSignal): Promise<void> {
    const currentPrice = parseFloat(crypto.currentPrice);
    const totalValue = signal.amount * currentPrice;

    console.log(`💸 EXECUTING PROFIT SELL: ${signal.amount.toFixed(6)} ${crypto.symbol} for $${totalValue.toFixed(2)}`);
    console.log(`💡 Reason: ${signal.reason}`);

    // Create sell trade
    const tradeData: InsertTrade = {
      userId,
      cryptoId: crypto.id,
      type: 'sell',
      amount: signal.amount.toString(),
      price: currentPrice.toString(),
      total: totalValue.toString(),
      isBot: true
    };

    await storage.createTrade(tradeData);
    await this.updatePortfolioAfterSell(userId, crypto.id, signal.amount);
    
    // Update user balance with profit
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
          amount: signal.amount.toFixed(6),
          price: currentPrice.toFixed(2),
          total: totalValue.toFixed(2),
          strategy: signal.reason,
          profit: signal.expectedProfit.toFixed(2)
        }
      });
    }

    console.log(`✅ PROFIT SELL COMPLETED: ${crypto.symbol} - Profit: $${signal.expectedProfit.toFixed(2)}`);
  }

  private async updatePortfolioAfterSell(userId: number, cryptoId: number, soldAmount: number): Promise<void> {
    const existing = await storage.getPortfolioItem(userId, cryptoId);
    
    if (existing) {
      const currentAmount = parseFloat(existing.amount);
      const newAmount = Math.max(0, currentAmount - soldAmount);
      
      if (newAmount < 0.001) {
        // Position completely closed
        await storage.deletePortfolioItem(userId, cryptoId);
        console.log(`🔒 Position closed for crypto ID ${cryptoId}`);
      } else {
        // Reduce position size proportionally
        const sellRatio = soldAmount / currentAmount;
        const currentTotal = parseFloat(existing.totalInvested);
        const newTotal = currentTotal * (1 - sellRatio);
        
        await storage.updatePortfolioItem(
          userId, 
          cryptoId, 
          newAmount.toString(), 
          existing.averagePrice, 
          newTotal.toString()
        );
      }
    }
  }
}

export const profitTakingEngine = new ProfitTakingEngine();