import { storage } from '../storage';

interface TradingSignal {
  action: 'buy' | 'sell' | 'hold';
  confidence: number;
  amount: number;
  reason: string;
}

export class ProfitableStrategies {
  
  // Advanced Scalping Strategy - High frequency, small profits with smart exits
  static async executeScalpingStrategy(userId: number, crypto: any, balance: number, riskLevel: number): Promise<TradingSignal> {
    const currentPrice = parseFloat(crypto.currentPrice);
    const priceChange = parseFloat(crypto.priceChange24h);
    const volatility = Math.abs(priceChange);
    
    // Always check for sell opportunities first (profit-taking priority)
    const portfolioItem = await storage.getPortfolioItem(userId, crypto.id);
    if (portfolioItem) {
      const avgPrice = parseFloat(portfolioItem.averagePrice);
      const profitPercent = ((currentPrice - avgPrice) / avgPrice) * 100;
      const holdingAmount = parseFloat(portfolioItem.amount);
      
      // Take profits on any positive movement (scalping focuses on quick gains)
      if (profitPercent > 0.3) {
        return {
          action: 'sell',
          confidence: 0.95,
          amount: holdingAmount * 0.8, // Sell 80% for quick profit
          reason: `Scalping exit: ${profitPercent.toFixed(2)}% profit secured`
        };
      }
      
      // Stop loss at -2% to prevent large losses
      if (profitPercent < -2) {
        return {
          action: 'sell',
          confidence: 0.9,
          amount: holdingAmount * 0.5, // Sell half to limit losses
          reason: `Scalping stop-loss: ${profitPercent.toFixed(2)}% loss cut`
        };
      }
    }
    
    // Only buy if no current position or position is small
    const currentHolding = portfolioItem ? parseFloat(portfolioItem.totalInvested) : 0;
    const maxPosition = balance * 0.15 * (riskLevel / 10);
    
    if (currentHolding < maxPosition && volatility > 1.5 && priceChange < -1) {
      return {
        action: 'buy',
        confidence: 0.8,
        amount: (maxPosition - currentHolding) / currentPrice,
        reason: `Scalping entry: ${volatility.toFixed(2)}% volatility, ${priceChange.toFixed(2)}% dip`
      };
    }
    
    return { action: 'hold', confidence: 0, amount: 0, reason: 'No scalping opportunity' };
  }

  // Breakout Strategy - Momentum following
  static async executeBreakoutStrategy(userId: number, crypto: any, balance: number, riskLevel: number): Promise<TradingSignal> {
    const currentPrice = parseFloat(crypto.currentPrice);
    const priceChange = parseFloat(crypto.priceChange24h);
    
    // Strong breakout signals
    if (priceChange > 5) {
      const maxTradeAmount = balance * 0.25 * (riskLevel / 10);
      
      if (balance > maxTradeAmount) {
        return {
          action: 'buy',
          confidence: 0.8,
          amount: maxTradeAmount / currentPrice,
          reason: `Breakout: ${priceChange.toFixed(2)}% surge detected`
        };
      }
    }
    
    // Sell on negative breakouts if holding
    if (priceChange < -3) {
      const portfolioItem = await storage.getPortfolioItem(userId, crypto.id);
      if (portfolioItem) {
        const avgPrice = parseFloat(portfolioItem.averagePrice);
        const lossPercent = ((currentPrice - avgPrice) / avgPrice) * 100;
        
        if (lossPercent < -2) { // Stop loss at 2%
          return {
            action: 'sell',
            confidence: 0.95,
            amount: parseFloat(portfolioItem.amount) * 0.8, // Sell 80%
            reason: `Stop loss: ${lossPercent.toFixed(2)}% loss prevention`
          };
        }
      }
    }
    
    return { action: 'hold', confidence: 0, amount: 0, reason: 'No breakout signal' };
  }

  // DCA Strategy - Dollar Cost Averaging
  static async executeDCAStrategy(userId: number, crypto: any, balance: number, riskLevel: number): Promise<TradingSignal> {
    const currentPrice = parseFloat(crypto.currentPrice);
    const priceChange = parseFloat(crypto.priceChange24h);
    
    // DCA on any dip
    if (priceChange < -1) {
      const dcaAmount = balance * 0.25; // Larger consistent buys
      
      if (balance > dcaAmount) {
        return {
          action: 'buy',
          confidence: 0.7,
          amount: dcaAmount / currentPrice,
          reason: `DCA: ${priceChange.toFixed(2)}% dip accumulation`
        };
      }
    }
    
    return { action: 'hold', confidence: 0, amount: 0, reason: 'No DCA opportunity' };
  }

  // Arbitrage-like Strategy - Quick profit taking
  static async executeQuickProfitStrategy(userId: number, crypto: any, balance: number, riskLevel: number): Promise<TradingSignal> {
    const portfolioItem = await storage.getPortfolioItem(userId, crypto.id);
    
    if (portfolioItem) {
      const currentPrice = parseFloat(crypto.currentPrice);
      const avgPrice = parseFloat(portfolioItem.averagePrice);
      const profitPercent = ((currentPrice - avgPrice) / avgPrice) * 100;
      
      // Quick profit taking at 1% gain
      if (profitPercent > 1) {
        return {
          action: 'sell',
          confidence: 0.85,
          amount: parseFloat(portfolioItem.amount) * 0.5, // Sell half
          reason: `Quick profit: ${profitPercent.toFixed(2)}% gain secured`
        };
      }
    }
    
    return { action: 'hold', confidence: 0, amount: 0, reason: 'No quick profit available' };
  }

  // Multi-strategy execution
  static async executeMultiStrategy(userId: number, crypto: any, balance: number, riskLevel: number): Promise<TradingSignal> {
    // Try strategies in order of profitability
    const strategies = [
      this.executeQuickProfitStrategy,
      this.executeScalpingStrategy,
      this.executeBreakoutStrategy,
      this.executeDCAStrategy
    ];

    for (const strategy of strategies) {
      const signal = await strategy(userId, crypto, balance, riskLevel);
      if (signal.action !== 'hold' && signal.confidence > 0.6) {
        return signal;
      }
    }

    return { action: 'hold', confidence: 0, amount: 0, reason: 'No profitable opportunity' };
  }
}