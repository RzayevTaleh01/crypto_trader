import { storage } from '../storage';
import type { InsertTrade, InsertPortfolio } from '@shared/schema';

export class DirectTradingExecution {
  private broadcastFn: ((data: any) => void) | null = null;

  setBroadcastFunction(fn: (data: any) => void) {
    this.broadcastFn = fn;
  }

  async executeImmediateScalping(userId: number): Promise<void> {
    console.log(`🚀 DIRECT SCALPING EXECUTION STARTED for user ${userId}`);
    console.log(`🔧 Testing console output - this should appear in logs`);
    
    const user = await storage.getUser(userId);
    if (!user) {
      console.log(`❌ User ${userId} not found`);
      return;
    }

    const balance = parseFloat(user.balance);
    console.log(`💰 Current balance: $${balance.toFixed(2)}`);

    if (balance < 1) {
      console.log(`⚠️ Insufficient balance for trading: $${balance.toFixed(2)}`);
      return;
    }

    const cryptos = await storage.getAllCryptocurrencies();
    console.log(`📊 Analyzing ${cryptos.length} cryptocurrencies`);

    console.log(`🚀 DIRECT MODE: Trading all cryptocurrencies without Binance validation`);

    // Find immediate trading opportunities
    const opportunities = [];
    
    for (const crypto of cryptos) {
      // Skip symbol validation for maximum trading opportunities - trade all cryptocurrencies
      
      const currentPrice = parseFloat(crypto.currentPrice);
      const change24h = parseFloat(crypto.priceChange24h);
      
      if (currentPrice <= 0) continue;

      // Ultra-aggressive scalping criteria - lowered thresholds for more opportunities
      let score = 0;
      
      // Accept ANY price movement for maximum trading
      if (change24h < 0) {
        score += Math.abs(change24h) * 2; // Buy any dip
      }
      
      // Even small positive movements for quick profits
      if (change24h > 0 && change24h < 5) {
        score += change24h * 1.5;
      }
      
      // Price range optimization - very broad range
      if (currentPrice >= 0.001 && currentPrice <= 1000) {
        score += 5;
      }
      
      // Any volatility is tradeable
      if (Math.abs(change24h) > 0.1) {
        score += 3;
      }

      // Much lower threshold for maximum trading activity
      if (score > 2) {
        opportunities.push({
          ...crypto,
          currentPrice,
          score,
          change24h
        });
      }
    }

    if (opportunities.length === 0) {
      console.log(`⚠️ No immediate trading opportunities found`);
      return;
    }

    // Sort by highest score and execute top opportunities
    opportunities.sort((a, b) => b.score - a.score);
    const topOps = opportunities.slice(0, 3);

    console.log(`🎯 Executing immediate trades on top opportunities:`);
    
    const investmentPerTrade = Math.min(2, balance / topOps.length);
    
    for (let i = 0; i < topOps.length; i++) {
      const opportunity = topOps[i];
      console.log(`💎 Trade ${i+1}: ${opportunity.symbol} - Score: ${opportunity.score.toFixed(1)}, Price: $${opportunity.currentPrice.toFixed(4)}, Change: ${opportunity.change24h.toFixed(2)}%`);
      
      if (investmentPerTrade >= 0.5) {
        await this.executeImmediateBuy(userId, opportunity, investmentPerTrade);
      }
    }
  }

  private async executeImmediateBuy(userId: number, crypto: any, investment: number) {
    try {
      const quantity = investment / crypto.currentPrice;

      console.log(`⚡ EXECUTING BUY: ${crypto.symbol} - $${investment.toFixed(2)} (${quantity.toFixed(6)} coins)`);

      const { binanceService } = await import('./binanceService');
      const result = await binanceService.executeRealTrade(crypto.symbol, 'BUY', quantity, userId);
      
      if (result.success) {
        console.log(`✅ SUCCESSFUL BUY: ${quantity.toFixed(6)} ${crypto.symbol} at $${crypto.currentPrice.toFixed(6)}`);

        // Update portfolio
        const existingItem = await storage.getPortfolioItem(userId, crypto.id);
        
        if (existingItem) {
          const newAmount = parseFloat(existingItem.amount) + quantity;
          const newTotal = parseFloat(existingItem.totalInvested) + investment;
          const newAvgPrice = newTotal / newAmount;
          
          await storage.updatePortfolioItem(userId, crypto.id, newAmount.toFixed(6), newAvgPrice.toFixed(6), newTotal.toFixed(2));
        } else {
          const portfolioItem: InsertPortfolio = {
            userId,
            cryptoId: crypto.id,
            amount: quantity.toFixed(6),
            averagePrice: crypto.currentPrice.toFixed(6),
            totalInvested: investment.toFixed(2)
          };
          await storage.createPortfolioItem(portfolioItem);
        }

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

        console.log(`📈 Portfolio updated, new balance: $${newBalance.toFixed(2)}`);
      } else {
        console.log(`❌ BUY FAILED: ${crypto.symbol} - ${result.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.log(`❌ Buy execution error for ${crypto.symbol}: ${error}`);
    }
  }
}

export const directTradingExecution = new DirectTradingExecution();