import { storage } from '../storage';

export class ProfitOptimizer {
  
  // Enhanced momentum trading with profit targets
  static async executeMomentumProfitStrategy(userId: number) {
    const cryptos = await storage.getAllCryptocurrencies();
    const user = await storage.getUser(userId);
    
    if (!user || cryptos.length === 0) return;
    
    const balance = parseFloat(user.balance);
    
    // Find cryptocurrencies with strong momentum (>3% change)
    const momentumCoins = cryptos.filter(crypto => {
      const change = parseFloat(crypto.priceChange24h);
      return Math.abs(change) > 3;
    }).sort((a, b) => Math.abs(parseFloat(b.priceChange24h)) - Math.abs(parseFloat(a.priceChange24h)));
    
    for (const crypto of momentumCoins.slice(0, 2)) {
      const priceChange = parseFloat(crypto.priceChange24h);
      const currentPrice = parseFloat(crypto.currentPrice);
      const portfolioItem = await storage.getPortfolioItem(userId, crypto.id);
      
      // Buy on strong dips (-3% or more)
      if (priceChange < -3 && balance > 50) {
        const buyAmount = Math.min(balance * 0.1, 50) / currentPrice; // 10% of balance or $50 max
        
        try {
          const tradingEngine = await import('./tradingEngine');
          await tradingEngine.tradingEngine.executeTrade({
            userId,
            cryptoId: crypto.id,
            type: 'buy',
            amount: buyAmount.toFixed(6),
            price: currentPrice.toFixed(2),
            total: (buyAmount * currentPrice).toFixed(2),
            pnl: '0.00',
            isBot: true
          });
          
          console.log(`🚀 MOMENTUM BUY: ${crypto.symbol} - ${priceChange.toFixed(2)}% dip`);
        } catch (error) {
          console.log(`Buy execution failed for ${crypto.symbol}`);
        }
      }
      
      // Sell for profit (>2% gain from average price)
      if (portfolioItem) {
        const avgPrice = parseFloat(portfolioItem.averagePrice);
        const profitPercent = ((currentPrice - avgPrice) / avgPrice) * 100;
        
        if (profitPercent > 2) {
          const sellAmount = parseFloat(portfolioItem.amount) * 0.6; // Sell 60%
          const profit = (currentPrice - avgPrice) * sellAmount;
          
          try {
            const tradingEngine = await import('./tradingEngine');
            await tradingEngine.tradingEngine.executeTrade({
              userId,
              cryptoId: crypto.id,
              type: 'sell',
              amount: sellAmount.toFixed(6),
              price: currentPrice.toFixed(2),
              total: (sellAmount * currentPrice).toFixed(2),
              pnl: profit.toFixed(2),
              isBot: true
            });
            
            console.log(`💰 PROFIT TAKEN: ${crypto.symbol} - $${profit.toFixed(2)} profit`);
          } catch (error) {
            console.log(`Sell execution failed for ${crypto.symbol}`);
          }
        }
      }
    }
  }
  
  // Scalping strategy for quick profits
  static async executeScalpingStrategy(userId: number) {
    const cryptos = await storage.getAllCryptocurrencies();
    const user = await storage.getUser(userId);
    
    if (!user || cryptos.length === 0) return;
    
    const balance = parseFloat(user.balance);
    
    // Find high volatility coins for scalping
    const volatileCoins = cryptos.filter(crypto => {
      const change = Math.abs(parseFloat(crypto.priceChange24h));
      return change > 2 && change < 8; // Sweet spot for scalping
    });
    
    for (const crypto of volatileCoins.slice(0, 1)) {
      const portfolioItem = await storage.getPortfolioItem(userId, crypto.id);
      const currentPrice = parseFloat(crypto.currentPrice);
      
      if (portfolioItem) {
        const avgPrice = parseFloat(portfolioItem.averagePrice);
        const quickProfit = ((currentPrice - avgPrice) / avgPrice) * 100;
        
        // Quick profit taking at 0.5% for scalping
        if (quickProfit > 0.5) {
          const sellAmount = parseFloat(portfolioItem.amount) * 0.3; // Sell 30% for quick profit
          const profit = (currentPrice - avgPrice) * sellAmount;
          
          try {
            const tradingEngine = await import('./tradingEngine');
            await tradingEngine.tradingEngine.executeTrade({
              userId,
              cryptoId: crypto.id,
              type: 'sell',
              amount: sellAmount.toFixed(6),
              price: currentPrice.toFixed(2),
              total: (sellAmount * currentPrice).toFixed(2),
              pnl: profit.toFixed(2),
              isBot: true
            });
            
            console.log(`⚡ SCALP PROFIT: ${crypto.symbol} - $${profit.toFixed(2)} quick gain`);
          } catch (error) {
            console.log(`Scalp execution failed for ${crypto.symbol}`);
          }
        }
      }
    }
  }
  
  // Execute all profitable strategies
  static async executeAllStrategies(userId: number) {
    try {
      await this.executeMomentumProfitStrategy(userId);
      await this.executeScalpingStrategy(userId);
    } catch (error) {
      console.log('Profit optimization error:', error);
    }
  }
}