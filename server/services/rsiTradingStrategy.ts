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
    if (balance < 1) return;

    console.log(`🔍 SHORT-TERM STRATEGY: Finding highest-gaining coins for quick profits with $${balance.toFixed(2)}...`);

    // Get available trading pairs from Binance testnet
    const { binanceService } = await import('./binanceService');
    const availablePairs = await binanceService.getTradingPairs();
    
    if (!availablePairs || availablePairs.length === 0) {
      console.log(`⚠️ No trading pairs available from Binance testnet`);
      return;
    }

    // Extract base assets from available pairs (remove USDT suffix)
    const availableSymbols = availablePairs
      .filter(pair => pair.endsWith('USDT'))
      .map(pair => pair.replace('USDT', ''));
    
    console.log(`📋 Available testnet symbols: ${availableSymbols.slice(0, 10).join(', ')}...`);
    
    // Find highest gaining coins from available pairs
    const highGainCryptos = cryptos
      .filter(crypto => {
        const price = parseFloat(crypto.currentPrice);
        const change24h = parseFloat(crypto.priceChange24h);
        return availableSymbols.includes(crypto.symbol) && price > 0.01 && change24h > 1;
      })
      .sort((a, b) => parseFloat(b.priceChange24h) - parseFloat(a.priceChange24h))
      .slice(0, 6); // Top 6 highest gainers from available pairs

    if (highGainCryptos.length === 0) {
      console.log(`⚠️ No high-momentum coins found`);
      return;
    }

    const maxPositions = 4; // Maximum 4 positions at once
    const investPerCoin = Math.min(balance / maxPositions, balance * 0.25); // Max 25% per coin

    if (investPerCoin < 1) return;

    let tradesExecuted = 0;

    for (const crypto of highGainCryptos) {
      if (tradesExecuted >= maxPositions) break;

      try {
        // Check if we already have this position
        const existingPosition = await storage.getPortfolioItem(userId, crypto.id);
        if (existingPosition) continue; // Skip if already holding

        const currentPrice = parseFloat(crypto.currentPrice);
        const priceChange24h = parseFloat(crypto.priceChange24h);
        const quantity = investPerCoin / currentPrice;

        // Only buy strong momentum coins
        if (priceChange24h > 3) {
          console.log(`🟢 HIGH-MOMENTUM BUY: ${crypto.symbol} - Gain: ${priceChange24h.toFixed(2)}%, Price: $${currentPrice.toFixed(6)}, Invest: $${investPerCoin.toFixed(2)}`);

          try {
            const { binanceService } = await import('./binanceService');
            const result = await binanceService.executeRealTrade(crypto.symbol, 'BUY', quantity, userId);
            
            if (result.success) {
              console.log(`🎯 BINANCE HIGH-MOMENTUM BUY: ${quantity.toFixed(6)} ${crypto.symbol}`);

              await this.updatePortfolioAfterBuy(userId, crypto.id, quantity, currentPrice);
              
              const user = await storage.getUser(userId);
              if (user) {
                const newBalance = parseFloat(user.balance) - investPerCoin;
                await storage.updateUserBalance(userId, newBalance.toString());
              }

              const tradeData: InsertTrade = {
                userId,
                cryptoId: crypto.id,
                type: 'buy',
                amount: quantity.toString(),
                price: currentPrice.toString(),
                total: investPerCoin.toString(),
                isBot: true
              };
              await storage.createTrade(tradeData);
              
              if (this.broadcastFn) {
                this.broadcastFn({
                  type: 'trade',
                  data: {
                    action: 'buy',
                    symbol: crypto.symbol,
                    amount: quantity.toFixed(6),
                    price: currentPrice.toFixed(6),
                    total: investPerCoin.toFixed(2),
                    strategy: `High-Momentum: +${priceChange24h.toFixed(1)}%`,
                    profit: '0.00'
                  }
                });
              }

              try {
                await telegramService.sendTradeNotification(tradeData, crypto);
              } catch (error) {
                console.log('Telegram notification error:', error);
              }

              tradesExecuted++;
            }
          } catch (error) {
            console.log(`❌ High-momentum trade failed for ${crypto.symbol}:`, error);
          }
        }
      } catch (error) {
        console.log(`❌ Analysis failed for ${crypto.symbol}:`, error);
      }
    }

    if (tradesExecuted === 0) {
      console.log(`⚠️ No suitable high-momentum opportunities found`);
    } else {
      console.log(`✅ Executed ${tradesExecuted} high-momentum trades`);
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
}

export const rsiTradingStrategy = new RSITradingStrategy();