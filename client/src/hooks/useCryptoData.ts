import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';

export function useCryptoData() {
  const [priceUpdates, setPriceUpdates] = useState<Map<string, any>>(new Map());

  const { data: cryptocurrencies = [], isLoading } = useQuery({
    queryKey: ['/api/cryptocurrencies'],
  });

  // Update prices with real-time WebSocket data
  useEffect(() => {
    const handlePriceUpdate = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'priceUpdate') {
          setPriceUpdates(prev => new Map(prev.set(data.data.symbol, data.data)));
        }
      } catch (error) {
        console.error('Error handling price update:', error);
      }
    };

    // This would be connected through the useWebSocket hook
    // For now, we'll rely on the query refetch interval
    
    return () => {
      // Cleanup
    };
  }, []);

  // Merge real-time updates with queried data
  const enrichedCryptocurrencies = cryptocurrencies.map((crypto: any) => {
    const update = priceUpdates.get(crypto.symbol);
    if (update) {
      return {
        ...crypto,
        currentPrice: update.price.toString(),
        priceChange24h: update.change24h.toString()
      };
    }
    return crypto;
  });

  return {
    cryptocurrencies: enrichedCryptocurrencies,
    isLoading,
    priceUpdates
  };
}
