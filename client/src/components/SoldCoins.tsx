import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Clock, DollarSign } from "lucide-react";
import { useWebSocket } from "@/hooks/useWebSocket";

interface SoldCoin {
  id: number;
  symbol: string;
  name: string;
  soldQuantity: string;
  sellPrice: string;
  buyPrice: string;
  sellValue: string;
  profit: string;
  profitPercentage: string;
  soldAt: string;
}

interface SoldCoinsProps {
  userId: number;
}

export default function SoldCoins({ userId }: SoldCoinsProps) {
  const [soldCoins, setSoldCoins] = useState<SoldCoin[]>([]);
  const { socket } = useWebSocket();

  // Primary data source: API query for initial load
  const { data: apiSoldCoins, isLoading } = useQuery<SoldCoin[]>({
    queryKey: [`/api/trades/sold/${userId}`],
    enabled: !!userId,
  });

  // Initialize sold coins from API data
  useEffect(() => {
    if (apiSoldCoins) {
      setSoldCoins(apiSoldCoins);
    }
  }, [apiSoldCoins]);

  // Listen for real-time updates via WebSocket
  useEffect(() => {
    if (!socket) return;

    const handleSoldCoinsUpdate = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'soldCoinsUpdate' && message.data) {
          // Refresh sold coins data
          queryClient.invalidateQueries({ queryKey: ['/api/trades/sold'] });
        } else if (message.type === 'tradeUpdate' && message.data?.type === 'SELL_ALL') {
          // Handle sell all notification - refresh data
          queryClient.invalidateQueries({ queryKey: ['/api/trades/sold'] });
        } else if (message.type === 'statsUpdate') {
          // Ignore stats updates here - handled by stats component
          return;
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    socket.addEventListener('message', handleSoldCoinsUpdate);
    return () => socket.removeEventListener('message', handleSoldCoinsUpdate);
  }, [socket]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <DollarSign className="h-5 w-5 text-crypto-blue" />
            <span>Sold Coins</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-16 bg-muted rounded"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!soldCoins || soldCoins.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <DollarSign className="h-5 w-5 text-crypto-blue" />
            <span>Sold Coins</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <DollarSign className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No coins sold yet</p>
            <p className="text-sm text-muted-foreground">Sold coins will appear here after trading</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Calculate totals for summary
  const totalProfit = soldCoins.reduce((sum, coin) => sum + parseFloat(coin.profit || '0'), 0);
  const totalSellValue = soldCoins.reduce((sum, coin) => sum + parseFloat(coin.sellValue || '0'), 0);
  const profitableCoins = soldCoins.filter(coin => parseFloat(coin.profit || '0') > 0);
  const losingCoins = soldCoins.filter(coin => parseFloat(coin.profit || '0') < 0);
  const winRate = soldCoins.length > 0 ? (profitableCoins.length / soldCoins.length) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <DollarSign className="h-5 w-5 text-crypto-blue" />
            <span>Sold Coins</span>
          </div>
          <span className="text-sm text-muted-foreground">
            {soldCoins.length} transactions
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Summary Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 p-4 bg-muted/50 rounded-lg">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              ${totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(2)}
            </div>
            <div className="text-sm text-muted-foreground">Ümumi Kar/Zərər</div>
          </div>
         
          <div className="text-center">
            <div className="text-2xl font-bold text-green-500">
              {profitableCoins.length}
            </div>
            <div className="text-sm text-muted-foreground">Qazanclı</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-500">
              {losingCoins.length}
            </div>
            <div className="text-sm text-muted-foreground">Zərərli</div>
          </div>
        </div>
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {soldCoins.map((coin) => {
            const profitNum = parseFloat(coin.profit);
            const profitPercentageNum = parseFloat(coin.profitPercentage);
            const isProfit = profitNum > 0;
            
            return (
              <div
                key={coin.id}
                className="flex items-center justify-between p-3 bg-background rounded-lg border hover:shadow-sm transition-shadow"
              >
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-1">
                    <span className="font-semibold text-foreground">
                      {coin.symbol}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {coin.name}
                    </span>
                  </div>
                  
                  <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                    <span>Qty: {parseFloat(coin.soldQuantity).toFixed(4)}</span>
                    <span>Sold: ${parseFloat(coin.sellPrice).toFixed(6)}</span>
                    <span>Bought: ${parseFloat(coin.buyPrice).toFixed(6)}</span>
                  </div>
                  
                  <div className="flex items-center space-x-2 mt-1">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      {new Date(coin.soldAt).toLocaleDateString()} {new Date(coin.soldAt).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
                
                <div className="text-right">
                  <div className="flex items-center space-x-1 mb-1">
                    {isProfit ? (
                      <TrendingUp className="h-4 w-4 text-crypto-green" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-red-500" />
                    )}
                    <span className={`font-semibold ${
                      isProfit ? 'text-crypto-green' : 'text-red-500'
                    }`}>
                      {isProfit ? '+' : ''}${profitNum.toFixed(4)}
                    </span>
                  </div>
                  
                  <div className={`text-sm ${
                    isProfit ? 'text-crypto-green' : 'text-red-500'
                  }`}>
                    {isProfit ? '+' : ''}{profitPercentageNum.toFixed(2)}%
                  </div>
                  
                  <div className="text-xs text-muted-foreground">
                    Total: ${parseFloat(coin.sellValue).toFixed(2)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}