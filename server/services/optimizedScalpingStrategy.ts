import { storage } from '../storage';
import type { InsertTrade, InsertPortfolio } from '@shared/schema';

export class OptimizedScalpingStrategy {
  private broadcastFn: ((data: any) => void) | null = null;
  private priceChanges: Map<string, number[]> = new Map();
  private lastPrices: Map<string, number> = new Map();
  private activePositions: Set<string> = new Set();

  setBroadcastFunction(fn: (data: any) => void) {
    this.broadcastFn = fn;
  }

  async executeOptimizedScalping(userId: number): Promise<void> {
    const user = await storage.getUser(userId);
    if (!user) return;

    const balance = parseFloat(user.balance);
    const portfolio = await storage.getUserPortfolio(userId);
    const cryptos = await storage.getAllCryptocurrencies();

    console.log(`⚡ OPTIMIZED SCALPING - Balance: $${balance.toFixed(2)}, Active: ${portfolio.length}`);

    // Get available trading pairs
    const { binanceService } = await import('./binanceService');
    const availablePairs = await binanceService.getTradingPairs();
    if (!availablePairs?.length) return;

    const availableSymbols = new Set(availablePairs.map((pair: any) => pair.baseAsset));

    // Update price movement tracking
    this.updatePriceMovements(cryptos.filter(c => availableSymbols.has(c.symbol)));

    // STEP 1: Ultra-fast profit taking (any gain > 0.1%)
    await this.ultraFastProfitTaking(userId, portfolio, cryptos);

    // STEP 2: High-frequency micro-scalping (buy on tiny dips)
    if (balance > 1) {
      await this.microScalpingBuys(userId, cryptos, balance, availableSymbols as Set<string>);
    }
  }

  private updatePriceMovements(cryptos: any[]) {
    for (const crypto of cryptos) {
      const currentPrice = parseFloat(crypto.currentPrice);
      const lastPrice = this.lastPrices.get(crypto.symbol);
      
      if (lastPrice && currentPrice > 0) {
        const change = ((currentPrice - lastPrice) / lastPrice) * 100;
        const changes = this.priceChanges.get(crypto.symbol) || [];
        changes.push(change);
        
        // Keep only last 10 price movements
        if (changes.length > 10) changes.shift();
        this.priceChanges.set(crypto.symbol, changes);
      }
      
      this.lastPrices.set(crypto.symbol, currentPrice);
    }
  }

  private async ultraFastProfitTaking(userId: number, portfolio: any[], cryptos: any[]) {
    console.log(`🚀 ULTRA-FAST PROFIT CHECK: ${portfolio.length} positions`);
    
    for (const position of portfolio) {
      try {
        const crypto = cryptos.find(c => c.id === position.cryptoId);
        if (!crypto) continue;

        const currentPrice = parseFloat(crypto.currentPrice);
        const avgPrice = parseFloat(position.averagePrice);
        const profitPercent = ((currentPrice - avgPrice) / avgPrice) * 100;

        // Sell on ANY profit > 0.1% (ultra-aggressive)
        if (profitPercent > 0.1) {
          await this.executeFastSell(userId, position, crypto, currentPrice, profitPercent);
        }
      } catch (error) {
        console.log(`❌ Fast sell failed: ${error}`);
      }
    }
  }

  private async microScalpingBuys(userId: number, cryptos: any[], balance: number, availableSymbols: Set<string>) {
    console.log(`💨 MICRO-SCALPING SCAN: $${balance.toFixed(2)}`);

    const opportunities = [];
    
    for (const crypto of cryptos) {
      if (!availableSymbols.has(crypto.symbol)) continue;
      if (this.activePositions.has(crypto.symbol)) continue;

      const currentPrice = parseFloat(crypto.currentPrice);
      const change24h = parseFloat(crypto.priceChange24h);
      const changes = this.priceChanges.get(crypto.symbol) || [];
      
      if (currentPrice <= 0) continue;

      // Micro-scalping opportunities
      let score = 0;
      
      // Recent price momentum (last few ticks)
      if (changes.length >= 3) {
        const recentChanges = changes.slice(-3);
        const avgChange = recentChanges.reduce((a, b) => a + b, 0) / recentChanges.length;
        
        // Buy on micro-dips (even -0.1%)
        if (avgChange < -0.1) {
          score += Math.abs(avgChange) * 10;
        }
      }

      // 24h volatility bonus
      if (Math.abs(change24h) > 2) {
        score += Math.abs(change24h) * 2;
      }

      // Price range preference (avoid very low or very high prices)
      if (currentPrice >= 0.01 && currentPrice <= 100) {
        score += 5;
      }

      if (score > 3) {
        opportunities.push({
          ...crypto,
          currentPrice,
          score,
          change24h
        });
      }
    }

    if (opportunities.length === 0) {
      console.log(`⚠️ No micro-scalping opportunities`);
      return;
    }

    // Sort by highest score
    opportunities.sort((a, b) => b.score - a.score);
    const topOps = opportunities.slice(0, 5);

    console.log(`🎯 Top micro-scalping targets:`);
    topOps.forEach(op => {
      console.log(`💎 ${op.symbol}: Score=${op.score.toFixed(1)}, Price=$${op.currentPrice.toFixed(4)}`);
    });

    // Execute micro-buys with small amounts
    const microAmount = Math.min(1, balance / topOps.length); // $1 max per position
    
    for (const opportunity of topOps) {
      if (microAmount >= 0.5) { // Minimum $0.50
        await this.executeMicroBuy(userId, opportunity, microAmount);
      }
    }
  }

  private async executeFastSell(userId: number, position: any, crypto: any, currentPrice: number, profitPercent: number) {
    try {
      const amount = parseFloat(position.amount);
      const sellValue = amount * currentPrice;

      console.log(`⚡ FAST SELL: ${crypto.symbol} +${profitPercent.toFixed(2)}% = $${sellValue.toFixed(2)}`);

      const { binanceService } = await import('./binanceService');
      const result = await binanceService.executeRealTrade(crypto.symbol, 'SELL', amount, userId);
      
      if (result.success) {
        console.log(`✅ SOLD ${amount.toFixed(6)} ${crypto.symbol}`);

        // Remove from active positions
        this.activePositions.delete(crypto.symbol);

        // Update portfolio
        await storage.deletePortfolioItem(userId, position.cryptoId);

        // Update balance
        const user = await storage.getUser(userId);
        const newBalance = parseFloat(user!.balance) + sellValue;
        await storage.updateUserBalance(userId, newBalance.toFixed(2));

        // Record trade
        const profit = sellValue - parseFloat(position.totalInvested);
        const tradeData: InsertTrade = {
          userId,
          cryptoId: position.cryptoId,
          type: 'sell',
          amount: amount.toFixed(6),
          price: currentPrice.toFixed(6),
          total: sellValue.toFixed(2)
        };
        await storage.createTrade(tradeData);

        // Broadcast
        if (this.broadcastFn) {
          this.broadcastFn({
            type: 'trade_executed',
            trade: {
              symbol: crypto.symbol,
              type: 'SELL',
              amount: amount.toFixed(6),
              price: currentPrice.toFixed(6),
              total: sellValue.toFixed(2),
              profit: profit.toFixed(2)
            }
          });
        }
      }
    } catch (error) {
      console.log(`❌ Fast sell failed for ${crypto.symbol}: ${error}`);
    }
  }

  private async executeMicroBuy(userId: number, crypto: any, investment: number) {
    try {
      const quantity = investment / crypto.currentPrice;

      console.log(`💨 MICRO BUY: ${crypto.symbol} $${investment.toFixed(2)} (Score: ${crypto.score.toFixed(1)})`);

      const { binanceService } = await import('./binanceService');
      const result = await binanceService.executeRealTrade(crypto.symbol, 'BUY', quantity, userId);
      
      if (result.success) {
        console.log(`✅ BOUGHT ${quantity.toFixed(6)} ${crypto.symbol}`);

        // Add to active positions
        this.activePositions.add(crypto.symbol);

        // Update portfolio
        const portfolioItem: InsertPortfolio = {
          userId,
          cryptoId: crypto.id,
          amount: quantity.toFixed(6),
          averagePrice: crypto.currentPrice.toFixed(6),
          totalInvested: investment.toFixed(2)
        };
        await storage.createPortfolioItem(portfolioItem);

        // Update balance
        const user = await storage.getUser(userId);
        const newBalance = parseFloat(user!.balance) - investment;
        await storage.updateUserBalance(userId, newBalance.toFixed(2));

        // Record trade
        const tradeData: InsertTrade = {
          userId,
          cryptoId: crypto.id,
          type: 'buy',
          amount: quantity.toFixed(6),
          price: crypto.currentPrice.toFixed(6),
          total: investment.toFixed(2)
        };
        await storage.createTrade(tradeData);

        // Broadcast
        if (this.broadcastFn) {
          this.broadcastFn({
            type: 'trade_executed',
            trade: {
              symbol: crypto.symbol,
              type: 'BUY',
              amount: quantity.toFixed(6),
              price: crypto.currentPrice.toFixed(6),
              total: investment.toFixed(2)
            }
          });
        }
      }
    } catch (error) {
      console.log(`❌ Micro buy failed for ${crypto.symbol}: ${error}`);
    }
  }
}

export const optimizedScalpingStrategy = new OptimizedScalpingStrategy();