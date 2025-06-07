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
    const user = await storage.getUser(userId);

    if (!user) {
      return [];
    }

    const currentBalance = parseFloat(user.balance || '0');
    const profitBalance = parseFloat(user.profitBalance || '0');

    // Calculate current portfolio value accurately
    let currentPortfolioValue = 0;
    for (const item of portfolio) {
      const crypto = await storage.getCryptocurrency(item.cryptoId);
      const currentPrice = parseFloat(crypto?.currentPrice || "0");
      const amount = parseFloat(item.amount);
      currentPortfolioValue += amount * currentPrice;
    }

    // Total value = balance + profit balance + portfolio current value
    const currentTotalValue = currentBalance + profitBalance + currentPortfolioValue;

    console.log(`📊 Portfolio Performance: Balance: $${currentBalance}, Profit: $${profitBalance}, Portfolio: $${currentPortfolioValue.toFixed(2)}, Total: $${currentTotalValue.toFixed(2)}`);

    // Create simple performance data based on actual values
    const performanceData = [];
    const intervals = Math.min(hours, 24);

    // For demo purposes, create realistic historical data based on current values
    for (let i = 0; i < intervals; i++) {
      const hoursBack = (intervals - 1 - i);
      const timestamp = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

      // Calculate historical portfolio value with small variations
      let historicalPortfolioValue = currentPortfolioValue;

      for (const item of portfolio) {
        const crypto = await storage.getCryptocurrency(item.cryptoId);
        const currentPrice = parseFloat(crypto?.currentPrice || "0");
        const priceChange24h = parseFloat(crypto?.priceChange24h || "0");

        // Estimate historical price based on recent price changes
        const hourlyChange = priceChange24h / 24;
        const historicalPrice = currentPrice * (1 - (hourlyChange * hoursBack / 100));
        const amount = parseFloat(item.amount);

        historicalPortfolioValue += (amount * historicalPrice) - (amount * currentPrice);
      }

      // Keep balances constant for simplicity (they don't change as frequently)
      const historicalTotalValue = currentBalance + profitBalance + Math.max(0, historicalPortfolioValue);

      const finalValue = parseFloat(historicalTotalValue.toFixed(2));
      performanceData.push({
        timestamp: timestamp.toISOString(),
        value: finalValue.toString()
      });

      if (i === intervals - 1) {
        console.log(`🔍 Latest performance data point: $${finalValue.toFixed(2)}`);
      }
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