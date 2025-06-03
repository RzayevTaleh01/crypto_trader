import { storage } from '../storage';
import { InsertTrade } from '@shared/schema';

export class RSITradingStrategy {
  private broadcastFn: ((data: any) => void) | null = null;

  setBroadcastFunction(fn: (data: any) => void) {
    this.broadcastFn = fn;
  }

  // Calculate RSI (Relative Strength Index)
  private calculateRSI(prices: number[], period: number = 14): number | null {
    if (prices.length < period + 1) {
      return null; // Not enough data
    }

    const deltas: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      deltas.push(prices[i] - prices[i - 1]);
    }

    const gains = deltas.map(delta => delta > 0 ? delta : 0);
    const losses = deltas.map(delta => delta < 0 ? -delta : 0);

    const avgGain = gains.slice(-period).reduce((sum, gain) => sum + gain, 0) / period;
    const avgLoss = losses.slice(-period).reduce((sum, loss) => sum + loss, 0) / period;

    if (avgLoss === 0) {
      return 100;
    }

    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  // Get real price history from Binance testnet
  private async getRealPriceHistory(symbol: string): Promise<number[]> {
    const { binanceService } = await import('./binanceService');
    return await binanceService.getKlineData(symbol);
  }

  async executeRSIStrategy(userId: number): Promise<void> {
    const user = await storage.getUser(userId);
    if (!user) return;

    const balance = parseFloat(user.balance);
    const cryptos = await storage.getAllCryptocurrencies();
    const portfolio = await storage.getUserPortfolio(userId);

    console.log(`📊 Executing RSI Strategy - Balance: $${balance.toFixed(2)}, Cryptos: ${cryptos.length}, Portfolio: ${portfolio.length}`);

    // Step 1: Always check for profit-taking opportunities first
    if (portfolio.length > 0) {
      console.log(`🔍 RSI SELL CHECK: Analyzing ${portfolio.length} portfolio positions for profit opportunities...`);
      await this.sellOverboughtPositions(userId, portfolio, cryptos);
    }

    // Step 2: Buy oversold cryptocurrencies if we have balance
    if (balance > 2) {
      await this.buyOversoldCryptos(userId, cryptos, balance);
    }
  }

  private async sellOverboughtPositions(userId: number, portfolio: any[], cryptos: any[]) {
    console.log(`🔍 RSI SELL CHECK: Analyzing ${portfolio.length} portfolio positions for overbought conditions...`);
    
    for (const position of portfolio) {
      const crypto = cryptos.find(c => c.id === position.cryptoId);
      if (!crypto) continue;

      const currentPrice = parseFloat(crypto.currentPrice);
      const priceChange = parseFloat(crypto.priceChange24h);
      const volatility = Math.abs(priceChange);
      const avgPrice = parseFloat(position.averagePrice);
      const profitPercentage = ((currentPrice - avgPrice) / avgPrice) * 100;
      
      // Get real price history from Binance for RSI calculation
      const priceHistory = await this.getRealPriceHistory(crypto.symbol);
      if (priceHistory.length === 0) continue;
      
      const rsi = this.calculateRSI(priceHistory);

      const amount = parseFloat(position.amount);
      const currentValue = amount * currentPrice;
      const investedValue = amount * avgPrice;
      const absoluteProfit = currentValue - investedValue;
      
      console.log(`💰 ${crypto.symbol}: RSI: ${rsi?.toFixed(1) || 'N/A'}, Profit: ${profitPercentage.toFixed(2)}% ($${absoluteProfit.toFixed(3)}), Price: $${currentPrice.toFixed(6)} vs Avg: $${avgPrice.toFixed(6)}`);
      
      // Very aggressive trading - sell immediately on RSI > 65 or any profit
      if ((absoluteProfit > 0.01) || (rsi && rsi > 65)) {
        console.log(`💎 TRADE TRIGGER: ${crypto.symbol} - Profit: $${absoluteProfit.toFixed(3)}, RSI: ${rsi?.toFixed(1) || 'N/A'}`);
        
        if (absoluteProfit > 0.005) { // Sell on any profit above half a cent
          const sellAmount = amount * 0.7; // Sell 70% of overbought position
          const totalValue = sellAmount * currentPrice;
          const profit = (currentPrice - avgPrice) * sellAmount;

          console.log(`🔴 RSI SELL: ${sellAmount.toFixed(6)} ${crypto.symbol} - RSI: ${rsi?.toFixed(1) || 'N/A'} (Overbought)`);

          // Execute real Binance testnet trade
          const { binanceService } = await import('./binanceService');
          
          try {
            const result = await binanceService.executeRealTrade(crypto.symbol, 'SELL', sellAmount, userId);
            
            if (result.success) {
              console.log(`🎯 BINANCE SELL EXECUTED: ${sellAmount.toFixed(6)} ${crypto.symbol} at $${currentPrice}`);
              await this.updatePortfolioAfterSell(userId, position.cryptoId, sellAmount);
            } else {
              console.log(`❌ Binance trade failed: ${result.message}`);
              // Fallback to database-only trade
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
            // Fallback to database-only trade
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
          const user = await storage.getUser(userId);
          if (user) {
            const newBalance = parseFloat(user.balance) + totalValue;
            await storage.updateUserBalance(userId, newBalance.toString());
          }

          // Broadcast and notify
          if (this.broadcastFn) {
            this.broadcastFn({
              type: 'trade',
              data: {
                action: 'sell',
                symbol: crypto.symbol,
                amount: sellAmount.toFixed(6),
                price: currentPrice.toFixed(2),
                total: totalValue.toFixed(2),
                strategy: `RSI Overbought: ${rsi.toFixed(1)}`,
                profit: profit.toFixed(2)
              }
            });
          }

          // Send Telegram notification with profit information
          try {
            const { telegramService } = await import('./telegramService');
            const profitPercentage = ((currentPrice - avgPrice) / avgPrice) * 100;
            
            await telegramService.sendTradeNotification({
              type: 'sell',
              amount: sellAmount.toString(),
              price: currentPrice.toString(),
              total: totalValue.toString(),
              symbol: crypto.symbol,
              profit: profit.toFixed(2),
              strategy: `RSI ${rsi?.toFixed(1)} - Kar: ${profitPercentage >= 0 ? '+' : ''}${profitPercentage.toFixed(2)}%`,
              isBot: true
            }, crypto, portfolio);
            
            console.log(`📱 Telegram notification sent: ${crypto.symbol} SELL with $${profit.toFixed(2)} profit`);
          } catch (error) {
            console.log('Telegram notification failed:', error);
          }
        }
      }
    }
  }

  private async buyOversoldCryptos(userId: number, cryptos: any[], balance: number) {
    const oversoldCandidates = [];

    console.log(`🔍 RSI Strategy: Analyzing ${cryptos.length} cryptocurrencies for oversold conditions...`);

    // Find oversold cryptocurrencies
    for (const crypto of cryptos) {
      const currentPrice = parseFloat(crypto.currentPrice);
      const priceChange = parseFloat(crypto.priceChange24h);
      const volatility = Math.abs(priceChange);
      
      if (currentPrice > 0.001) { // Filter out very low value coins
        const priceHistory = await this.getRealPriceHistory(crypto.symbol);
        if (priceHistory.length === 0) continue;
        
        const rsi = this.calculateRSI(priceHistory);

        console.log(`📊 ${crypto.symbol}: Price $${currentPrice.toFixed(6)}, RSI: ${rsi?.toFixed(1) || 'N/A'}, Change: ${priceChange}%`);

        // Very aggressive oversold threshold - buy frequently
        if (rsi && rsi < 65) {
          oversoldCandidates.push({
            crypto,
            rsi,
            price: currentPrice
          });
          console.log(`🟢 OVERSOLD FOUND: ${crypto.symbol} - RSI: ${rsi.toFixed(1)}`);
        } else if (rsi && rsi < 60) {
          console.log(`⚠️ CLOSE TO OVERSOLD: ${crypto.symbol} - RSI: ${rsi.toFixed(1)}`);
        }
      }
    }

    console.log(`🎯 Found ${oversoldCandidates.length} oversold candidates`);

    // Sort by lowest RSI (most oversold)
    oversoldCandidates.sort((a, b) => a.rsi - b.rsi);

    // Buy the most oversold cryptocurrency
    if (oversoldCandidates.length > 0) {
      const best = oversoldCandidates[0];
      const investAmount = Math.min(balance * 0.95, balance); // Invest 95% of available balance
      const quantity = investAmount / best.price;

      console.log(`🟢 RSI BUY: ${quantity.toFixed(6)} ${best.crypto.symbol} - RSI: ${best.rsi.toFixed(1)} (Oversold)`);

      // Execute real Binance testnet trade
      const { binanceService } = await import('./binanceService');
      
      try {
        const result = await binanceService.executeRealTrade(best.crypto.symbol, 'BUY', quantity, userId);
        
        if (result.success) {
          console.log(`🎯 BINANCE BUY EXECUTED: ${quantity.toFixed(6)} ${best.crypto.symbol} at $${best.price}`);
          await this.updatePortfolioAfterBuy(userId, best.crypto.id, quantity, best.price);
        } else {
          console.log(`❌ Binance trade failed: ${result.message} - Skipping ${best.crypto.symbol}`);
          return; // Skip this trade and wait for next cycle
        }
      } catch (error) {
        console.log(`❌ Binance API error, using database trade:`, error);
        // Fallback to database-only trade
        const tradeData: InsertTrade = {
          userId,
          cryptoId: best.crypto.id,
          type: 'buy',
          amount: quantity.toString(),
          price: best.price.toString(),
          total: investAmount.toString(),
          isBot: true
        };
        await storage.createTrade(tradeData);
        await this.updatePortfolioAfterBuy(userId, best.crypto.id, quantity, best.price);
      }

      // Update balance
      const newBalance = balance - investAmount;
      await storage.updateUserBalance(userId, newBalance.toString());

      // Broadcast and notify
      if (this.broadcastFn) {
        this.broadcastFn({
          type: 'trade',
          data: {
            action: 'buy',
            symbol: best.crypto.symbol,
            amount: quantity.toFixed(6),
            price: best.price.toFixed(2),
            total: investAmount.toFixed(2),
            strategy: `RSI Oversold: ${best.rsi.toFixed(1)}`,
            profit: '0.00'
          }
        });
      }

      // Send Telegram notification
      try {
        const { telegramService } = await import('./telegramService');
        await telegramService.sendTradeNotification({
          type: 'buy',
          amount: quantity.toString(),
          price: best.price.toString(),
          total: investAmount.toString(),
          symbol: best.crypto.symbol,
          strategy: `RSI Oversold: ${best.rsi.toFixed(1)}`
        }, best.crypto);
      } catch (error) {
        console.log('Telegram notification failed:', error);
      }
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

  private async updatePortfolioAfterSell(userId: number, cryptoId: number, soldAmount: number) {
    const existing = await storage.getPortfolioItem(userId, cryptoId);
    
    if (existing) {
      const currentAmount = parseFloat(existing.amount);
      const newAmount = Math.max(0, currentAmount - soldAmount);
      
      if (newAmount < 0.001) {
        await storage.deletePortfolioItem(userId, cryptoId);
      } else {
        const sellRatio = soldAmount / currentAmount;
        const currentTotal = parseFloat(existing.totalInvested);
        const newTotal = currentTotal * (1 - sellRatio);
        
        await storage.updatePortfolioItem(userId, cryptoId, newAmount.toString(), existing.averagePrice, newTotal.toString());
      }
    }
  }
}

export const rsiTradingStrategy = new RSITradingStrategy();