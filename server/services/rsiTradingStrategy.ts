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

  // Generate mock price history for RSI calculation
  private generatePriceHistory(currentPrice: number, volatility: number): number[] {
    const prices = [];
    let price = currentPrice * 0.95; // Start 5% lower
    
    for (let i = 0; i < 20; i++) {
      const change = (Math.random() - 0.5) * volatility * price * 0.02;
      price += change;
      prices.push(price);
    }
    
    prices.push(currentPrice); // End with current price
    return prices;
  }

  async executeRSIStrategy(userId: number): Promise<void> {
    const user = await storage.getUser(userId);
    if (!user) return;

    const balance = parseFloat(user.balance);
    const cryptos = await storage.getAllCryptocurrencies();
    const portfolio = await storage.getUserPortfolio(userId);

    console.log(`📊 Executing RSI Strategy - Balance: $${balance.toFixed(2)}`);

    // Step 1: Sell overbought positions (RSI > 70)
    await this.sellOverboughtPositions(userId, portfolio, cryptos);

    // Step 2: Buy oversold cryptocurrencies (RSI < 30)
    if (balance > 2) {
      await this.buyOversoldCryptos(userId, cryptos, balance);
    }
  }

  private async sellOverboughtPositions(userId: number, portfolio: any[], cryptos: any[]) {
    for (const position of portfolio) {
      const crypto = cryptos.find(c => c.id === position.cryptoId);
      if (!crypto) continue;

      const currentPrice = parseFloat(crypto.currentPrice);
      const priceChange = parseFloat(crypto.priceChange24h);
      const volatility = Math.abs(priceChange);
      
      // Generate price history for RSI calculation
      const priceHistory = this.generatePriceHistory(currentPrice, volatility);
      const rsi = this.calculateRSI(priceHistory);

      if (rsi && rsi > 70) {
        const amount = parseFloat(position.amount);
        const avgPrice = parseFloat(position.averagePrice);
        const profitPercentage = ((currentPrice - avgPrice) / avgPrice) * 100;

        // Sell if overbought and profitable
        if (profitPercentage > 0.5) {
          const sellAmount = amount * 0.7; // Sell 70% of overbought position
          const totalValue = sellAmount * currentPrice;
          const profit = (currentPrice - avgPrice) * sellAmount;

          console.log(`🔴 RSI SELL: ${sellAmount.toFixed(6)} ${crypto.symbol} - RSI: ${rsi.toFixed(1)} (Overbought)`);

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

          // Send Telegram notification
          try {
            const { telegramService } = await import('./telegramService');
            await telegramService.sendTradeNotification({
              type: 'sell',
              amount: sellAmount.toString(),
              price: currentPrice.toString(),
              total: totalValue.toString(),
              symbol: crypto.symbol,
              profit: profit.toFixed(2),
              strategy: `RSI Overbought: ${rsi.toFixed(1)}`
            }, crypto);
          } catch (error) {
            console.log('Telegram notification failed:', error);
          }
        }
      }
    }
  }

  private async buyOversoldCryptos(userId: number, cryptos: any[], balance: number) {
    const oversoldCandidates = [];

    // Find oversold cryptocurrencies
    for (const crypto of cryptos) {
      const currentPrice = parseFloat(crypto.currentPrice);
      const priceChange = parseFloat(crypto.priceChange24h);
      const volatility = Math.abs(priceChange);
      
      if (currentPrice > 0.001) { // Filter out very low value coins
        const priceHistory = this.generatePriceHistory(currentPrice, volatility);
        const rsi = this.calculateRSI(priceHistory);

        if (rsi && rsi < 30) {
          oversoldCandidates.push({
            crypto,
            rsi,
            price: currentPrice
          });
        }
      }
    }

    // Sort by lowest RSI (most oversold)
    oversoldCandidates.sort((a, b) => a.rsi - b.rsi);

    // Buy the most oversold cryptocurrency
    if (oversoldCandidates.length > 0) {
      const best = oversoldCandidates[0];
      const investAmount = Math.min(balance * 0.3, 3); // Invest up to 30% of balance or $3
      const quantity = investAmount / best.price;

      console.log(`🟢 RSI BUY: ${quantity.toFixed(6)} ${best.crypto.symbol} - RSI: ${best.rsi.toFixed(1)} (Oversold)`);

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