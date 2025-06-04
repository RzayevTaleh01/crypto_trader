import { useWebSocket } from './useWebSocket';

// Custom hook to replace all API queries with WebSocket data
export function useWebSocketData() {
  const { wsData, isConnected } = useWebSocket();

  // Replace useQuery calls with WebSocket data
  return {
    // Bot Settings
    botSettings: {
      data: wsData.botSettings,
      isLoading: !wsData.botSettings && isConnected
    },
    
    // User data
    user: {
      data: { user: wsData.user },
      isLoading: !wsData.user && isConnected
    },
    
    // Cryptocurrencies
    cryptocurrencies: {
      data: wsData.cryptocurrencies,
      isLoading: wsData.cryptocurrencies.length === 0 && isConnected
    },
    
    // Portfolio
    portfolio: {
      data: wsData.portfolio,
      isLoading: !wsData.portfolio && isConnected
    },
    
    // Trades
    trades: {
      data: wsData.trades,
      isLoading: !wsData.trades && isConnected
    },
    
    // Analytics
    analytics: {
      data: wsData.analytics,
      isLoading: !wsData.analytics && isConnected
    },
    
    // Portfolio Performance
    portfolioPerformance: {
      data: wsData.portfolioPerformance,
      isLoading: wsData.portfolioPerformance.length === 0 && isConnected
    },
    
    // Available strategies (static data)
    availableStrategies: {
      data: {
        success: true,
        strategies: [
          {
            id: "ema_rsi",
            name: "EMA + RSI Strategy",
            description: "Uses EMA crossovers and RSI indicators for entry/exit signals",
            riskLevel: "Medium",
            expectedReturn: "8-15%",
            timeframe: "1-4 hours"
          }
        ]
      }
    },
    
    isConnected
  };
}