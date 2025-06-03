import { storage } from '../storage';
import type { InsertTrade } from '@shared/schema';

export class ForcedTradingExecution {
  private broadcastFn: ((data: any) => void) | null = null;

  setBroadcastFunction(fn: (data: any) => void) {
    this.broadcastFn = fn;
  }

  async executeForcedTrades(userId: number): Promise<void> {
    console.log(`🔥 FORCED TRADING EXECUTION - Creating immediate al sat al sat activity`);
    
    const user = await storage.getUser(userId);
    if (!user) return;

    const balance = parseFloat(user.balance);
    const portfolio = await storage.getUserPortfolio(userId);
    
    // Force sell all positions immediately
    for (const position of portfolio) {
      await this.forceSellPosition(userId, position);
    }
    
    // Force buy multiple new positions immediately
    await this.forceBuyMultiplePositions(userId, balance + 2); // Include money from sold positions
  }

  private async forceSellPosition(userId: number, position: any) {
    try {
      const crypto = await storage.getCryptocurrency(position.cryptoId);
      if (!crypto) return;

      const sellAmount = parseFloat(position.amount);
      const currentPrice = parseFloat(crypto.currentPrice);
      const saleValue = sellAmount * currentPrice;

      console.log(`💰 FORCED SELL: ${crypto.symbol} - ${sellAmount.toFixed(6)} coins for $${saleValue.toFixed(2)}`);

      // Execute real Binance trade
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

        // Update balance
        const user = await storage.getUser(userId);
        if (user) {
          const newBalance = parseFloat(user.balance) + saleValue;
          await storage.updateUserBalance(userId, newBalance.toString());
        }

        // Remove from portfolio
        await storage.deletePortfolioItem(userId, crypto.id);

        console.log(`✅ FORCED SELL COMPLETE: ${crypto.symbol} - $${saleValue.toFixed(2)}`);

        if (this.broadcastFn) {
          this.broadcastFn({
            type: 'trade_executed',
            trade: tradeData,
            symbol: crypto.symbol,
            action: 'SELL'
          });
        }
      }
    } catch (error) {
      console.log(`❌ Forced sell failed: ${error}`);
    }
  }

  private async forceBuyMultiplePositions(userId: number, availableBalance: number) {
    try {
      const cryptos = await storage.getAllCryptocurrencies();
      
      // Select 3-4 random cryptos for immediate buying
      const buyTargets = this.selectRandomCryptos(cryptos, 4);
      const investmentPerCoin = Math.min(1.5, availableBalance / buyTargets.length);

      for (const crypto of buyTargets) {
        if (investmentPerCoin >= 0.5) {
          await this.forceBuyPosition(userId, crypto, investmentPerCoin);
          
          // Small delay between buys to create sequential activity
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    } catch (error) {
      console.log(`❌ Forced buy execution failed: ${error}`);
    }
  }

  private async forceBuyPosition(userId: number, crypto: any, investment: number) {
    try {
      const currentPrice = parseFloat(crypto.currentPrice);
      const quantity = investment / currentPrice;

      console.log(`🚀 FORCED BUY: ${crypto.symbol} - $${investment.toFixed(2)} (${quantity.toFixed(6)} coins)`);

      // Execute real Binance trade
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

        // Update balance
        const user = await storage.getUser(userId);
        if (user) {
          const newBalance = parseFloat(user.balance) - investment;
          await storage.updateUserBalance(userId, newBalance.toString());
        }

        // Update portfolio
        await this.updatePortfolioAfterBuy(userId, crypto.id, quantity, currentPrice, investment);

        console.log(`✅ FORCED BUY COMPLETE: ${crypto.symbol} - ${quantity.toFixed(6)} coins`);

        if (this.broadcastFn) {
          this.broadcastFn({
            type: 'trade_executed',
            trade: tradeData,
            symbol: crypto.symbol,
            action: 'BUY'
          });
        }
      }
    } catch (error) {
      console.log(`❌ Forced buy failed: ${error}`);
    }
  }

  private selectRandomCryptos(cryptos: any[], count: number): any[] {
    // Filter for tradeable cryptos and shuffle
    const tradeable = cryptos.filter(c => 
      parseFloat(c.currentPrice) > 0 && 
      parseFloat(c.currentPrice) < 10 // Prefer lower priced coins for more quantity
    );
    
    const shuffled = [...tradeable].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
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
      const portfolioData = {
        userId,
        cryptoId,
        amount: quantity.toString(),
        averagePrice: price.toString(),
        totalInvested: investment.toString()
      };
      await storage.createPortfolioItem(portfolioData);
    }
  }
}

export const forcedTradingExecution = new ForcedTradingExecution();