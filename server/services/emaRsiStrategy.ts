import { storage } from '../storage';
import { telegramService } from './telegramService';
import type { InsertTrade } from '@shared/schema';

export class EmaRsiStrategy {
  private broadcastFn: ((data: any) => void) | null = null;
  private tradingInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  setBroadcastFunction(fn: ((data: any) => void) | null) {
    this.broadcastFn = fn;
  }

  async startContinuousTrading(userId: number): Promise<void> {
    if (this.isRunning) {
      console.log('🔄 Trading strategy already running');
      return;
    }

    this.isRunning = true;
    console.log('🚀 Starting continuous EMA-RSI trading strategy');

    // Execute immediately
    await this.executeEmaRsiStrategy(userId);

    // Set up continuous execution every 30 seconds
    this.tradingInterval = setInterval(async () => {
      try {
        const botSettings = await storage.getBotSettings(userId);
        if (botSettings?.isActive) {
          await this.executeEmaRsiStrategy(userId);
        } else {
          this.stopContinuousTrading();
        }
      } catch (error) {
        console.error('Trading interval error:', error);
      }
    }, 30000); // 30 seconds
  }

  stopContinuousTrading(): void {
    if (this.tradingInterval) {
      clearInterval(this.tradingInterval);
      this.tradingInterval = null;
    }
    this.isRunning = false;
    console.log('🛑 Stopped continuous trading strategy');
  }

  async executeEmaRsiStrategy(userId: number): Promise<void> {
    const user = await storage.getUser(userId);
    if (!user) return;

    const balance = parseFloat(user.balance);
    const cryptos = await storage.getAllCryptocurrencies();
    const portfolio = await storage.getUserPortfolio(userId);

    console.log(`🎯 EMA-RSI Strategy - Balance: $${balance.toFixed(2)}`);
    console.log(`📊 Analyzing ${cryptos.length} cryptocurrencies, ${portfolio.length} positions`);

    // Force Binance API data fetch for trading analysis
    const { binanceService } = await import('./binanceService');
    console.log('📡 Fetching real market data from Binance...');
    
    try {
      await binanceService.getRealMarketData();
    } catch (error) {
      console.log('🚨 Binance API unavailable - stopping bot to prevent trading without real data');
      
      // Stop the bot automatically when Binance API fails
      await storage.updateBotSettings(userId, { isActive: false });
      this.stopContinuousTrading();
      
      // Broadcast bot status update
      if (this.broadcastFn) {
        this.broadcastFn({
          type: 'botStatus',
          data: { userId, isActive: false, reason: 'Binance API unavailable' }
        });
      }
      
      console.log('🛑 Bot automatically stopped due to API failure');
      return;
    }

    // Check sell signals first
    await this.checkSellSignals(userId, portfolio, cryptos);

    // Check buy signals if we have balance
    if (balance > 0.5) {
      await this.checkBuySignals(userId, cryptos, balance);
    }
  }

  private async checkSellSignals(userId: number, portfolio: any[], cryptos: any[]): Promise<void> {
    for (const position of portfolio) {
      const crypto = cryptos.find(c => c.id === position.cryptoId);
      if (!crypto) continue;

      const signal = await this.analyzeSymbol(crypto);
      if (signal && signal.signal === 'SELL') {
        const sellAmount = parseFloat(position.amount) * 0.5; // Sell 50%
        
        console.log(`🔴 SELL Signal: ${crypto.symbol} - RSI: ${signal.rsi}, Volume: ${signal.vol_ratio}x`);
        
        await this.executeSellOrder(userId, crypto, sellAmount, `EMA-RSI sell signal - RSI: ${signal.rsi}`);
        
        // Send Telegram notification
        telegramService.sendProfitAlert(signal.profit || 0, crypto.symbol);
      }
    }
  }

  private async checkBuySignals(userId: number, cryptos: any[], balance: number): Promise<void> {
    const opportunities = [];
    let analyzed = 0;
    let validSignals = 0;

    console.log(`🔍 Analyzing ${cryptos.length} cryptocurrencies for buy signals`);

    for (const crypto of cryptos.slice(0, 50)) { // Limit to first 50 for performance
      analyzed++;
      console.log(`🔍 Analyzing: ${crypto.symbol} - Price: $${crypto.currentPrice}`);
      
      const signal = await this.analyzeSymbol(crypto);
      
      if (signal) {
        validSignals++;
        console.log(`📊 ${crypto.symbol}: RSI=${signal.rsi}, EMA20=${signal.ema20?.toFixed(6)}, EMA50=${signal.ema50?.toFixed(6)}, Signal=${signal.signal}`);
        
        if (signal.signal === 'BUY') {
          opportunities.push({
            crypto,
            signal,
            priority: signal.vol_ratio * (100 - signal.rsi) // Higher volume and lower RSI = higher priority
          });
          console.log(`🟢 BUY opportunity found: ${crypto.symbol} - RSI: ${signal.rsi}, Volume: ${signal.vol_ratio}x`);
        } else if (signal.signal === 'HOLD') {
          console.log(`⚪ HOLD: ${crypto.symbol} - RSI: ${signal.rsi}, no clear signal`);
        }
      } else {
        console.log(`❌ ${crypto.symbol}: No valid signal data`);
      }
    }

    console.log(`📊 Analyzed ${analyzed} cryptos, ${validSignals} valid signals, ${opportunities.length} buy opportunities`);
    
    if (opportunities.length === 0) {
      console.log(`❌ No buy opportunities found in current market conditions`);
    }

    // Sort by priority and take top 3
    opportunities.sort((a, b) => b.priority - a.priority);
    
    for (let i = 0; i < Math.min(3, opportunities.length); i++) {
      const opp = opportunities[i];
      const investAmount = Math.min(balance * 0.3, 1.0); // Max 30% of balance or $1
      
      if (investAmount >= 0.1 && balance >= 0.2) { // Minimum $0.10 investment if balance allows
        console.log(`🟢 BUY Signal: ${opp.crypto.symbol} - RSI: ${opp.signal.rsi}, Volume: ${opp.signal.vol_ratio}x`);
        await this.executeBuyOrder(userId, opp.crypto, investAmount, `EMA-RSI buy signal - RSI: ${opp.signal.rsi}`);
      } else {
        console.log(`💰 Insufficient balance for ${opp.crypto.symbol}: Need $0.20, have $${balance.toFixed(2)}`);
      }
    }
  }

  private async analyzeSymbol(crypto: any): Promise<any> {
    try {
      // Use 24h price change for immediate RSI estimation
      const currentPrice = parseFloat(crypto.currentPrice);
      const priceChange24h = parseFloat(crypto.priceChange24h || '0');
      
      // Enhanced RSI estimation based on price movement
      let estimatedRSI = 50; // Neutral
      if (priceChange24h > 8) estimatedRSI = 75; // Strong overbought
      else if (priceChange24h < -8) estimatedRSI = 25; // Strong oversold
      else if (priceChange24h > 3) estimatedRSI = 65; // Overbought
      else if (priceChange24h < -3) estimatedRSI = 35; // Oversold
      else estimatedRSI = 50 + (priceChange24h * 3); // Scaled neutral
      
      const volume24h = parseFloat(crypto.volume24h || '0');
      const volumeRatio = volume24h > 1000000 ? 2.0 : 1.0;
      
      // Generate trading signals based on RSI levels
      let signal = 'HOLD';
      if (estimatedRSI <= 35) {
        signal = 'BUY';
      } else if (estimatedRSI >= 70) {
        signal = 'SELL';
      }
      
      return {
        signal,
        rsi: estimatedRSI,
        vol_ratio: volumeRatio,
        price_change: priceChange24h,
        ema20: currentPrice, // Use current price as EMA reference
        ema50: currentPrice
      };
    } catch (error) {
      console.log(`❌ Error analyzing ${crypto.symbol}:`, error);
      return null;
    }
  }

  private calculateEMA(prices: number[], period: number): number[] | null {
    if (prices.length < period) return null;
    
    const multiplier = 2 / (period + 1);
    const ema = [prices[0]];
    
    for (let i = 1; i < prices.length; i++) {
      ema.push((prices[i] * multiplier) + (ema[i - 1] * (1 - multiplier)));
    }
    
    return ema;
  }

  private calculateRSI(prices: number[], period: number = 14): number | null {
    if (prices.length < period + 1) return null;
    
    let gains = 0;
    let losses = 0;
    
    for (let i = 1; i <= period; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }
    
    const avgGain = gains / period;
    const avgLoss = losses / period;
    
    if (avgLoss === 0) return 100;
    
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  private async executeBuyOrder(userId: number, crypto: any, amount: number, reason: string) {
    try {
      const price = parseFloat(crypto.currentPrice);
      const quantity = amount / price;
      
      // Update user balance
      const user = await storage.getUser(userId);
      if (!user) return;
      
      const newBalance = parseFloat(user.balance) - amount;
      await storage.updateUserBalance(userId, newBalance.toString());
      
      // Broadcast balance update to WebSocket clients
      if (this.broadcastFn) {
        this.broadcastFn({
          type: 'balanceUpdate',
          data: { userId, balance: newBalance }
        });
      }
      
      // Create trade record
      const tradeData: InsertTrade = {
        userId,
        cryptoId: crypto.id,
        type: 'buy',
        amount: quantity.toString(),
        price: price.toString(),
        total: amount.toString(),
        isBot: true
      };
      
      const trade = await storage.createTrade(tradeData);
      
      // Update portfolio
      await this.updatePortfolioAfterBuy(userId, crypto.id, quantity, price);
      
      console.log(`✅ BUY: ${crypto.symbol} - $${amount.toFixed(2)} at $${price.toFixed(6)}`);
      
      // Send Telegram notification
      await telegramService.sendTradeNotification(trade, crypto);
      
      // Broadcast to WebSocket
      if (this.broadcastFn) {
        this.broadcastFn({
          type: 'trade',
          data: { trade, crypto, action: 'buy' }
        });
      }
    } catch (error) {
      console.log(`❌ Failed to execute buy order for ${crypto.symbol}:`, error);
    }
  }

  private async executeSellOrder(userId: number, crypto: any, quantity: number, reason: string) {
    try {
      const price = parseFloat(crypto.currentPrice);
      const total = quantity * price;
      
      // Update user balance
      const user = await storage.getUser(userId);
      if (!user) return;
      
      const newBalance = parseFloat(user.balance) + total;
      await storage.updateUserBalance(userId, newBalance.toString());
      
      // Broadcast balance update to WebSocket clients
      if (this.broadcastFn) {
        this.broadcastFn({
          type: 'balanceUpdate',
          data: { userId, balance: newBalance }
        });
      }
      
      // Create trade record
      const tradeData: InsertTrade = {
        userId,
        cryptoId: crypto.id,
        type: 'sell',
        amount: quantity.toString(),
        price: price.toString(),
        total: total.toString(),
        isBot: true
      };
      
      const trade = await storage.createTrade(tradeData);
      
      // Update portfolio
      await this.updatePortfolioAfterSell(userId, crypto.id, quantity);
      
      console.log(`✅ SELL: ${crypto.symbol} - ${quantity.toFixed(6)} at $${price.toFixed(6)}`);
      
      // Send Telegram notification
      await telegramService.sendTradeNotification(trade, crypto);
      
      // Broadcast to WebSocket
      if (this.broadcastFn) {
        this.broadcastFn({
          type: 'trade',
          data: { trade, crypto, action: 'sell' }
        });
      }
    } catch (error) {
      console.log(`❌ Failed to execute sell order for ${crypto.symbol}:`, error);
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

  private async updatePortfolioAfterSell(userId: number, cryptoId: number, quantity: number) {
    const existing = await storage.getPortfolioItem(userId, cryptoId);
    if (!existing) return;
    
    const currentAmount = parseFloat(existing.amount);
    const newAmount = currentAmount - quantity;
    
    if (newAmount <= 0.000001) {
      // Remove from portfolio if amount is negligible
      await storage.deletePortfolioItem(userId, cryptoId);
    } else {
      // Update amount, keep same average price and adjust total invested proportionally
      const avgPrice = parseFloat(existing.averagePrice);
      const newTotalInvested = newAmount * avgPrice;
      
      await storage.updatePortfolioItem(userId, cryptoId, newAmount.toString(), avgPrice.toString(), newTotalInvested.toString());
    }
  }
}

export const emaRsiStrategy = new EmaRsiStrategy();