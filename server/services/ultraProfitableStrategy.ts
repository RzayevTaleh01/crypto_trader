import { storage } from '../storage';
import { binanceService } from './binanceService';
import { telegramService } from './telegramService';
import { InsertTrade } from '@shared/schema';

export class UltraProfitableStrategy {
  private broadcastFn: ((data: any) => void) | null = null;
  private lastProfitCheck = new Map<string, number>();
  private profitTargets = new Map<string, number>();

  setBroadcastFunction(fn: (data: any) => void) {
    this.broadcastFn = fn;
  }

  async executeUltraProfitStrategy(userId: number): Promise<void> {
    try {
      const user = await storage.getUser(userId);
      if (!user) return;

      const balance = parseFloat(user.balance);
      if (balance < 0.5) {
        console.log('⚠️ Balance too low for ultra profit strategy');
        return;
      }

      console.log(`🚀 ULTRA PROFIT STRATEGY - Balance: $${balance.toFixed(2)}`);
      
      // Get all available cryptocurrencies
      const cryptos = await storage.getAllCryptocurrencies();
      const portfolio = await storage.getUserPortfolio(userId);

      // First, sell any losing positions immediately to cut losses
      await this.cutLosses(userId, portfolio, cryptos);

      // Find the most profitable opportunities
      const opportunities = await this.findUltraProfitOpportunities(cryptos, balance);
      
      if (opportunities.length > 0) {
        // Execute the most profitable trade
        const bestOpportunity = opportunities[0];
        await this.executeUltraProfitTrade(userId, bestOpportunity, balance);
      }

      // Check existing positions for quick profit taking
      await this.takeQuickProfits(userId, portfolio, cryptos);

    } catch (error) {
      console.log('Ultra profit strategy error:', error);
    }
  }

  private async cutLosses(userId: number, portfolio: any[], cryptos: any[]): Promise<void> {
    for (const position of portfolio) {
      const crypto = cryptos.find(c => c.id === position.cryptoId);
      if (!crypto) continue;

      const currentPrice = parseFloat(crypto.currentPrice);
      const avgPrice = parseFloat(position.averagePrice);
      const lossPercent = ((currentPrice - avgPrice) / avgPrice) * 100;

      // Cut losses immediately if losing more than 1%
      if (lossPercent < -1.0) {
        const sellAmount = parseFloat(position.amount);
        console.log(`🔥 CUTTING LOSS: ${crypto.symbol} at ${lossPercent.toFixed(2)}% loss`);
        
        await this.executeSellOrder(userId, crypto, sellAmount, `Loss cut at ${lossPercent.toFixed(2)}%`);
      }
    }
  }

  private async findUltraProfitOpportunities(cryptos: any[], balance: number): Promise<any[]> {
    const opportunities = [];

    for (const crypto of cryptos) {
      const symbol = crypto.symbol;
      const currentPrice = parseFloat(crypto.currentPrice);
      const priceChange24h = parseFloat(crypto.priceChange24h || '0');

      // Look for strong momentum opportunities
      if (Math.abs(priceChange24h) > 5) {
        const profitPotential = this.calculateProfitPotential(crypto);
        
        if (profitPotential > 2) { // At least 2% profit potential
          opportunities.push({
            crypto,
            profitPotential,
            momentum: priceChange24h,
            priority: profitPotential * Math.abs(priceChange24h)
          });
        }
      }
    }

    // Sort by priority (highest profit potential first)
    return opportunities.sort((a, b) => b.priority - a.priority).slice(0, 3);
  }

  private calculateProfitPotential(crypto: any): number {
    const priceChange24h = parseFloat(crypto.priceChange24h || '0');
    const currentPrice = parseFloat(crypto.currentPrice);
    
    // Calculate volatility-based profit potential
    const volatility = Math.abs(priceChange24h);
    
    if (volatility > 10) return 5; // Very high profit potential
    if (volatility > 7) return 4;
    if (volatility > 5) return 3;
    if (volatility > 3) return 2;
    return 1;
  }

  private async executeUltraProfitTrade(userId: number, opportunity: any, balance: number): Promise<void> {
    const crypto = opportunity.crypto;
    const investAmount = Math.min(balance * 0.4, 4.0); // Invest up to 40% or $4
    
    if (investAmount < 0.5) return;

    console.log(`💰 ULTRA PROFIT BUY: ${crypto.symbol} - $${investAmount.toFixed(2)} - Potential: ${opportunity.profitPotential}%`);
    
    const currentPrice = parseFloat(crypto.currentPrice);
    const quantity = investAmount / currentPrice;

    // Set aggressive profit target
    this.profitTargets.set(crypto.symbol, opportunity.profitPotential);

    await this.executeBuyOrder(userId, crypto, investAmount, `Ultra profit strategy - ${opportunity.profitPotential}% target`);
  }

  private async takeQuickProfits(userId: number, portfolio: any[], cryptos: any[]): Promise<void> {
    for (const position of portfolio) {
      const crypto = cryptos.find(c => c.id === position.cryptoId);
      if (!crypto) continue;

      const currentPrice = parseFloat(crypto.currentPrice);
      const avgPrice = parseFloat(position.averagePrice);
      const profitPercent = ((currentPrice - avgPrice) / avgPrice) * 100;

      const target = this.profitTargets.get(crypto.symbol) || 1.5;

      // Take profit if target reached or any profit after 30 seconds
      if (profitPercent >= target || (profitPercent > 0.3 && this.shouldTakeQuickProfit(crypto.symbol))) {
        const sellAmount = parseFloat(position.amount);
        console.log(`🎯 TAKING PROFIT: ${crypto.symbol} at ${profitPercent.toFixed(2)}% profit`);
        
        await this.executeSellOrder(userId, crypto, sellAmount, `Profit taking at ${profitPercent.toFixed(2)}%`);
        
        // Send Telegram notification
        telegramService.sendProfitAlert(
          (currentPrice - avgPrice) * sellAmount,
          crypto.symbol
        );
      }
    }
  }

  private shouldTakeQuickProfit(symbol: string): boolean {
    const lastCheck = this.lastProfitCheck.get(symbol) || 0;
    const now = Date.now();
    
    if (now - lastCheck > 30000) { // 30 seconds
      this.lastProfitCheck.set(symbol, now);
      return true;
    }
    return false;
  }

  private async executeBuyOrder(userId: number, crypto: any, amount: number, reason: string) {
    try {
      const currentPrice = parseFloat(crypto.currentPrice);
      const quantity = amount / currentPrice;

      const tradeData: InsertTrade = {
        userId,
        cryptoId: crypto.id,
        type: 'buy',
        amount: quantity.toString(),
        price: currentPrice.toString(),
        total: amount.toString(),
        isBot: true,
        pnl: '0'
      };

      const trade = await storage.createTrade(tradeData);
      await this.updatePortfolioAfterBuy(userId, crypto.id, quantity, currentPrice);

      console.log(`✅ ULTRA BUY: ${crypto.symbol} - $${amount.toFixed(2)} at $${currentPrice.toFixed(6)}`);
      
      this.broadcastFn?.({
        type: 'trade_executed',
        trade: { ...trade, crypto: crypto },
        message: `Ultra profit buy: ${crypto.symbol} - ${reason}`
      });

    } catch (error) {
      console.log(`❌ Buy order failed for ${crypto.symbol}:`, error);
    }
  }

  private async executeSellOrder(userId: number, crypto: any, quantity: number, reason: string) {
    try {
      const currentPrice = parseFloat(crypto.currentPrice);
      const total = quantity * currentPrice;

      const portfolioItem = await storage.getPortfolioItem(userId, crypto.id);
      const avgPrice = portfolioItem ? parseFloat(portfolioItem.averagePrice) : currentPrice;
      const pnl = (currentPrice - avgPrice) * quantity;

      const tradeData: InsertTrade = {
        userId,
        cryptoId: crypto.id,
        type: 'sell',
        amount: quantity.toString(),
        price: currentPrice.toString(),
        total: total.toString(),
        isBot: true,
        pnl: pnl.toString()
      };

      const trade = await storage.createTrade(tradeData);
      await this.updatePortfolioAfterSell(userId, crypto.id, quantity);

      console.log(`✅ ULTRA SELL: ${crypto.symbol} - ${quantity.toFixed(6)} at $${currentPrice.toFixed(6)} | P&L: $${pnl.toFixed(4)}`);
      
      this.broadcastFn?.({
        type: 'trade_executed',
        trade: { ...trade, crypto: crypto },
        message: `Ultra profit sell: ${crypto.symbol} - ${reason}`
      });

      // Update user balance
      const user = await storage.getUser(userId);
      if (user) {
        const newBalance = parseFloat(user.balance) + total;
        await storage.updateUserBalance(userId, newBalance.toString());
      }

    } catch (error) {
      console.log(`❌ Sell order failed for ${crypto.symbol}:`, error);
    }
  }

  private async updatePortfolioAfterBuy(userId: number, cryptoId: number, quantity: number, price: number) {
    const existingItem = await storage.getPortfolioItem(userId, cryptoId);
    
    if (existingItem) {
      const currentAmount = parseFloat(existingItem.amount);
      const currentInvested = parseFloat(existingItem.totalInvested);
      const newAmount = currentAmount + quantity;
      const newInvested = currentInvested + (quantity * price);
      const newAvgPrice = newInvested / newAmount;

      await storage.updatePortfolioItem(
        userId,
        cryptoId,
        newAmount.toString(),
        newAvgPrice.toString(),
        newInvested.toString()
      );
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

  private async updatePortfolioAfterSell(userId: number, cryptoId: number, quantity: number) {
    const portfolioItem = await storage.getPortfolioItem(userId, cryptoId);
    if (!portfolioItem) return;

    const currentAmount = parseFloat(portfolioItem.amount);
    const newAmount = currentAmount - quantity;

    if (newAmount <= 0.000001) {
      await storage.deletePortfolioItem(userId, cryptoId);
    } else {
      const currentInvested = parseFloat(portfolioItem.totalInvested);
      const avgPrice = parseFloat(portfolioItem.averagePrice);
      const soldValue = quantity * avgPrice;
      const newInvested = currentInvested - soldValue;

      await storage.updatePortfolioItem(
        userId,
        cryptoId,
        newAmount.toString(),
        avgPrice.toString(),
        newInvested.toString()
      );
    }
  }
}

export const ultraProfitableStrategy = new UltraProfitableStrategy();