import { useState, useEffect } from 'react';

interface DashboardStats {
  totalProfit: string;
  activeTrades: number;
  winRate: string;
  uptime: string;
  currentBalance: string;
  recentTrades: any[];
  portfolio: any[];
  botStatus: { isActive: boolean };
}

export function useDirectDashboardData(userId: number) {
  const [data, setData] = useState<DashboardStats>({
    totalProfit: '0.00',
    activeTrades: 0,
    winRate: '0',
    uptime: '99.7',
    currentBalance: '0.00',
    recentTrades: [],
    portfolio: [],
    botStatus: { isActive: false }
  });

  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setIsLoading(true);
        
        // Fetch multiple endpoints simultaneously
        const [userRes, tradesRes, portfolioRes, botRes] = await Promise.all([
          fetch(`/api/user/${userId}`),
          fetch('/api/trades/user'),
          fetch('/api/portfolio/user'),
          fetch('/api/bot-settings')
        ]);

        if (userRes.ok && tradesRes.ok && portfolioRes.ok && botRes.ok) {
          const userData = await userRes.json();
          const tradesData = await tradesRes.json();
          const portfolioData = await portfolioRes.json();
          const botData = await botRes.json();

          // Calculate stats from the data
          const trades = tradesData.trades || [];
          const totalPnL = trades.reduce((sum: number, trade: any) => {
            return sum + parseFloat(trade.pnl || '0');
          }, 0);

          const winningTrades = trades.filter((trade: any) => parseFloat(trade.pnl || '0') > 0);
          const winRate = trades.length > 0 ? ((winningTrades.length / trades.length) * 100).toFixed(1) : '0';

          setData({
            totalProfit: totalPnL.toFixed(2),
            activeTrades: portfolioData.portfolio?.length || 0,
            winRate,
            uptime: '99.7',
            currentBalance: userData.user?.balance || '0.00',
            recentTrades: trades.slice(0, 5),
            portfolio: portfolioData.portfolio || [],
            botStatus: { isActive: botData.isActive || false }
          });
        }
      } catch (error) {
        console.log('Dashboard data fetch error:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboardData();
    
    // Update every 5 seconds
    const interval = setInterval(fetchDashboardData, 5000);
    
    return () => clearInterval(interval);
  }, [userId]);

  return { data, isLoading };
}