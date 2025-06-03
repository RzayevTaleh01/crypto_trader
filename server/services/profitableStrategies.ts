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

  // Advanced Momentum Breakout Strategy with profit-taking
  static async executeBreakoutStrategy(userId: number, crypto: any, balance: number, riskLevel: number): Promise<TradingSignal> {
    const currentPrice = parseFloat(crypto.currentPrice);
    const priceChange = parseFloat(crypto.priceChange24h);
    
    // Priority: Check for sell opportunities first
    const portfolioItem = await storage.getPortfolioItem(userId, crypto.id);
    if (portfolioItem) {
      const avgPrice = parseFloat(portfolioItem.averagePrice);
      const profitPercent = ((currentPrice - avgPrice) / avgPrice) * 100;
      const holdingAmount = parseFloat(portfolioItem.amount);
      
      // Take profits on strong gains (momentum strategy)
      if (profitPercent > 3) {
        return {
          action: 'sell',
          confidence: 0.9,
          amount: holdingAmount * 0.7, // Sell 70% for profits
          reason: `Momentum profit: ${profitPercent.toFixed(2)}% gain captured`
        };
      }
      
      // Stop loss on significant drops
      if (profitPercent < -3) {
        return {
          action: 'sell',
          confidence: 0.95,
          amount: holdingAmount * 0.6, // Sell 60% to cut losses
          reason: `Momentum stop-loss: ${profitPercent.toFixed(2)}% loss prevention`
        };
      }
    }
    
    // Only buy on strong upward momentum if not heavily invested
    const currentHolding = portfolioItem ? parseFloat(portfolioItem.totalInvested) : 0;
    const maxPosition = balance * 0.2 * (riskLevel / 10);
    
    if (priceChange > 4 && currentHolding < maxPosition) {
      return {
        action: 'buy',
        confidence: 0.85,
        amount: (maxPosition - currentHolding) / currentPrice,
        reason: `Momentum breakout: ${priceChange.toFixed(2)}% surge entry`
      };
    }
    
    return { action: 'hold', confidence: 0, amount: 0, reason: 'No momentum signal' };
  }

  // Smart DCA Strategy with profit-taking
  static async executeDCAStrategy(userId: number, crypto: any, balance: number, riskLevel: number): Promise<TradingSignal> {
    const currentPrice = parseFloat(crypto.currentPrice);
    const priceChange = parseFloat(crypto.priceChange24h);
    
    // Priority: Sell if profitable
    const portfolioItem = await storage.getPortfolioItem(userId, crypto.id);
    if (portfolioItem) {
      const avgPrice = parseFloat(portfolioItem.averagePrice);
      const profitPercent = ((currentPrice - avgPrice) / avgPrice) * 100;
      const holdingAmount = parseFloat(portfolioItem.amount);
      
      // Take profits at 2% for DCA strategy
      if (profitPercent > 2) {
        return {
          action: 'sell',
          confidence: 0.9,
          amount: holdingAmount * 0.4, // Sell 40% gradually
          reason: `DCA profit: ${profitPercent.toFixed(2)}% gradual exit`
        };
      }
    }
    
    // Buy on dips with position sizing
    const currentHolding = portfolioItem ? parseFloat(portfolioItem.totalInvested) : 0;
    const maxDCAPosition = balance * 0.3 * (riskLevel / 10);
    
    if (priceChange < -2 && currentHolding < maxDCAPosition) {
      return {
        action: 'buy',
        confidence: 0.8,
        amount: Math.min(balance * 0.1, maxDCAPosition - currentHolding) / currentPrice,
        reason: `DCA entry: ${priceChange.toFixed(2)}% dip accumulation`
      };
    }
    
    return { action: 'hold', confidence: 0, amount: 0, reason: 'No DCA opportunity' };
  }

  // Advanced Quick Profit Strategy - High frequency profit capture
  static async executeQuickProfitStrategy(userId: number, crypto: any, balance: number, riskLevel: number): Promise<TradingSignal> {
    const currentPrice = parseFloat(crypto.currentPrice);
    const priceChange = parseFloat(crypto.priceChange24h);
    const portfolioItem = await storage.getPortfolioItem(userId, crypto.id);
    
    if (portfolioItem) {
      const avgPrice = parseFloat(portfolioItem.averagePrice);
      const profitPercent = ((currentPrice - avgPrice) / avgPrice) * 100;
      const holdingAmount = parseFloat(portfolioItem.amount);
      
      // Immediate profit taking on any gain (quick profit strategy)
      if (profitPercent > 0.5) {
        return {
          action: 'sell',
          confidence: 0.95,
          amount: holdingAmount * 0.6, // Sell 60% for quick profit
          reason: `Quick profit: ${profitPercent.toFixed(2)}% immediate gain`
        };
      }
      
      // Quick stop loss to prevent losses
      if (profitPercent < -1.5) {
        return {
          action: 'sell',
          confidence: 0.9,
          amount: holdingAmount * 0.3, // Sell 30% to reduce risk
          reason: `Quick stop: ${profitPercent.toFixed(2)}% loss prevention`
        };
      }
    }
    
    // Only buy if very favorable conditions and small position
    const currentHolding = portfolioItem ? parseFloat(portfolioItem.totalInvested) : 0;
    const maxQuickPosition = balance * 0.15 * (riskLevel / 10);
    
    if (priceChange < -3 && currentHolding < maxQuickPosition) {
      return {
        action: 'buy',
        confidence: 0.8,
        amount: (maxQuickPosition - currentHolding) / currentPrice,
        reason: `Quick entry: ${priceChange.toFixed(2)}% flash dip`
      };
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