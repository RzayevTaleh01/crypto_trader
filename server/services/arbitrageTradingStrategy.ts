import { storage } from '../storage';
import { InsertTrade } from '@shared/schema';
import { binanceService } from './binanceService';

export interface ArbitrageOpportunity {
  symbol: string;
  cryptoId: number;
  currentPrice: number;
  targetPrice: number;
  profitPotential: number;
  confidence: number;
  timeWindow: number;
  strategy: string;
}

export class ArbitrageTradingStrategy {
  private broadcastFn: ((data: any) => void) | null = null;
  private priceHistory: Map<string, number[]> = new Map();
  private lastPriceCheck: Map<string, number> = new Map();

  setBroadcastFunction(fn: (data: any) => void) {
    this.broadcastFn = fn;
  }

  async executeArbitrageStrategy(userId: number): Promise<void> {
    const user = await storage.getUser(userId);
    if (!user) return;

    const balance = parseFloat(user.balance);
    const portfolio = await storage.getUserPortfolio(userId);
    const cryptos = await storage.getAllCryptocurrencies();

    console.log(`⚡ Executing Arbitrage Strategy - Balance: $${balance.toFixed(2)}, Portfolio: ${portfolio.length}`);

    // Update price history for all cryptocurrencies
    await this.updatePriceHistory(cryptos);

    // Step 1: Analyze current positions for arbitrage exits
    if (portfolio.length > 0) {
      await this.analyzeArbitrageExits(userId, portfolio, cryptos);
    }

    // Step 2: Find arbitrage opportunities
    if (balance > 3) {
      await this.findArbitrageOpportunities(userId, cryptos, balance);
    }
  }

  private async updatePriceHistory(cryptos: any[]): Promise<void> {
    const currentTime = Date.now();
    
    for (const crypto of cryptos) {
      const currentPrice = parseFloat(crypto.currentPrice);
      const symbol = crypto.symbol;
      
      if (!this.priceHistory.has(symbol)) {
        this.priceHistory.set(symbol, []);
      }
      
      const history = this.priceHistory.get(symbol)!;
      const lastCheck = this.lastPriceCheck.get(symbol) || 0;
      
      // Only update if enough time has passed (5 seconds minimum)
      if (currentTime - lastCheck > 5000) {
        history.push(currentPrice);
        
        // Keep only last 50 price points
        if (history.length > 50) {
          history.shift();
        }
        
        this.lastPriceCheck.set(symbol, currentTime);
      }
    }
  }

  private async analyzeArbitrageExits(userId: number, portfolio: any[], cryptos: any[]): Promise<void> {
    console.log(`🔍 Analyzing ${portfolio.length} positions for arbitrage exits...`);

    for (const position of portfolio) {
      const crypto = cryptos.find(c => c.id === position.cryptoId);
      if (!crypto) continue;

      const currentPrice = parseFloat(crypto.currentPrice);
      const avgPrice = parseFloat(position.averagePrice);
      const amount = parseFloat(position.amount);
      const profitPercentage = ((currentPrice - avgPrice) / avgPrice) * 100;

      // Get price volatility and momentum
      const priceHistory = this.priceHistory.get(crypto.symbol) || [];
      const volatility = this.calculateVolatility(priceHistory);
      const momentum = this.calculateMomentum(priceHistory);

      console.log(`💰 ${crypto.symbol}: Price $${currentPrice.toFixed(6)}, Profit: ${profitPercentage.toFixed(2)}%, Volatility: ${volatility.toFixed(2)}%`);

      let shouldSell = false;
      let sellRatio = 0;
      let reason = '';

      // Quick arbitrage profit taking (high frequency)
      if (profitPercentage > 3 && volatility > 2) {
        shouldSell = true;
        sellRatio = 0.6;
        reason = `Quick Arbitrage Profit: +${profitPercentage.toFixed(2)}%`;
      }
      // Momentum reversal arbitrage
      else if (profitPercentage > 8 && momentum < -1) {
        shouldSell = true;
        sellRatio = 0.8;
        reason = `Momentum Reversal Arbitrage: +${profitPercentage.toFixed(2)}%`;
      }
      // High volatility scalping
      else if (profitPercentage > 1.5 && volatility > 5) {
        shouldSell = true;
        sellRatio = 0.4;
        reason = `Volatility Scalping: +${profitPercentage.toFixed(2)}%`;
      }
      // Stop loss for arbitrage positions
      else if (profitPercentage < -4) {
        shouldSell = true;
        sellRatio = 0.7;
        reason = `Arbitrage Stop Loss: ${profitPercentage.toFixed(2)}%`;
      }
      // Take profit on large gains
      else if (profitPercentage > 20) {
        shouldSell = true;
        sellRatio = 0.5;
        reason = `Large Arbitrage Profit: +${profitPercentage.toFixed(2)}%`;
      }

      if (shouldSell) {
        await this.executeArbitrageSell(userId, crypto, position, sellRatio, reason);
      }
    }
  }

  private async findArbitrageOpportunities(userId: number, cryptos: any[], balance: number): Promise<void> {
    console.log(`🎯 Scanning for arbitrage opportunities with $${balance.toFixed(2)}...`);
    
    const opportunities: ArbitrageOpportunity[] = [];
    
    // Analyze cryptocurrencies for arbitrage potential
    for (const crypto of cryptos) {
      const currentPrice = parseFloat(crypto.currentPrice);
      const priceChange24h = parseFloat(crypto.priceChange24h);
      
      if (currentPrice < 0.001) continue; // Skip very low value coins
      
      const priceHistory = this.priceHistory.get(crypto.symbol) || [];
      if (priceHistory.length < 10) continue;

      const opportunity = this.analyzeArbitrageOpportunity(crypto, priceHistory, currentPrice, priceChange24h);
      
      if (opportunity && opportunity.profitPotential > 2) {
        opportunities.push(opportunity);
        console.log(`⚡ ARBITRAGE OPPORTUNITY: ${crypto.symbol} - Potential: +${opportunity.profitPotential.toFixed(2)}%, Strategy: ${opportunity.strategy}`);
      }
    }

    // Sort by profit potential and confidence
    opportunities.sort((a, b) => (b.profitPotential * b.confidence) - (a.profitPotential * a.confidence));

    // Execute best arbitrage opportunity
    if (opportunities.length > 0) {
      const best = opportunities[0];
      const crypto = cryptos.find(c => c.id === best.cryptoId);
      if (crypto) {
        await this.executeArbitrageBuy(userId, crypto, best, balance);
      }
    } else {
      console.log(`⚠️ No profitable arbitrage opportunities found`);
    }
  }

  private analyzeArbitrageOpportunity(crypto: any, priceHistory: number[], currentPrice: number, priceChange24h: number): ArbitrageOpportunity | null {
    if (priceHistory.length < 10) return null;

    const volatility = this.calculateVolatility(priceHistory);
    const momentum = this.calculateMomentum(priceHistory);
    const support = this.calculateSupport(priceHistory);
    const resistance = this.calculateResistance(priceHistory);
    
    let profitPotential = 0;
    let confidence = 0;
    let strategy = '';
    let targetPrice = currentPrice;

    // Mean reversion arbitrage
    if (currentPrice < support * 0.98 && volatility > 3) {
      profitPotential = ((support - currentPrice) / currentPrice) * 100;
      confidence = Math.min(90, 50 + volatility * 2);
      strategy = 'Mean Reversion';
      targetPrice = support;
    }
    // Momentum breakout arbitrage
    else if (currentPrice > resistance * 1.02 && momentum > 2 && priceChange24h > 5) {
      profitPotential = Math.min(15, momentum * 2);
      confidence = Math.min(85, 40 + momentum * 3);
      strategy = 'Momentum Breakout';
      targetPrice = currentPrice * (1 + profitPotential / 100);
    }
    // Volatility arbitrage
    else if (volatility > 8 && Math.abs(momentum) > 3) {
      profitPotential = Math.min(12, volatility);
      confidence = Math.min(80, 30 + volatility);
      strategy = 'Volatility Arbitrage';
      targetPrice = currentPrice * (1 + profitPotential / 100);
    }
    // Oversold bounce arbitrage
    else if (priceChange24h < -8 && currentPrice < support && momentum < -5) {
      profitPotential = Math.abs(priceChange24h) * 0.6;
      confidence = Math.min(75, 25 + Math.abs(priceChange24h));
      strategy = 'Oversold Bounce';
      targetPrice = support;
    }

    if (profitPotential > 1 && confidence > 40) {
      return {
        symbol: crypto.symbol,
        cryptoId: crypto.id,
        currentPrice,
        targetPrice,
        profitPotential,
        confidence,
        timeWindow: 300, // 5 minutes
        strategy
      };
    }

    return null;
  }

  private calculateVolatility(prices: number[]): number {
    if (prices.length < 5) return 0;
    
    const recent = prices.slice(-10);
    const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
    const variance = recent.reduce((acc, price) => acc + Math.pow(price - mean, 2), 0) / recent.length;
    const stdDev = Math.sqrt(variance);
    
    return (stdDev / mean) * 100;
  }

  private calculateMomentum(prices: number[]): number {
    if (prices.length < 5) return 0;
    
    const recent = prices.slice(-5);
    const older = prices.slice(-10, -5);
    
    if (older.length === 0) return 0;
    
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
    
    return ((recentAvg - olderAvg) / olderAvg) * 100;
  }

  private calculateSupport(prices: number[]): number {
    if (prices.length < 10) return Math.min(...prices);
    
    const recent = prices.slice(-20);
    const sortedPrices = [...recent].sort((a, b) => a - b);
    
    // Support is around 20th percentile
    const supportIndex = Math.floor(sortedPrices.length * 0.2);
    return sortedPrices[supportIndex];
  }

  private calculateResistance(prices: number[]): number {
    if (prices.length < 10) return Math.max(...prices);
    
    const recent = prices.slice(-20);
    const sortedPrices = [...recent].sort((a, b) => b - a);
    
    // Resistance is around 80th percentile
    const resistanceIndex = Math.floor(sortedPrices.length * 0.2);
    return sortedPrices[resistanceIndex];
  }

  private async executeArbitrageSell(userId: number, crypto: any, position: any, sellRatio: number, reason: string): Promise<void> {
    const currentPrice = parseFloat(crypto.currentPrice);
    const positionAmount = parseFloat(position.amount);
    const sellAmount = positionAmount * sellRatio;
    const totalValue = sellAmount * currentPrice;

    console.log(`🔴 ARBITRAGE SELL: ${sellAmount.toFixed(6)} ${crypto.symbol} at $${currentPrice.toFixed(6)} - ${reason}`);

    try {
      const result = await binanceService.executeRealTrade(crypto.symbol, 'SELL', sellAmount, userId);
      
      if (result.success) {
        console.log(`🎯 BINANCE ARBITRAGE SELL: ${sellAmount.toFixed(6)} ${crypto.symbol}`);
        
        await this.updatePortfolioAfterSell(userId, position.cryptoId, sellAmount);
        
        const user = await storage.getUser(userId);
        if (user) {
          const newBalance = parseFloat(user.balance) + totalValue;
          await storage.updateUserBalance(userId, newBalance.toString());
        }

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
              profit: '0.00'
            }
          });
        }

      } else {
        console.log(`❌ Binance arbitrage sell failed: ${result.message}`);
      }
    } catch (error) {
      console.log(`❌ Arbitrage sell error for ${crypto.symbol}:`, error);
    }
  }

  private async executeArbitrageBuy(userId: number, crypto: any, opportunity: ArbitrageOpportunity, balance: number): Promise<void> {
    const investAmount = Math.min(balance * 0.8, balance - 0.5); // Invest 80%, keep $0.50 reserve
    const quantity = investAmount / opportunity.currentPrice;

    const reason = `${opportunity.strategy}: Target +${opportunity.profitPotential.toFixed(2)}%, Confidence ${opportunity.confidence.toFixed(1)}%`;

    console.log(`🟢 ARBITRAGE BUY: ${quantity.toFixed(6)} ${crypto.symbol} at $${opportunity.currentPrice.toFixed(6)} - ${reason}`);

    try {
      const result = await binanceService.executeRealTrade(crypto.symbol, 'BUY', quantity, userId);
      
      if (result.success) {
        console.log(`🎯 BINANCE ARBITRAGE BUY: ${quantity.toFixed(6)} ${crypto.symbol}`);
        
        await this.updatePortfolioAfterBuy(userId, crypto.id, quantity, opportunity.currentPrice);
        
        const newBalance = balance - investAmount;
        await storage.updateUserBalance(userId, newBalance.toString());

        const tradeData: InsertTrade = {
          userId,
          cryptoId: crypto.id,
          type: 'buy',
          amount: quantity.toString(),
          price: opportunity.currentPrice.toString(),
          total: investAmount.toString(),
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
              price: opportunity.currentPrice.toFixed(6),
              total: investAmount.toFixed(2),
              strategy: reason,
              profit: '0.00'
            }
          });
        }

      } else {
        console.log(`❌ Binance arbitrage buy failed: ${result.message}`);
      }
    } catch (error) {
      console.log(`❌ Arbitrage buy error for ${crypto.symbol}:`, error);
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

export const arbitrageTradingStrategy = new ArbitrageTradingStrategy();