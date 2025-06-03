import { storage } from "../storage";

class PortfolioService {
  async getUserPortfolioWithDetails(userId: number) {
    const portfolio = await storage.getUserPortfolio(userId);
    
    const portfolioWithDetails = await Promise.all(
      portfolio.map(async (item) => {
        const crypto = await storage.getCryptocurrency(item.cryptoId);
        const currentValue = parseFloat(item.amount) * parseFloat(crypto?.currentPrice || "0");
        const totalInvested = parseFloat(item.totalInvested);
        const pnl = currentValue - totalInvested;
        const pnlPercentage = totalInvested > 0 ? (pnl / totalInvested) * 100 : 0;

        return {
          ...item,
          cryptocurrency: crypto,
          currentValue: currentValue.toString(),
          pnl: pnl.toString(),
          pnlPercentage: pnlPercentage.toString()
        };
      })
    );

    return portfolioWithDetails;
  }

  async getPortfolioPerformance(userId: number, hours: number) {
    const portfolio = await storage.getUserPortfolio(userId);
    
    if (portfolio.length === 0) {
      return [];
    }

    // Get price history for all cryptocurrencies in portfolio
    const performanceData = [];
    const intervals = Math.min(hours, 24); // Max 24 data points
    const step = Math.max(1, Math.floor(hours / intervals));
    
    for (let i = 0; i < intervals; i++) {
      const hoursBack = i * step;
      let totalValue = 0;
      
      for (const item of portfolio) {
        const priceHistory = await storage.getPriceHistory(item.cryptoId, hoursBack + step);
        const historicalPrice = priceHistory.length > 0 
          ? parseFloat(priceHistory[priceHistory.length - 1].price)
          : parseFloat((await storage.getCryptocurrency(item.cryptoId))?.currentPrice || "0");
        
        totalValue += parseFloat(item.amount) * historicalPrice;
      }
      
      performanceData.push({
        timestamp: new Date(Date.now() - hoursBack * 60 * 60 * 1000),
        value: totalValue
      });
    }
    
    return performanceData.reverse(); // Oldest to newest
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
