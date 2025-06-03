import { storage } from '../storage';
import { InsertTrade } from '@shared/schema';
import { advancedTechnicalAnalysis } from './advancedTechnicalAnalysis';
import { binanceService } from './binanceService';
import { telegramService } from './telegramService';

export interface MomentumSignal {
  action: 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell';
  confidence: number;
  score: number;
  indicators: string[];
  targetPrice?: number;
  stopLoss?: number;
}

export class MomentumTradingStrategy {
  private broadcastFn: ((data: any) => void) | null = null;

  setBroadcastFunction(fn: (data: any) => void) {
    this.broadcastFn = fn;
  }

  async executeMomentumStrategy(userId: number): Promise<void> {
    const user = await storage.getUser(userId);
    if (!user) return;

    const balance = parseFloat(user.balance);
    const portfolio = await storage.getUserPortfolio(userId);
    const cryptos = await storage.getAllCryptocurrencies();

    console.log(`🚀 Executing Momentum Strategy - Balance: $${balance.toFixed(2)}, Portfolio: ${portfolio.length}`);

    // Step 1: Analyze current positions for exit signals
    if (portfolio.length > 0) {
      await this.analyzeMomentumExits(userId, portfolio, cryptos);
    }

    // Step 2: Find momentum entry opportunities
    if (balance > 5) {
      await this.findMomentumEntries(userId, cryptos, balance);
    }
  }

  private async analyzeMomentumExits(userId: number, portfolio: any[], cryptos: any[]): Promise<void> {
    console.log(`📊 Analyzing ${portfolio.length} positions for momentum exits...`);

    for (const position of portfolio) {
      const crypto = cryptos.find(c => c.id === position.cryptoId);
      if (!crypto) continue;

      try {
        const analysis = await advancedTechnicalAnalysis.getComprehensiveAnalysis(crypto.symbol);
        const currentPrice = parseFloat(crypto.currentPrice);
        const avgPrice = parseFloat(position.averagePrice);
        const amount = parseFloat(position.amount);
        const profitPercentage = ((currentPrice - avgPrice) / avgPrice) * 100;

        console.log(`💰 ${crypto.symbol}: Price $${currentPrice.toFixed(6)}, Profit: ${profitPercentage.toFixed(2)}%, Signal: ${analysis.signal.signal}`);

        // Exit conditions based on momentum analysis
        let shouldSell = false;
        let sellRatio = 0;
        let reason = '';

        // Strong sell signals - exit 80-100%
        if (analysis.signal.signal === 'strong_sell' && analysis.signal.confidence > 70) {
          shouldSell = true;
          sellRatio = 0.9;
          reason = `Strong Momentum Sell: ${analysis.signal.indicators.join(', ')}`;
        }
        // Profit taking with momentum reversal
        else if (profitPercentage > 15 && (analysis.signal.signal === 'sell' || analysis.signal.signal === 'strong_sell')) {
          shouldSell = true;
          sellRatio = 0.6;
          reason = `Momentum Profit Taking: +${profitPercentage.toFixed(2)}%`;
        }
        // Stop loss with weak momentum
        else if (profitPercentage < -8 && analysis.signal.confidence < 30) {
          shouldSell = true;
          sellRatio = 0.5;
          reason = `Momentum Stop Loss: ${profitPercentage.toFixed(2)}%`;
        }
        // Partial profit taking on strong gains
        else if (profitPercentage > 25) {
          shouldSell = true;
          sellRatio = 0.3;
          reason = `Partial Momentum Profit: +${profitPercentage.toFixed(2)}%`;
        }

        if (shouldSell) {
          await this.executeMomentumSell(userId, crypto, position, sellRatio, reason, analysis.signal.confidence);
        }

      } catch (error) {
        console.log(`❌ Momentum analysis failed for ${crypto.symbol}:`, error);
      }
    }
  }

  private async findMomentumEntries(userId: number, cryptos: any[], balance: number): Promise<void> {
    console.log(`🔍 Scanning for momentum entry opportunities with $${balance.toFixed(2)}...`);
    
    const momentumCandidates = [];
    
    // Analyze top 30 cryptocurrencies for performance
    const topCryptos = cryptos
      .filter(c => parseFloat(c.currentPrice) > 0.001)
      .sort((a, b) => parseFloat(b.currentPrice) - parseFloat(a.currentPrice))
      .slice(0, 30);

    for (const crypto of topCryptos) {
      try {
        const analysis = await advancedTechnicalAnalysis.getComprehensiveAnalysis(crypto.symbol);
        const currentPrice = parseFloat(crypto.currentPrice);
        const priceChange24h = parseFloat(crypto.priceChange24h);

        // Calculate momentum score
        const momentumScore = this.calculateMomentumScore(analysis, priceChange24h);
        
        if (momentumScore > 60 && (analysis.signal.signal === 'buy' || analysis.signal.signal === 'strong_buy')) {
          momentumCandidates.push({
            crypto,
            analysis,
            momentumScore,
            price: currentPrice,
            priceChange24h
          });

          console.log(`🎯 MOMENTUM CANDIDATE: ${crypto.symbol} - Score: ${momentumScore.toFixed(1)}, Signal: ${analysis.signal.signal}, Change: ${priceChange24h}%`);
        }

      } catch (error) {
        console.log(`❌ Failed to analyze ${crypto.symbol} for momentum:`, error);
      }
    }

    // Sort by momentum score and execute best opportunity
    momentumCandidates.sort((a, b) => b.momentumScore - a.momentumScore);

    if (momentumCandidates.length > 0) {
      const best = momentumCandidates[0];
      await this.executeMomentumBuy(userId, best, balance);
    } else {
      console.log(`⚠️ No strong momentum opportunities found`);
    }
  }

  private calculateMomentumScore(analysis: any, priceChange24h: number): number {
    let score = 0;

    // Base signal score (0-40 points)
    if (analysis.signal.signal === 'strong_buy') score += 40;
    else if (analysis.signal.signal === 'buy') score += 30;
    else if (analysis.signal.signal === 'hold') score += 10;

    // Confidence bonus (0-20 points)
    score += (analysis.signal.confidence / 100) * 20;

    // Price momentum (0-25 points)
    if (priceChange24h > 10) score += 25;
    else if (priceChange24h > 5) score += 20;
    else if (priceChange24h > 2) score += 15;
    else if (priceChange24h > 0) score += 10;

    // Technical indicator bonuses (0-15 points)
    const indicators = analysis.indicators;
    if (indicators.rsi && indicators.rsi < 40) score += 5; // Oversold bonus
    if (indicators.macd && indicators.macd.histogram > 0) score += 5; // MACD bullish
    if (indicators.stochastic && indicators.stochastic.k < 30) score += 5; // Stochastic oversold

    return Math.min(100, score);
  }

  private async executeMomentumSell(userId: number, crypto: any, position: any, sellRatio: number, reason: string, confidence: number): Promise<void> {
    const currentPrice = parseFloat(crypto.currentPrice);
    const positionAmount = parseFloat(position.amount);
    const sellAmount = positionAmount * sellRatio;
    const totalValue = sellAmount * currentPrice;

    console.log(`🔴 MOMENTUM SELL: ${sellAmount.toFixed(6)} ${crypto.symbol} at $${currentPrice.toFixed(6)} - ${reason}`);

    try {
      // Execute real Binance trade
      const result = await binanceService.executeRealTrade(crypto.symbol, 'SELL', sellAmount, userId);
      
      if (result.success) {
        console.log(`🎯 BINANCE MOMENTUM SELL: ${sellAmount.toFixed(6)} ${crypto.symbol}`);
        
        // Update portfolio
        await this.updatePortfolioAfterSell(userId, position.cryptoId, sellAmount);
        
        // Update balance
        const user = await storage.getUser(userId);
        if (user) {
          const newBalance = parseFloat(user.balance) + totalValue;
          await storage.updateUserBalance(userId, newBalance.toString());
        }

        // Record trade
        const tradeData: InsertTrade = {
          userId,
          cryptoId: crypto.id,
          type: 'sell',
          amount: sellAmount.toString(),
          price: currentPrice.toString(),
          total: totalValue.toString(),
          isBot: true
        };
        await storage.createTrade(tradeData);

        // Broadcast update
        if (this.broadcastFn) {
          this.broadcastFn({
            type: 'trade',
            data: {
              action: 'sell',
              symbol: crypto.symbol,
              amount: sellAmount.toFixed(6),
              price: currentPrice.toFixed(6),
              total: totalValue.toFixed(2),
              strategy: reason,
              confidence: confidence.toFixed(1)
            }
          });
        }

        // Send Telegram notification for sell trade
        try {
          await telegramService.sendTradeNotification(tradeData, crypto, position);
        } catch (error) {
          console.log('Telegram notification error:', error);
        }

      } else {
        console.log(`❌ Binance momentum sell failed: ${result.message}`);
      }
    } catch (error) {
      console.log(`❌ Momentum sell error for ${crypto.symbol}:`, error);
    }
  }

  private async executeMomentumBuy(userId: number, candidate: any, balance: number): Promise<void> {
    const crypto = candidate.crypto;
    const currentPrice = candidate.price;
    const investAmount = Math.min(balance * 0.7, balance - 1); // Invest 70% of balance, keep $1 reserve
    const quantity = investAmount / currentPrice;

    const reason = `Momentum Entry: Score ${candidate.momentumScore.toFixed(1)}, ${candidate.analysis.signal.indicators.join(', ')}`;

    console.log(`🟢 MOMENTUM BUY: ${quantity.toFixed(6)} ${crypto.symbol} at $${currentPrice.toFixed(6)} - ${reason}`);

    try {
      // Execute real Binance trade
      const result = await binanceService.executeRealTrade(crypto.symbol, 'BUY', quantity, userId);
      
      if (result.success) {
        console.log(`🎯 BINANCE MOMENTUM BUY: ${quantity.toFixed(6)} ${crypto.symbol}`);
        
        // Update portfolio
        await this.updatePortfolioAfterBuy(userId, crypto.id, quantity, currentPrice);
        
        // Update balance
        const newBalance = balance - investAmount;
        await storage.updateUserBalance(userId, newBalance.toString());

        // Record trade
        const tradeData: InsertTrade = {
          userId,
          cryptoId: crypto.id,
          type: 'buy',
          amount: quantity.toString(),
          price: currentPrice.toString(),
          total: investAmount.toString(),
          isBot: true
        };
        await storage.createTrade(tradeData);

        // Broadcast update
        if (this.broadcastFn) {
          this.broadcastFn({
            type: 'trade',
            data: {
              action: 'buy',
              symbol: crypto.symbol,
              amount: quantity.toFixed(6),
              price: currentPrice.toFixed(6),
              total: investAmount.toFixed(2),
              strategy: reason,
              confidence: candidate.analysis.signal.confidence.toFixed(1)
            }
          });
        }

        // Send Telegram notification for buy trade
        try {
          await telegramService.sendTradeNotification(tradeData, crypto);
        } catch (error) {
          console.log('Telegram notification error:', error);
        }

      } else {
        console.log(`❌ Binance momentum buy failed: ${result.message}`);
      }
    } catch (error) {
      console.log(`❌ Momentum buy error for ${crypto.symbol}:`, error);
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

export const momentumTradingStrategy = new MomentumTradingStrategy();