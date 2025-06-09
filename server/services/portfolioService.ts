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

  async getPortfolioPerformance(userId: number, hours: number = 24): Promise<any[]> {
    try {
      const performanceData = [];
      const now = new Date();

      // Get current user balance and portfolio
      const user = await storage.getUser(userId);
      const portfolio = await storage.getPortfolioForUser(userId);
      const allTrades = await storage.getTradesForUser(userId);

      if (!user) {
        console.log('❌ User not found for portfolio performance');
        return [];
      }

      const currentBalance = parseFloat(user.balance || '0');
      const currentProfitBalance = parseFloat(user.profitBalance || '0');

      // Calculate current portfolio value
      let currentPortfolioValue = 0;
      for (const position of portfolio) {
        const crypto = await storage.getCryptocurrency(position.cryptoId);
        if (crypto) {
          const currentPrice = parseFloat(crypto.currentPrice);
          const amount = parseFloat(position.amount);
          currentPortfolioValue += (amount * currentPrice);
        }
      }

      // Real total value = ONLY main balance + portfolio value (trading capital)
      // Profit balance is stored separately and not part of trading performance
      const currentTotalValue = currentBalance + currentPortfolioValue;

      console.log(`📊 Portfolio Performance: Əsas Balans: $${currentBalance}, Portfolio: $${currentPortfolioValue.toFixed(2)}, Kar Balansı: $${currentProfitBalance}, Trading Dəyəri: $${currentTotalValue.toFixed(2)}`);

      // Calculate investment history for realistic simulation
      const buyTrades = allTrades.filter(t => t.type === 'BUY');
      const sellTrades = allTrades.filter(t => t.type === 'SELL');
      const totalInvested = buyTrades.reduce((sum, trade) => sum + parseFloat(trade.total || '0'), 0);
      
      // Use actual current total value as base, not inflated historical investment
      const startingValue = Math.max(currentTotalValue - 5, 10); // Start slightly lower than current

      // Generate hourly data points
      const pointsCount = Math.min(hours, 24); // Max 24 points for readability
      const interval = hours / pointsCount;

      for (let i = pointsCount; i >= 0; i--) {
        const timestamp = new Date(now.getTime() - (i * interval * 60 * 60 * 1000));
        const hoursBack = i * interval;

        let historicalValue;
        if (hoursBack === 0) {
          // Current value - use actual current total
          historicalValue = currentTotalValue;
        } else {
          // Calculate realistic progression that ends at current value
          const progressRatio = 1 - (hoursBack / hours);
          
          // Simple linear progression from start to current value
          const baseProgression = startingValue + ((currentTotalValue - startingValue) * progressRatio);
          
          // Add small market variation
          const variation = Math.sin(hoursBack / 8) * (currentTotalValue * 0.005); // 0.5% variation
          
          historicalValue = baseProgression + variation;
        }

        const finalValue = Math.max(0, parseFloat(historicalValue.toFixed(2)));
        performanceData.push({
          timestamp: timestamp.toISOString(),
          value: finalValue
        });
      }

      // Sort by timestamp to ensure proper order
      performanceData.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      console.log(`📈 Generated ${performanceData.length} performance data points from $${startingValue} to $${currentTotalValue.toFixed(2)}`);
      return performanceData;
    } catch (error) {
      console.error('❌ Portfolio performance error:', error);
      // Return basic fallback data if error occurs
      const user = await storage.getUser(userId);
      const currentBalance = parseFloat(user?.balance || '0');
      const currentProfitBalance = parseFloat(user?.profitBalance || '0');
      const totalValue = currentBalance + currentProfitBalance;
      
      return [{
        timestamp: new Date().toISOString(),
        value: totalValue
      }];
    }
  }

  async getPortfolioSummary(userId: number) {
    const portfolioWithDetails = await this.getUserPortfolioWithDetails(userId);
    const user = await storage.getUser(userId);

    if (!user) {
      return {
        totalValue: "0.00",
        totalInvested: "0.00",
        totalPnL: "0.00",
        totalPnLPercentage: "0.00",
        positions: 0
      };
    }

    const currentBalance = parseFloat(user.balance || '0');
    const profitBalance = parseFloat(user.profitBalance || '0');

    // Portfolio current value
    const portfolioValue = portfolioWithDetails.reduce((sum, item) => {
      return sum + parseFloat(item.currentValue);
    }, 0);

    // Portfolio invested amount
    const portfolioInvested = portfolioWithDetails.reduce((sum, item) => {
      return sum + parseFloat(item.totalInvested);
    }, 0);

    // Total TRADING value = main balance + current portfolio value (EXCLUDING profit balance)
    const totalTradingValue = currentBalance + portfolioValue;

    // Total invested is dynamic based on user's added balance
    const totalInvested = parseFloat(currentBalance) + portfolioInvested;

    // P&L calculation: profit balance (stored separately) + unrealized portfolio profits
    const unrealizedPnL = portfolioValue - portfolioInvested;
    const totalPnL = profitBalance + unrealizedPnL;
    const totalPnLPercentage = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;

    return {
      totalValue: totalTradingValue.toString(), // Only trading value, not including profit balance
      totalInvested: totalInvested.toString(),
      totalPnL: totalPnL.toString(),
      totalPnLPercentage: totalPnLPercentage.toString(),
      positions: portfolioWithDetails.length
    };
  }
}

export const portfolioService = new PortfolioService();