
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
    const user = await storage.getUser(userId);

    if (!user) {
      return [];
    }

    const currentBalance = parseFloat(user.balance || '0');
    const profitBalance = parseFloat(user.profitBalance || '0');

    // Get current portfolio value
    const portfolio = await storage.getUserPortfolio(userId);
    let currentPortfolioValue = 0;
    
    for (const position of portfolio) {
      const crypto = await storage.getCryptocurrency(position.cryptoId);
      if (crypto) {
        const currentPrice = parseFloat(crypto.currentPrice);
        const amount = parseFloat(position.amount);
        currentPortfolioValue += (amount * currentPrice);
      }
    }

    // Total trading value = main balance + portfolio value (EXCLUDING profit balance)
    const currentTotalValue = currentBalance + currentPortfolioValue;

    console.log(`📊 Portfolio Performance: Əsas Balans: $${currentBalance}, Portfolio: $${currentPortfolioValue.toFixed(2)}, Kar Balansı (Ayrı): $${profitBalance}, Trading Dəyəri: $${currentTotalValue.toFixed(2)}`);

    // Create performance data based on trading value only
    const performanceData = [];
    let intervals;
    
    // Determine intervals based on timeframe
    if (hours <= 1) {
      intervals = 12; // 5-minute intervals for 1 hour
    } else if (hours <= 6) {
      intervals = 24; // 15-minute intervals for 6 hours
    } else if (hours <= 24) {
      intervals = 48; // 30-minute intervals for 1 day
    } else if (hours <= 72) {
      intervals = 36; // 2-hour intervals for 3 days
    } else if (hours <= 168) {
      intervals = 42; // 4-hour intervals for 1 week
    } else {
      intervals = 60; // 12-hour intervals for 1 month
    }

    // Generate realistic historical data points for trading performance
    for (let i = 0; i < intervals; i++) {
      let timeBack;
      
      if (hours <= 1) {
        timeBack = ((intervals - 1 - i) * 5) * 60 * 1000; // 5 minutes
      } else if (hours <= 6) {
        timeBack = ((intervals - 1 - i) * 15) * 60 * 1000; // 15 minutes  
      } else if (hours <= 24) {
        timeBack = ((intervals - 1 - i) * 30) * 60 * 1000; // 30 minutes
      } else if (hours <= 72) {
        timeBack = ((intervals - 1 - i) * 2) * 60 * 60 * 1000; // 2 hours
      } else if (hours <= 168) {
        timeBack = ((intervals - 1 - i) * 4) * 60 * 60 * 1000; // 4 hours
      } else {
        timeBack = ((intervals - 1 - i) * 12) * 60 * 60 * 1000; // 12 hours
      }
      
      const timestamp = new Date(Date.now() - timeBack);

      // For historical data, simulate trading performance without profit balance
      const historicalTradingRatio = 1 - (hoursBack * 0.01); // More conservative growth for trading only
      const minValue = Math.max(1, currentTotalValue * 0.1); // Use 10% of current value as minimum
      const historicalTradingValue = Math.max(minValue, currentTotalValue * historicalTradingRatio);

      const finalValue = parseFloat(historicalTradingValue.toFixed(2));
      performanceData.push({
        timestamp: timestamp.toISOString(),
        value: finalValue.toString()
      });

      if (i === intervals - 1) {
        console.log(`🔍 Latest trading performance data point: $${finalValue.toFixed(2)}`);
      }
    }

    return performanceData;
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
