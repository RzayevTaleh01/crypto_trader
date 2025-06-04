import { useState, useEffect, useRef } from 'react';

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  
  // WebSocket-only data states
  const [wsData, setWsData] = useState<{
    cryptocurrencies: any[];
    portfolio: any[];
    trades: any[];
    analytics: any;
    botSettings: any;
    user: any;
    portfolioPerformance: any[];
  }>({
    cryptocurrencies: [],
    portfolio: [],
    trades: [],
    analytics: null,
    botSettings: null,
    user: null,
    portfolioPerformance: []
  });

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    const connectWebSocket = () => {
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        
        // Request initial data when connected
        if (wsRef.current) {
          wsRef.current.send(JSON.stringify({ 
            type: 'requestInitialData', 
            userId: 1 
          }));
        }
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          switch (data.type) {
            case 'initialData':
              setWsData(data.data);
              break;
              
            case 'priceUpdate':
              setWsData(prev => ({
                ...prev,
                cryptocurrencies: prev.cryptocurrencies.map((crypto: any) => 
                  crypto.symbol === data.data.symbol 
                    ? { ...crypto, currentPrice: data.data.price, priceChange24h: data.data.change24h }
                    : crypto
                )
              }));
              break;
              
            case 'trade':
              setWsData(prev => ({
                ...prev,
                trades: [data.data, ...prev.trades.slice(0, 49)],
                analytics: data.analytics || prev.analytics,
                portfolio: data.portfolio || prev.portfolio
              }));
              break;
              
            case 'botStatus':
              setWsData(prev => ({
                ...prev,
                botSettings: prev.botSettings ? { ...prev.botSettings, ...data.data } : data.data
              }));
              break;
              
            case 'balanceUpdate':
              setWsData(prev => ({
                ...prev,
                user: prev.user ? { ...prev.user, balance: data.data.balance } : { balance: data.data.balance },
                analytics: data.analytics || prev.analytics
              }));
              break;
              
            case 'portfolioUpdate':
              setWsData(prev => ({
                ...prev,
                portfolio: data.data
              }));
              break;
              
            case 'performanceUpdate':
              setWsData(prev => ({
                ...prev,
                portfolioPerformance: data.data
              }));
              break;
              
            default:
              console.log('Unknown WebSocket message type:', data.type);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      wsRef.current.onclose = () => {
        console.log('WebSocket disconnected, attempting to reconnect...');
        setIsConnected(false);
        setTimeout(connectWebSocket, 3000);
      };

      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return { 
    socket: wsRef.current, 
    isConnected,
    wsData
  };
}
