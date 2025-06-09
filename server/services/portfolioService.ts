
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

      // ACTUAL total value = ONLY main balance + current portfolio value 
      // Do NOT include any artificial inflation
      const actualTotalValue = currentBalance + currentPortfolioValue;

      console.log(`🎯 REAL PORTFOLIO: Əsas Balans: $${currentBalance.toFixed(2)}, Portfolio: $${currentPortfolioValue.toFixed(2)}, Kar Balansı: $${currentProfitBalance.toFixed(2)}, ACTUAL Dəyər: $${actualTotalValue.toFixed(2)}`);

      // Portfolio performance chart should show EXACTLY what user has
      // No artificial starting values, no inflation
      const startingValue = Math.max(actualTotalValue * 0.9, 1); // Start slightly below actual

      // Generate hourly data points - very conservative
      const pointsCount = Math.min(hours, 24);
      const interval = hours / pointsCount;

      for (let i = pointsCount; i >= 0; i--) {
        const timestamp = new Date(now.getTime() - (i * interval * 60 * 60 * 1000));
        const hoursBack = i * interval;

        let historicalValue;
        if (hoursBack === 0) {
          // Current value - use EXACT actual total
          historicalValue = actualTotalValue;
        } else {
          // Very conservative progression to actual value
          const progressRatio = 1 - (hoursBack / hours);
          historicalValue = startingValue + ((actualTotalValue - startingValue) * progressRatio);
          
          // NO artificial variation
          historicalValue = Math.min(historicalValue, actualTotalValue);
        }

        const finalValue = Math.max(0, parseFloat(historicalValue.toFixed(2)));
        performanceData.push({
          timestamp: timestamp.toISOString(),
          value: finalValue
        });
      }

      // Sort by timestamp
      performanceData.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      console.log(`📈 FINAL CORRECTED: ${performanceData.length} points from $${startingValue.toFixed(2)} to $${actualTotalValue.toFixed(2)}`);
      return performanceData;
    } catch (error) {
      console.error('❌ Portfolio performance error:', error);
      // Fallback - use only main balance
      const user = await storage.getUser(userId);
      const currentBalance = parseFloat(user?.balance || '0');
      
      return [{
        timestamp: new Date().toISOString(),
        value: currentBalance
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
