import { storage } from '../storage';
import { telegramService } from './telegramService';
import { InsertTrade } from '@shared/schema';

export class EmaRsiStrategy {
  private broadcastFn: ((data: any) => void) | null = null;

  setBroadcastFunction(fn: (data: any) => void) {
    this.broadcastFn = fn;
  }

  async executeEmaRsiStrategy(userId: number): Promise<void> {
    try {
      const user = await storage.getUser(userId);
      if (!user) return;

      const balance = parseFloat(user.balance);
      console.log(`🎯 EMA-RSI Strategy - Balance: $${balance.toFixed(2)}`);

      // Get all cryptocurrencies
      const cryptos = await storage.getAllCryptocurrencies();
      const portfolio = await storage.getUserPortfolio(userId);

      // Check sell signals for existing positions
      await this.checkSellSignals(userId, portfolio, cryptos);

      // Check buy signals for new positions
      if (balance > 0.5) {
        await this.checkBuySignals(userId, cryptos, balance);
      }

    } catch (error) {
      console.log('EMA-RSI strategy error:', error);
    }
  }

  private async checkSellSignals(userId: number, portfolio: any[], cryptos: any[]): Promise<void> {
    for (const position of portfolio) {
      const crypto = cryptos.find(c => c.id === position.cryptoId);
      if (!crypto) continue;

      const signal = await this.analyzeSymbol(crypto);
      
      if (signal?.signal === 'SELL') {
        const sellAmount = parseFloat(position.amount);
        console.log(`🔴 SELL Signal: ${crypto.symbol} - RSI: ${signal.rsi}, Volume: ${signal.vol_ratio}x`);
        
        await this.executeSellOrder(userId, crypto, sellAmount, `EMA-RSI sell signal - RSI: ${signal.rsi}`);
        
        // Send Telegram notification
        telegramService.sendProfitAlert(signal.profit || 0, crypto.symbol);
      }
    }
  }

  private async checkBuySignals(userId: number, cryptos: any[], balance: number): Promise<void> {
    const opportunities = [];

    for (const crypto of cryptos) {
      const signal = await this.analyzeSymbol(crypto);
      
      if (signal?.signal === 'BUY') {
        opportunities.push({
          crypto,
          signal,
          priority: signal.vol_ratio * (100 - signal.rsi) // Higher volume and lower RSI = higher priority
        });
      }
    }

    // Sort by priority and take top 3
    opportunities.sort((a, b) => b.priority - a.priority);
    
    for (let i = 0; i < Math.min(3, opportunities.length); i++) {
      const opp = opportunities[i];
      const investAmount = Math.min(balance * 0.3, 3.0); // Max 30% of balance or $3
      
      if (investAmount >= 0.5) {
        console.log(`🟢 BUY Signal: ${opp.crypto.symbol} - RSI: ${opp.signal.rsi}, Volume: ${opp.signal.vol_ratio}x`);
        await this.executeBuyOrder(userId, opp.crypto, investAmount, `EMA-RSI buy signal - RSI: ${opp.signal.rsi}`);
      }
    }
  }

  private async analyzeSymbol(crypto: any): Promise<any> {
    try {
      // Get price history for calculations
      const priceHistory = await storage.getPriceHistory(crypto.id, 50);
      if (priceHistory.length < 50) return null;

      const prices = priceHistory.map(p => parseFloat(p.price));
      const volumes = priceHistory.map(p => parseFloat(crypto.volume24h || '0'));

      // Calculate EMA20 and EMA50
      const ema20 = this.calculateEMA(prices, 20);
      const ema50 = this.calculateEMA(prices, 50);
      
      // Calculate RSI
      const rsi = this.calculateRSI(prices, 14);

      if (!ema20 || !ema50 || !rsi) return null;

      const currentPrice = parseFloat(crypto.currentPrice);
      const currentEma20 = ema20[ema20.length - 1];
      const currentEma50 = ema50[ema50.length - 1];
      const prevEma20 = ema20[ema20.length - 2];
      const prevEma50 = ema50[ema50.length - 2];

      // EMA Cross detection
      let emaCross = 'none';
      if (prevEma20 < prevEma50 && currentEma20 > currentEma50) {
        emaCross = 'golden'; // BUY
      } else if (prevEma20 > prevEma50 && currentEma20 < currentEma50) {
        emaCross = 'death'; // SELL
      }

      // RSI status
      let rsiStatus = 'normal';
      if (rsi < 30) {
        rsiStatus = 'oversold';
      } else if (rsi > 70) {
        rsiStatus = 'overbought';
      }

      // Volume filter
      const avgVolume = volumes.slice(-6, -1).reduce((a, b) => a + b, 0) / 5;
      const currentVolume = parseFloat(crypto.volume24h || '0');
      const volRatio = avgVolume > 0 ? currentVolume / avgVolume : 0;

      // Generate signals
      let signal = null;
      if (emaCross === 'golden' && rsiStatus === 'oversold' && volRatio > 1.5) {
        signal = 'BUY';
      } else if (emaCross === 'death' && rsiStatus === 'overbought' && volRatio > 1.5) {
        signal = 'SELL';
      }

      if (signal) {
        return {
          symbol: crypto.symbol,
          signal,
          price: currentPrice,
          rsi: Math.round(rsi * 100) / 100,
          vol_ratio: Math.round(volRatio * 100) / 100,
          ema20: currentEma20,
          ema50: currentEma50
        };
      }

      return null;
    } catch (error) {
      console.log(`Analysis error for ${crypto.symbol}:`, error);
      return null;
    }
  }

  private calculateEMA(prices: number[], period: number): number[] | null {
    if (prices.length < period) return null;

    const k = 2 / (period + 1);
    const ema = [prices[0]];

    for (let i = 1; i < prices.length; i++) {
      ema.push(prices[i] * k + ema[i - 1] * (1 - k));
    }

    return ema;
  }

  private calculateRSI(prices: number[], period: number = 14): number | null {
    if (prices.length < period + 1) return null;

    const changes = [];
    for (let i = 1; i < prices.length; i++) {
      changes.push(prices[i] - prices[i - 1]);
    }

    const gains = changes.map(change => change > 0 ? change : 0);
    const losses = changes.map(change => change < 0 ? -change : 0);

    // Calculate average gains and losses
    let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
    let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

    for (let i = period; i < changes.length; i++) {
      avgGain = (avgGain * (period - 1) + gains[i]) / period;
      avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    }

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
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

      console.log(`✅ BUY: ${crypto.symbol} - $${amount.toFixed(2)} at $${currentPrice.toFixed(6)}`);
      
      this.broadcastFn?.({
        type: 'trade_executed',
        trade: { ...trade, crypto: crypto },
        message: `EMA-RSI buy: ${crypto.symbol} - ${reason}`
      });

      // Update user balance
      const user = await storage.getUser(userId);
      if (user) {
        const newBalance = parseFloat(user.balance) - amount;
        await storage.updateUserBalance(userId, newBalance.toString());
      }

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

      console.log(`✅ SELL: ${crypto.symbol} - ${quantity.toFixed(6)} at $${currentPrice.toFixed(6)} | P&L: $${pnl.toFixed(4)}`);
      
      this.broadcastFn?.({
        type: 'trade_executed',
        trade: { ...trade, crypto: crypto },
        message: `EMA-RSI sell: ${crypto.symbol} - ${reason}`
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

export const emaRsiStrategy = new EmaRsiStrategy();