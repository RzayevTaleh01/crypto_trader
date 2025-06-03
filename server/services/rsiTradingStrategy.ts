import { storage } from '../storage';
import type { InsertTrade, InsertPortfolio } from '@shared/schema';

export class RSITradingStrategy {
  private broadcastFn: ((data: any) => void) | null = null;

  setBroadcastFunction(fn: (data: any) => void) {
    this.broadcastFn = fn;
  }

  async executeRSIStrategy(userId: number): Promise<void> {
    const user = await storage.getUser(userId);
    if (!user) return;

    const balance = parseFloat(user.balance);
    const portfolio = await storage.getUserPortfolio(userId);
    const cryptos = await storage.getAllCryptocurrencies();

    console.log(`🎯 AGGRESSIVE RSI STRATEGY - Balance: $${balance.toFixed(2)}, Portfolio: ${portfolio.length}`);

    // STEP 1: Sell immediately on ANY price rise
    await this.sellOnAnyRise(userId, portfolio, cryptos);

    // STEP 2: Buy aggressively on ANY price drop  
    if (balance > 5) {
      await this.buyOnAnyDrop(userId, cryptos, balance);
    }
  }

  private async sellOnAnyRise(userId: number, portfolio: any[], cryptos: any[]) {
    console.log(`🔥 INSTANT SELL CHECK: ${portfolio.length} positions`);
    
    for (const position of portfolio) {
      try {
        const crypto = cryptos.find(c => c.id === position.cryptoId);
        if (!crypto) continue;

        const currentPrice = parseFloat(crypto.currentPrice);
        const averagePrice = parseFloat(position.averagePrice);
        const priceChange = ((currentPrice - averagePrice) / averagePrice) * 100;

        console.log(`📊 ${crypto.symbol}: ${priceChange > 0 ? '+' : ''}${priceChange.toFixed(2)}%`);

        // Sell immediately on ANY price increase
        if (priceChange > 0.05) {
          await this.executeSell(userId, position, crypto, currentPrice, priceChange);
        }
      } catch (error) {
        console.log(`❌ Sell check failed: ${error}`);
      }
    }
  }

  private async buyOnAnyDrop(userId: number, cryptos: any[], balance: number) {
    console.log(`💰 AGGRESSIVE BUY SCAN: $${balance.toFixed(2)} available`);

    // Get tradeable pairs
    const { binanceService } = await import('./binanceService');
    const availablePairs = await binanceService.getTradingPairs();
    if (!availablePairs?.length) return;

    const availableSymbols = new Set(availablePairs.map((pair: any) => pair.baseAsset));
    
    // Find ANY drops
    const dropOpportunities = [];
    for (const crypto of cryptos) {
      if (!availableSymbols.has(crypto.symbol)) continue;
      
      const price = parseFloat(crypto.currentPrice);
      const change24h = parseFloat(crypto.priceChange24h);
      
      if (price <= 0 || change24h >= 0) continue;
      
      // Buy on ANY drop (even -0.5%)
      if (change24h <= -0.5) {
        dropOpportunities.push({
          ...crypto,
          price,
          change24h,
          score: Math.abs(change24h) * (price > 0.01 ? 1 : 0.5) // Prefer higher priced coins
        });
      }
    }

    if (dropOpportunities.length === 0) {
      console.log(`⚠️ No drops found`);
      return;
    }

    // Sort by biggest drops
    dropOpportunities.sort((a, b) => b.score - a.score);
    const topDrops = dropOpportunities.slice(0, 3);

    console.log(`🎯 Found ${topDrops.length} drops:`);
    topDrops.forEach(drop => {
      console.log(`💎 ${drop.symbol}: ${drop.change24h.toFixed(2)}%`);
    });

    // Buy with all available balance divided among top drops
    const investmentPerDrop = balance / topDrops.length;
    if (investmentPerDrop < 5) return;

    for (const drop of topDrops) {
      await this.executeBuy(userId, drop, investmentPerDrop);
    }
  }

  private async executeSell(userId: number, position: any, crypto: any, currentPrice: number, priceChange: number) {
    try {
      const soldAmount = parseFloat(position.amount);
      const sellValue = soldAmount * currentPrice;

      console.log(`🔥 SELLING ${crypto.symbol}: +${priceChange.toFixed(2)}% = $${sellValue.toFixed(2)}`);

      const { binanceService } = await import('./binanceService');
      const result = await binanceService.executeRealTrade(crypto.symbol, 'SELL', soldAmount, userId);
      
      if (result.success) {
        console.log(`✅ SOLD ${soldAmount.toFixed(6)} ${crypto.symbol}`);

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
          amount: soldAmount.toFixed(6),
          price: currentPrice.toFixed(6),
          total: sellValue.toFixed(2),
          strategy: `Quick Sell +${priceChange.toFixed(2)}%`,
          profit: profit.toFixed(2)
        };
        await storage.createTrade(tradeData);

        // Broadcast
        if (this.broadcastFn) {
          this.broadcastFn({
            type: 'trade_executed',
            trade: {
              symbol: crypto.symbol,
              type: 'SELL',
              amount: soldAmount.toFixed(6),
              price: currentPrice.toFixed(6),
              total: sellValue.toFixed(2),
              profit: profit.toFixed(2)
            }
          });
        }
      }
    } catch (error) {
      console.log(`❌ Sell failed for ${crypto.symbol}: ${error}`);
    }
  }

  private async executeBuy(userId: number, crypto: any, investment: number) {
    try {
      // Check if already holding
      const existing = await storage.getPortfolioItem(userId, crypto.id);
      if (existing) return;

      const quantity = investment / crypto.price;

      console.log(`🟢 BUYING ${crypto.symbol}: ${crypto.change24h.toFixed(2)}% drop = $${investment.toFixed(2)}`);

      const { binanceService } = await import('./binanceService');
      const result = await binanceService.executeRealTrade(crypto.symbol, 'BUY', quantity, userId);
      
      if (result.success) {
        console.log(`✅ BOUGHT ${quantity.toFixed(6)} ${crypto.symbol}`);

        // Update portfolio
        const portfolioItem: InsertPortfolio = {
          userId,
          cryptoId: crypto.id,
          amount: quantity.toFixed(6),
          averagePrice: crypto.price.toFixed(6),
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
          price: crypto.price.toFixed(6),
          total: investment.toFixed(2),
          strategy: `Dip Buy ${crypto.change24h.toFixed(2)}%`,
          profit: '0.00'
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
              price: crypto.price.toFixed(6),
              total: investment.toFixed(2),
              profit: '0.00'
            }
          });
        }
      }
    } catch (error) {
      console.log(`❌ Buy failed for ${crypto.symbol}: ${error}`);
    }
  }
}

export const rsiTradingStrategy = new RSITradingStrategy();