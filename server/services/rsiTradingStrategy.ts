import { storage } from '../storage';
import { InsertTrade } from '@shared/schema';
import { telegramService } from './telegramService';

export class RSITradingStrategy {
  private broadcastFn: ((data: any) => void) | null = null;

  setBroadcastFunction(fn: (data: any) => void) {
    this.broadcastFn = fn;
  }

  private calculateRSI(prices: number[], period: number = 14): number | null {
    if (prices.length < period + 1) return null;

    const gains: number[] = [];
    const losses: number[] = [];

    for (let i = 1; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      gains.push(change > 0 ? change : 0);
      losses.push(change < 0 ? -change : 0);
    }

    const avgGain = gains.slice(-period).reduce((a, b) => a + b, 0) / period;
    const avgLoss = losses.slice(-period).reduce((a, b) => a + b, 0) / period;

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  private async getRealPriceHistory(symbol: string): Promise<number[]> {
    try {
      const { binanceService } = await import('./binanceService');
      return await binanceService.getKlineData(symbol, '1h', 21);
    } catch (error) {
      console.log(`Failed to get real price data for ${symbol}:`, error);
      return [];
    }
  }

  async executeRSIStrategy(userId: number): Promise<void> {
    const user = await storage.getUser(userId);
    if (!user) return;

    const balance = parseFloat(user.balance);
    const portfolio = await storage.getUserPortfolio(userId);
    const cryptos = await storage.getAllCryptocurrencies();

    console.log(`📊 Executing RSI Strategy - Balance: $${balance.toFixed(2)}, Cryptos: ${cryptos.length}, Portfolio: ${portfolio.length}`);

    // Step 1: Quick profit taking on existing positions (minimum 5 cent gains)
    if (portfolio.length > 0) {
      await this.sellProfitablePositions(userId, portfolio, cryptos);
    }

    // Step 2: Buy high-momentum coins for short-term gains
    if (balance > 1) {
      await this.buyHighMomentumCoins(userId, cryptos, balance);
    }
  }

  private async sellProfitablePositions(userId: number, portfolio: any[], cryptos: any[]) {
    console.log(`🔍 RSI SELL CHECK: Analyzing ${portfolio.length} portfolio positions for profit opportunities...`);

    for (const position of portfolio) {
      const crypto = cryptos.find(c => c.id === position.cryptoId);
      if (!crypto) continue;

      const amount = parseFloat(position.amount);
      const avgPrice = parseFloat(position.averagePrice);
      const currentPrice = parseFloat(crypto.currentPrice);
      const investedValue = amount * avgPrice;
      const currentValue = amount * currentPrice;
      const absoluteProfit = currentValue - investedValue;

      console.log(`💰 ${crypto.symbol}: Profit: $${absoluteProfit.toFixed(3)}, Price: $${currentPrice.toFixed(6)} vs Avg: $${avgPrice.toFixed(6)}`);

      // Quick profit taking - sell on minimum 5 cent gains
      if (absoluteProfit >= 0.05) {
        console.log(`💎 QUICK PROFIT: ${crypto.symbol} - Profit: $${absoluteProfit.toFixed(3)} (≥5¢)`);
        
        const sellAmount = amount * 0.7; // Sell 70% of position
        const totalValue = sellAmount * currentPrice;
        const profit = (currentPrice - avgPrice) * sellAmount;

        console.log(`🔴 RSI SELL: ${sellAmount.toFixed(6)} ${crypto.symbol} - Quick Profit: $${profit.toFixed(3)}`);

        try {
          const { binanceService } = await import('./binanceService');
          const result = await binanceService.executeRealTrade(crypto.symbol, 'SELL', sellAmount, userId);
          
          if (result.success) {
            console.log(`🎯 BINANCE SELL EXECUTED: ${sellAmount.toFixed(6)} ${crypto.symbol}`);
            await this.updatePortfolioAfterSell(userId, position.cryptoId, sellAmount);
          } else {
            console.log(`❌ Binance trade failed: ${result.message}`);
            const tradeData: InsertTrade = {
              userId,
              cryptoId: position.cryptoId,
              type: 'sell',
              amount: sellAmount.toString(),
              price: currentPrice.toString(),
              total: totalValue.toString(),
              isBot: true
            };
            await storage.createTrade(tradeData);
            await this.updatePortfolioAfterSell(userId, position.cryptoId, sellAmount);
          }
        } catch (error) {
          console.log(`❌ Binance API error, using database trade:`, error);
          const tradeData: InsertTrade = {
            userId,
            cryptoId: position.cryptoId,
            type: 'sell',
            amount: sellAmount.toString(),
            price: currentPrice.toString(),
            total: totalValue.toString(),
            isBot: true
          };
          await storage.createTrade(tradeData);
          await this.updatePortfolioAfterSell(userId, position.cryptoId, sellAmount);
        }

        // Update balance
        const updatedUser = await storage.getUser(userId);
        if (updatedUser) {
          const newBalance = parseFloat(updatedUser.balance) + totalValue;
          await storage.updateUserBalance(userId, newBalance.toString());
        }

        if (this.broadcastFn) {
          this.broadcastFn({
            type: 'trade',
            data: {
              action: 'sell',
              symbol: crypto.symbol,
              amount: sellAmount.toFixed(6),
              price: currentPrice.toFixed(6),
              total: totalValue.toFixed(2),
              strategy: `Quick Profit: $${profit.toFixed(3)}`,
              profit: profit.toFixed(2)
            }
          });
        }

        try {
          const tradeData: InsertTrade = {
            userId,
            cryptoId: position.cryptoId,
            type: 'sell',
            amount: sellAmount.toString(),
            price: currentPrice.toString(),
            total: totalValue.toString(),
            isBot: true
          };
          await telegramService.sendTradeNotification(tradeData, crypto, position);
        } catch (error) {
          console.log('Telegram notification error:', error);
        }
      }
    }
  }

  private async buyHighMomentumCoins(userId: number, cryptos: any[], balance: number) {
    if (balance < 3) return; // Need at least $3 to make a meaningful trade

    console.log(`🎯 ULTRA-CONSERVATIVE STRATEGY: Finding THE BEST single opportunity from $${balance.toFixed(2)}...`);

    // Check current portfolio to avoid over-diversification
    const currentPortfolio = await storage.getUserPortfolio(userId);
    if (currentPortfolio.length >= 1) {
      console.log(`⚠️ Already holding ${currentPortfolio.length} position(s). No new purchases to maintain focus.`);
      return;
    }

    // Focus only on the most reliable major cryptocurrencies
    const majorCoins = ['BTC', 'ETH', 'BNB', 'SOL'];
    
    // Find the absolute best opportunity
    const bestOpportunity = cryptos
      .filter(crypto => {
        const price = parseFloat(crypto.currentPrice);
        const change24h = parseFloat(crypto.priceChange24h);
        return majorCoins.includes(crypto.symbol) && price > 0 && change24h > 1;
      })
      .map(crypto => ({
        ...crypto,
        price: parseFloat(crypto.currentPrice),
        change24h: parseFloat(crypto.priceChange24h),
        profitScore: this.calculateProfitabilityScore(crypto, parseFloat(crypto.currentPrice), parseFloat(crypto.priceChange24h), parseFloat(crypto.volume24h) || 0)
      }))
      .sort((a, b) => b.profitScore - a.profitScore)[0]; // Only THE BEST one

    if (!bestOpportunity) {
      console.log(`⚠️ No profitable opportunities found in major coins`);
      return;
    }

    console.log(`💎 BEST OPPORTUNITY: ${bestOpportunity.symbol} - Gain: ${bestOpportunity.change24h.toFixed(2)}%, Score: ${bestOpportunity.profitScore.toFixed(2)}`);

    // Only invest maximum $5 to keep $5 in reserve
    const maxInvestment = Math.min(5, balance * 0.5);
    const currentPrice = bestOpportunity.price;
    const quantity = maxInvestment / currentPrice;

    try {
      console.log(`🟢 STRATEGIC BUY: ${bestOpportunity.symbol} - Gain: ${bestOpportunity.change24h.toFixed(2)}%, Invest: $${maxInvestment.toFixed(2)}`);
      
      const { binanceService } = await import('./binanceService');
      const result = await binanceService.executeRealTrade(bestOpportunity.symbol, 'BUY', quantity, userId);
      
      if (result.success) {
        console.log(`🎯 BINANCE STRATEGIC BUY: ${quantity.toFixed(6)} ${bestOpportunity.symbol}`);

        await this.updatePortfolioAfterBuy(userId, bestOpportunity.id, quantity, currentPrice);
        
        const user = await storage.getUser(userId);
        if (user) {
          const newBalance = parseFloat(user.balance) - maxInvestment;
          await storage.updateUserBalance(userId, newBalance.toString());
        }

        const tradeData: InsertTrade = {
          userId,
          cryptoId: bestOpportunity.id,
          type: 'buy',
          amount: quantity.toString(),
          price: currentPrice.toString(),
          total: maxInvestment.toString(),
          isBot: true
        };
        await storage.createTrade(tradeData);
        
        if (this.broadcastFn) {
          this.broadcastFn({
            type: 'trade',
            data: {
              action: 'buy',
              symbol: bestOpportunity.symbol,
              amount: quantity.toFixed(6),
              price: currentPrice.toFixed(6),
              total: maxInvestment.toFixed(2),
              strategy: `Conservative Best Pick: +${bestOpportunity.change24h.toFixed(1)}%`,
              profit: '0.00'
            }
          });
        }

        try {
          await telegramService.sendTradeNotification(tradeData, bestOpportunity);
        } catch (error) {
          console.log('Telegram notification error:', error);
        }

        console.log(`✅ Conservative strategy executed - single strategic investment`);
      }
    } catch (error) {
      console.log(`❌ Failed to buy ${bestOpportunity.symbol}:`, error);
    }
  }

  private async updatePortfolioAfterBuy(userId: number, cryptoId: number, quantity: number, price: number): Promise<void> {
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

  private async updatePortfolioAfterSell(userId: number, cryptoId: number, soldAmount: number): Promise<void> {
    const existing = await storage.getPortfolioItem(userId, cryptoId);
    
    if (existing) {
      const currentAmount = parseFloat(existing.amount);
      const remainingAmount = currentAmount - soldAmount;
      
      if (remainingAmount <= 0.000001) {
        await storage.deletePortfolioItem(userId, cryptoId);
      } else {
        const avgPrice = parseFloat(existing.averagePrice);
        const newTotalInvested = remainingAmount * avgPrice;
        await storage.updatePortfolioItem(userId, cryptoId, remainingAmount.toString(), avgPrice.toString(), newTotalInvested.toString());
      }
    }
  }

  private calculateProfitabilityScore(crypto: any, price: number, change24h: number, volume: number): number {
    // Multi-factor profitability analysis
    let score = 0;
    
    // 1. Price momentum (40% weight)
    if (change24h > 5) score += 40;
    else if (change24h > 2) score += 25;
    else if (change24h > 0) score += 10;
    else if (change24h > -2) score += 5;
    
    // 2. Volume strength (30% weight)
    if (volume > 1000000) score += 30;
    else if (volume > 100000) score += 20;
    else if (volume > 10000) score += 10;
    
    // 3. Price range suitability (20% weight)
    if (price > 0.01 && price < 100) score += 20;
    else if (price >= 100 && price < 1000) score += 15;
    else if (price >= 1000) score += 10;
    
    // 4. Symbol reliability (10% weight)
    const reliableSymbols = ['BTC', 'ETH', 'BNB', 'ADA', 'DOT', 'SOL', 'MATIC', 'LINK', 'UNI', 'AVAX'];
    if (reliableSymbols.includes(crypto.symbol)) score += 10;
    
    return score;
  }
}

export const rsiTradingStrategy = new RSITradingStrategy();