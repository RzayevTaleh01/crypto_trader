import { storage } from '../storage';
import { InsertTrade } from '@shared/schema';
import { telegramService } from './telegramService';

export class RSITradingStrategy {
  private broadcastFn: ((data: any) => void) | null = null;
  private priceHistory: Map<string, number[]> = new Map(); // Track price history for RSI calculation

  setBroadcastFunction(fn: (data: any) => void) {
    this.broadcastFn = fn;
  }

  private calculateRSI(prices: number[], period: number = 14): number | null {
    if (prices.length < period + 1) return null;

    let gains = 0;
    let losses = 0;

    // Calculate initial average gains and losses
    for (let i = 1; i <= period; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) {
        gains += change;
      } else {
        losses += Math.abs(change);
      }
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) return 100;

    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));

    return rsi;
  }

  async executeRSIStrategy(userId: number): Promise<void> {
    const user = await storage.getUser(userId);
    if (!user) return;

    const balance = parseFloat(user.balance);
    const portfolio = await storage.getUserPortfolio(userId);
    const cryptos = await storage.getAllCryptocurrencies();

    console.log(`🎯 DIP-BUYING RSI STRATEGY - Balance: $${balance.toFixed(2)}, Portfolio: ${portfolio.length}, Analyzing ${cryptos.length} coins`);

    // Step 1: Update price history for all coins
    await this.updatePriceHistory(cryptos);

    // Step 2: Immediate sell when prices rise (any profit)
    if (portfolio.length > 0) {
      await this.sellOnPriceRise(userId, portfolio, cryptos);
    }

    // Step 3: Buy on price drops - distribute balance across most profitable coins
    if (balance > 2) {
      await this.buyOnPriceDrop(userId, cryptos, balance);
    }
  }

  private async updatePriceHistory(cryptos: any[]) {
    for (const crypto of cryptos) {
      const price = parseFloat(crypto.currentPrice);
      if (price > 0) {
        const history = this.priceHistory.get(crypto.symbol) || [];
        history.push(price);
        
        // Keep only last 20 prices for RSI calculation
        if (history.length > 20) {
          history.shift();
        }
        
        this.priceHistory.set(crypto.symbol, history);
      }
    }
  }

  private async sellOnPriceRise(userId: number, portfolio: any[], cryptos: any[]) {
    console.log(`🚀 INSTANT SELL ON RISE: Checking ${portfolio.length} positions for any price increase...`);

    for (const position of portfolio) {
      const crypto = cryptos.find(c => c.id === position.cryptoId);
      if (!crypto) continue;

      const amount = parseFloat(position.amount);
      const avgPrice = parseFloat(position.averagePrice);
      const currentPrice = parseFloat(crypto.currentPrice);
      const priceChange = ((currentPrice - avgPrice) / avgPrice) * 100;

      console.log(`📊 ${crypto.symbol}: Price change: ${priceChange.toFixed(2)}% (${avgPrice.toFixed(6)} → ${currentPrice.toFixed(6)})`);

      // Sell IMMEDIATELY on any price rise (even 0.1%)
      if (priceChange > 0.1) {
        try {
          console.log(`🚀 INSTANT SELL: ${crypto.symbol} - Rise: ${priceChange.toFixed(2)}%`);

          const { binanceService } = await import('./binanceService');
          const result = await binanceService.executeRealTrade(crypto.symbol, 'SELL', amount, userId);
          
          if (result.success) {
            const currentValue = amount * currentPrice;
            const profit = currentValue - (amount * avgPrice);
            
            console.log(`💸 BINANCE INSTANT SELL: ${amount.toFixed(6)} ${crypto.symbol} - Profit: $${profit.toFixed(3)}`);

            await this.updatePortfolioAfterSell(userId, position.cryptoId, amount);
            
            const user = await storage.getUser(userId);
            if (user) {
              const newBalance = parseFloat(user.balance) + currentValue;
              await storage.updateUserBalance(userId, newBalance.toString());
            }

            const tradeData: InsertTrade = {
              userId,
              cryptoId: crypto.id,
              type: 'sell',
              amount: amount.toString(),
              price: currentPrice.toString(),
              total: currentValue.toString(),
              isBot: true
            };
            await storage.createTrade(tradeData);
            
            if (this.broadcastFn) {
              this.broadcastFn({
                type: 'trade',
                data: {
                  action: 'sell',
                  symbol: crypto.symbol,
                  amount: amount.toFixed(6),
                  price: currentPrice.toFixed(6),
                  total: currentValue.toFixed(2),
                  strategy: `Instant Sell: +${priceChange.toFixed(2)}%`,
                  profit: profit.toFixed(3)
                }
              });
            }

            try {
              await telegramService.sendTradeNotification(tradeData, crypto);
            } catch (error) {
              console.log('Telegram notification error:', error);
            }
          }
        } catch (error) {
          console.log(`❌ Instant sell failed for ${crypto.symbol}:`, error);
        }
      }
    }
  }

  private async buyOnPriceDrop(userId: number, cryptos: any[], balance: number) {
    console.log(`💰 DIP-BUYING: Analyzing ALL ${cryptos.length} coins for price drops with $${balance.toFixed(2)} balance...`);

    // Analyze ALL cryptocurrencies for dip opportunities
    const dipOpportunities = [];
    
    for (const crypto of cryptos) {
      const price = parseFloat(crypto.currentPrice);
      const change24h = parseFloat(crypto.priceChange24h);
      const priceHistory = this.priceHistory.get(crypto.symbol) || [];
      
      if (price <= 0 || change24h >= 0) continue;
      
      // Calculate RSI for this coin (if we have enough data)
      const rsi = priceHistory.length >= 15 ? this.calculateRSI(priceHistory) : null;
      
      // Buy on ANY price drop, even small ones
      if (change24h <= -1) {
        // If we have RSI data, prefer oversold conditions
        if (rsi && rsi <= 50) {
          dipOpportunities.push({
            ...crypto,
            price,
            change24h,
            rsi,
            dipScore: Math.abs(change24h) * 2 + (50 - rsi) // Higher score = better opportunity
          });
        } else if (!rsi && change24h <= -2) {
          // No RSI data but any drop - still consider it
          dipOpportunities.push({
            ...crypto,
            price,
            change24h,
            rsi: null,
            dipScore: Math.abs(change24h) * 1.5 // Slightly lower score without RSI
          });
        } else if (rsi && change24h <= -3) {
          // Even if RSI is not oversold, consider big drops
          dipOpportunities.push({
            ...crypto,
            price,
            change24h,
            rsi,
            dipScore: Math.abs(change24h) * 1.2
          });
        }
      }
    }

    // Sort by best dip opportunities
    dipOpportunities.sort((a, b) => b.dipScore - a.dipScore);
    
    if (dipOpportunities.length === 0) {
      console.log(`⚠️ No significant dips found in any coins (looking for -1% drops across ${cryptos.length} coins)`);
      
      // Debug: Show some sample coins and their price changes
      const sampleCoins = cryptos.slice(0, 10).map(c => ({
        symbol: c.symbol,
        change: parseFloat(c.priceChange24h)
      }));
      console.log('📊 Sample coins:', sampleCoins);
      return;
    }

    console.log(`🎯 Found ${dipOpportunities.length} dip opportunities from ALL coins:`);
    dipOpportunities.slice(0, 10).forEach(opp => {
      const rsiText = opp.rsi ? `RSI: ${opp.rsi.toFixed(1)}` : 'No RSI';
      console.log(`💎 ${opp.symbol}: Drop: ${opp.change24h.toFixed(2)}%, ${rsiText}, Score: ${opp.dipScore.toFixed(1)}`);
    });

    // Distribute balance across top 3-5 opportunities
    const maxPositions = Math.min(5, dipOpportunities.length);
    const investmentPerCoin = balance / maxPositions;
    
    if (investmentPerCoin < 1) return;

    let tradesExecuted = 0;
    
    for (let i = 0; i < maxPositions && tradesExecuted < maxPositions; i++) {
      const opportunity = dipOpportunities[i];
      
      try {
        // Check if we already have this position
        const existingPosition = await storage.getPortfolioItem(userId, opportunity.id);
        if (existingPosition) continue; // Skip if already holding

        const quantity = investmentPerCoin / opportunity.price;

        const rsiText = opportunity.rsi ? `RSI: ${opportunity.rsi.toFixed(1)}` : 'No RSI';
        console.log(`🟢 DIP BUY: ${opportunity.symbol} - Drop: ${opportunity.change24h.toFixed(2)}%, ${rsiText}, Invest: $${investmentPerCoin.toFixed(2)}`);

        const { binanceService } = await import('./binanceService');
        const result = await binanceService.executeRealTrade(opportunity.symbol, 'BUY', quantity, userId);
        
        if (result.success) {
          console.log(`🎯 BINANCE DIP BUY: ${quantity.toFixed(6)} ${opportunity.symbol}`);

          await this.updatePortfolioAfterBuy(userId, opportunity.id, quantity, opportunity.price);
          
          const user = await storage.getUser(userId);
          if (user) {
            const newBalance = parseFloat(user.balance) - investmentPerCoin;
            await storage.updateUserBalance(userId, newBalance.toString());
          }

          const tradeData: InsertTrade = {
            userId,
            cryptoId: opportunity.id,
            type: 'buy',
            amount: quantity.toString(),
            price: opportunity.price.toString(),
            total: investmentPerCoin.toString(),
            isBot: true
          };
          await storage.createTrade(tradeData);
          
          if (this.broadcastFn) {
            this.broadcastFn({
              type: 'trade',
              data: {
                action: 'buy',
                symbol: opportunity.symbol,
                amount: quantity.toFixed(6),
                price: opportunity.price.toFixed(6),
                total: investmentPerCoin.toFixed(2),
                strategy: `Dip Buy: ${opportunity.change24h.toFixed(1)}%, ${opportunity.rsi ? `RSI: ${opportunity.rsi.toFixed(1)}` : 'No RSI'}`,
                profit: '0.00'
              }
            });
          }

          try {
            await telegramService.sendTradeNotification(tradeData, opportunity);
          } catch (error) {
            console.log('Telegram notification error:', error);
          }

          tradesExecuted++;
        }
      } catch (error) {
        console.log(`❌ Dip buy failed for ${opportunity.symbol}:`, error);
      }
    }

    if (tradesExecuted === 0) {
      console.log(`⚠️ No dip buying opportunities executed`);
    } else {
      console.log(`✅ Executed ${tradesExecuted} dip buying trades`);
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
    if (!existing) return;

    const currentAmount = parseFloat(existing.amount);
    const newAmount = currentAmount - soldAmount;

    if (newAmount <= 0.000001) {
      await storage.deletePortfolioItem(userId, cryptoId);
    } else {
      const avgPrice = parseFloat(existing.averagePrice);
      const newTotal = newAmount * avgPrice;
      await storage.updatePortfolioItem(userId, cryptoId, newAmount.toString(), avgPrice.toString(), newTotal.toString());
    }
  }

  private calculateProfitabilityScore(crypto: any, price: number, change24h: number, volume: number): number {
    let score = 0;
    
    // Higher positive change = higher score
    if (change24h > 0) {
      score += change24h * 10;
    }
    
    // Volume factor (higher volume = more reliable)
    if (volume > 100000) {
      score += 20;
    } else if (volume > 10000) {
      score += 10;
    }
    
    // Price momentum factor
    if (change24h > 5) {
      score += 30; // Strong upward momentum
    } else if (change24h > 2) {
      score += 15; // Moderate momentum
    }
    
    return score;
  }
}

export const rsiTradingStrategy = new RSITradingStrategy();