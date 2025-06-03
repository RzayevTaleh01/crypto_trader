import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    const connectWebSocket = () => {
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('WebSocket connected');
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          switch (data.type) {
            case 'priceUpdate':
              // Invalidate cryptocurrency queries to refresh prices
              queryClient.invalidateQueries({ queryKey: ['/api/cryptocurrencies'] });
              break;
              
            case 'trade':
              // Invalidate trade-related queries
              queryClient.invalidateQueries({ queryKey: ['/api/trades/user'] });
              queryClient.invalidateQueries({ queryKey: ['/api/analytics/user'] });
              queryClient.invalidateQueries({ queryKey: ['/api/portfolio/user'] });
              break;
              
            case 'botStatus':
              // Invalidate bot settings
              queryClient.invalidateQueries({ queryKey: ['/api/bot-settings'] });
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
        setTimeout(connectWebSocket, 3000); // Reconnect after 3 seconds
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
  }, [queryClient]);

  return { socket: wsRef.current };
}
