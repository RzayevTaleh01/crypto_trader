import { storage } from "../storage";

class PortfolioService {
  async getUserPortfolioWithDetails(userId: number) {
    const portfolio = await storage.getUserPortfolio(userId);
    
    const portfolioWithDetails = portfolio.map((item: any) => {
      // Portfolio data already includes cryptocurrency details from the join
      const currentPrice = parseFloat(item.cryptocurrency?.currentPrice || "0");
      const amount = parseFloat(item.amount);
      const averagePrice = parseFloat(item.averagePrice);
      const totalInvested = parseFloat(item.totalInvested);
      
      // Calculate current value based on amount and current price
      const currentValue = amount * currentPrice;
      
      // Calculate P&L: difference between current value and total invested
      const pnl = currentValue - totalInvested;
      
      // Calculate P&L percentage: (current value - total invested) / total invested * 100
      const pnlPercentage = totalInvested > 0 ? (pnl / totalInvested) * 100 : 0;

      console.log(`💰 Profit calc: ${item.cryptocurrency?.symbol} - Current: $${currentPrice}, Amount: ${amount}, Total Invested: $${totalInvested}, Current Value: $${currentValue.toFixed(4)}, P&L: ${pnlPercentage.toFixed(2)}%`);

      return {
        ...item,
        currentValue: currentValue.toString(),
        pnl: pnl.toString(),
        pnlPercentage: pnlPercentage.toString()
      };
    });

    return portfolioWithDetails;
  }

  async getPortfolioPerformance(userId: number, hours: number) {
    const portfolio = await storage.getUserPortfolio(userId);
    const trades = await storage.getUserTrades(userId, 100); // Get more trades for better data
    
    if (portfolio.length === 0) {
      return [];
    }

    // Calculate portfolio performance based on actual trading history
    const performanceData = [];
    const intervals = Math.min(hours, 24);
    
    // Get current portfolio value
    let currentTotalValue = 0;
    for (const item of portfolio) {
      const crypto = await storage.getCryptocurrency(item.cryptoId);
      const currentPrice = parseFloat(crypto?.currentPrice || "0");
      currentTotalValue += parseFloat(item.amount) * currentPrice;
    }
    
    // Calculate historical portfolio values based on price history
    for (let i = 0; i < intervals; i++) {
      const hoursBack = (intervals - 1 - i);
      const timestamp = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
      
      let historicalValue = 0;
      
      // For each portfolio item, get historical price
      for (const item of portfolio) {
        const priceHistory = await storage.getPriceHistory(item.cryptoId, hoursBack + 1);
        let historicalPrice;
        
        if (priceHistory.length > 0) {
          historicalPrice = parseFloat(priceHistory[0].price);
        } else {
          // Fallback to current price if no historical data
          const crypto = await storage.getCryptocurrency(item.cryptoId);
          historicalPrice = parseFloat(crypto?.currentPrice || "0");
        }
        
        historicalValue += parseFloat(item.amount) * historicalPrice;
      }
      
      performanceData.push({
        timestamp: timestamp.toISOString(),
        value: historicalValue
      });
    }
    
    return performanceData;
  }

  async getPortfolioSummary(userId: number) {
    const portfolioWithDetails = await this.getUserPortfolioWithDetails(userId);
    
    const totalValue = portfolioWithDetails.reduce((sum, item) => {
      return sum + parseFloat(item.currentValue);
    }, 0);

    const totalInvested = portfolioWithDetails.reduce((sum, item) => {
      return sum + parseFloat(item.totalInvested);
    }, 0);

    const totalPnL = totalValue - totalInvested;
    const totalPnLPercentage = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;

    return {
      totalValue: totalValue.toString(),
      totalInvested: totalInvested.toString(),
      totalPnL: totalPnL.toString(),
      totalPnLPercentage: totalPnLPercentage.toString(),
      positions: portfolioWithDetails.length
    };
  }
}

export const portfolioService = new PortfolioService();
