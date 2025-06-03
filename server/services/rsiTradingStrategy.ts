import { storage } from '../storage';
import type { InsertTrade, InsertPortfolio } from '@shared/schema';

export class RSITradingStrategy {
  private broadcastFn: ((data: any) => void) | null = null;
  private priceHistory: Map<string, number[]> = new Map();
  private positions: Map<string, boolean> = new Map(); // Track if we're in position for each symbol

  setBroadcastFunction(fn: (data: any) => void) {
    this.broadcastFn = fn;
  }

  // Calculate RSI using standard formula (14-period)
  private calculateRSI(prices: number[], period: number = 14): number | null {
    if (prices.length < period + 1) return null;

    let gains = 0;
    let losses = 0;

    // Calculate initial average gain and loss
    for (let i = 1; i <= period; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) {
        gains += change;
      } else {
        losses += Math.abs(change);
      }
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    // Calculate RSI using Wilder's smoothing
    for (let i = period + 1; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      const gain = change > 0 ? change : 0;
      const loss = change < 0 ? Math.abs(change) : 0;

      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  async executeRSIStrategy(userId: number): Promise<void> {
    const user = await storage.getUser(userId);
    if (!user) return;

    const balance = parseFloat(user.balance);
    const portfolio = await storage.getUserPortfolio(userId);
    const cryptos = await storage.getAllCryptocurrencies();

    console.log(`🎯 CLASSIC RSI STRATEGY - Balance: $${balance.toFixed(2)}, Portfolio: ${portfolio.length}`);

    // Update price history for RSI calculation
    this.updatePriceHistory(cryptos);

    // Get available trading pairs
    const { binanceService } = await import('./binanceService');
    const availablePairs = await binanceService.getTradingPairs();
    if (!availablePairs?.length) return;

    const availableSymbols = new Set(availablePairs.map((pair: any) => pair.baseAsset));

    // Process each available cryptocurrency
    for (const crypto of cryptos) {
      if (!availableSymbols.has(crypto.symbol)) continue;

      const prices = this.priceHistory.get(crypto.symbol) || [];
      if (prices.length < 15) continue; // Need enough data for RSI

      const rsi = this.calculateRSI(prices);
      if (rsi === null) continue;

      const currentPrice = parseFloat(crypto.currentPrice);
      const isInPosition = this.positions.get(crypto.symbol) || false;
      const portfolioItem = portfolio.find(p => p.cryptoId === crypto.id);

      console.log(`📊 ${crypto.symbol}: RSI=${rsi.toFixed(1)}, Price=$${currentPrice.toFixed(4)}, InPosition=${isInPosition}`);

      // RSI Strategy Logic (exactly like your Python code)
      if (rsi > 70) {
        // Overbought - SELL if in position
        if (isInPosition && portfolioItem) {
          console.log(`🔴 SELL: ${crypto.symbol} RSI=${rsi.toFixed(1)} > 70 (Overbought)`);
          await this.executeSell(userId, crypto, portfolioItem, currentPrice, rsi);
        }
      } else if (rsi < 30) {
        // Oversold - BUY if not in position and have balance
        if (!isInPosition && balance > 5) {
          console.log(`🟢 BUY: ${crypto.symbol} RSI=${rsi.toFixed(1)} < 30 (Oversold)`);
          await this.executeBuy(userId, crypto, currentPrice, rsi, balance);
        }
      }
    }
  }

  private updatePriceHistory(cryptos: any[]) {
    for (const crypto of cryptos) {
      const price = parseFloat(crypto.currentPrice);
      if (price > 0) {
        const history = this.priceHistory.get(crypto.symbol) || [];
        history.push(price);
        
        // Keep only last 50 prices for RSI calculation
        if (history.length > 50) {
          history.shift();
        }
        
        this.priceHistory.set(crypto.symbol, history);
      }
    }
  }

  private async executeBuy(userId: number, crypto: any, currentPrice: number, rsi: number, balance: number) {
    try {
      // Use $2 per trade to manage risk
      const investment = Math.min(2, balance * 0.2); // Max 20% of balance or $2
      if (investment < 1) return;

      const quantity = investment / currentPrice;

      const { binanceService } = await import('./binanceService');
      const result = await binanceService.executeRealTrade(crypto.symbol, 'BUY', quantity, userId);
      
      if (result.success) {
        console.log(`✅ BOUGHT ${quantity.toFixed(6)} ${crypto.symbol} for $${investment.toFixed(2)}`);

        // Mark as in position
        this.positions.set(crypto.symbol, true);

        // Update portfolio
        const portfolioItem: InsertPortfolio = {
          userId,
          cryptoId: crypto.id,
          amount: quantity.toFixed(6),
          averagePrice: currentPrice.toFixed(6),
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
          price: currentPrice.toFixed(6),
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
              price: currentPrice.toFixed(6),
              total: investment.toFixed(2),
              rsi: rsi.toFixed(1)
            }
          });
        }
      }
    } catch (error) {
      console.log(`❌ Buy failed for ${crypto.symbol}: ${error}`);
    }
  }

  private async executeSell(userId: number, crypto: any, portfolioItem: any, currentPrice: number, rsi: number) {
    try {
      const soldAmount = parseFloat(portfolioItem.amount);
      const sellValue = soldAmount * currentPrice;

      const { binanceService } = await import('./binanceService');
      const result = await binanceService.executeRealTrade(crypto.symbol, 'SELL', soldAmount, userId);
      
      if (result.success) {
        console.log(`✅ SOLD ${soldAmount.toFixed(6)} ${crypto.symbol} for $${sellValue.toFixed(2)}`);

        // Mark as not in position
        this.positions.set(crypto.symbol, false);

        // Update portfolio (remove position)
        await storage.deletePortfolioItem(userId, portfolioItem.cryptoId);

        // Update balance
        const user = await storage.getUser(userId);
        const newBalance = parseFloat(user!.balance) + sellValue;
        await storage.updateUserBalance(userId, newBalance.toFixed(2));

        // Record trade
        const profit = sellValue - parseFloat(portfolioItem.totalInvested);
        const tradeData: InsertTrade = {
          userId,
          cryptoId: portfolioItem.cryptoId,
          type: 'sell',
          amount: soldAmount.toFixed(6),
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
              amount: soldAmount.toFixed(6),
              price: currentPrice.toFixed(6),
              total: sellValue.toFixed(2),
              profit: profit.toFixed(2),
              rsi: rsi.toFixed(1)
            }
          });
        }
      }
    } catch (error) {
      console.log(`❌ Sell failed for ${crypto.symbol}: ${error}`);
    }
  }
}

export const rsiTradingStrategy = new RSITradingStrategy();