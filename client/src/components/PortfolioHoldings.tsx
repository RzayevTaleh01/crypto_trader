import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Wallet, DollarSign } from "lucide-react";
import { useWebSocket } from "@/hooks/useWebSocket";

interface PortfolioHolding {
  id: number;
  cryptoId: number;
  amount: string;
  averagePrice: string;
  totalInvested: string;
  cryptocurrency: {
    symbol: string;
    name: string;
    currentPrice: string;
    priceChange24h: string;
  };
  currentValue: string;
  pnl: string;
  pnlPercentage: string;
}

interface PortfolioHoldingsProps {
  userId: number;
}

export default function PortfolioHoldings({ userId }: PortfolioHoldingsProps) {
  const [holdings, setHoldings] = useState<PortfolioHolding[]>([]);
  const { socket } = useWebSocket();

  // Primary data source: API query for initial load and fallback
  const { data: apiHoldings = [], isLoading } = useQuery<PortfolioHolding[]>({
    queryKey: ['/api/portfolio/user', userId],
    enabled: !!userId,
  });

  // Initialize holdings from API data
  useEffect(() => {
    if (apiHoldings && apiHoldings.length > 0) {
      setHoldings(apiHoldings);
    }
  }, [apiHoldings]);

  // Listen for real-time portfolio updates via WebSocket
  useEffect(() => {
    if (!socket) return;

    const handlePortfolioUpdate = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'portfolioUpdate' && message.data) {
          setHoldings(message.data);
        }
      } catch (error) {
        console.log('Error parsing WebSocket portfolio message:', error);
      }
    };

    socket.addEventListener('message', handlePortfolioUpdate);
    return () => socket.removeEventListener('message', handlePortfolioUpdate);
  }, [socket]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Portfolio Holdings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4 text-muted-foreground">
            Loading holdings...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!holdings || holdings.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Portfolio Holdings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Wallet className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No holdings yet</p>
            <p className="text-sm text-muted-foreground">Start trading to build your portfolio</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalValue = holdings.reduce((sum: number, holding: PortfolioHolding) => 
    sum + parseFloat(holding.currentValue || '0'), 0
  );

  const totalInvested = holdings.reduce((sum: number, holding: PortfolioHolding) => 
    sum + parseFloat(holding.totalInvested || '0'), 0
  );

  const totalPnl = totalValue - totalInvested;
  const totalPnlPercentage = totalInvested > 0 ? ((totalPnl / totalInvested) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Portfolio Holdings
          </div>
          <div className="text-right">
            <div className="text-lg font-bold">${totalValue.toFixed(2)}</div>
            <div className={`text-sm flex items-center gap-1 ${
              totalPnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            }`}>
              {totalPnl >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              ${Math.abs(totalPnl).toFixed(2)} ({totalPnlPercentage.toFixed(2)}%)
            </div>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {holdings.map((holding: PortfolioHolding) => {
            const pnl = parseFloat(holding.pnl || '0');
            const pnlPercentage = parseFloat(holding.pnlPercentage || '0');
            const priceChange24h = parseFloat(holding.cryptocurrency?.priceChange24h || '0');

            return (
              <div key={holding.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                    priceChange24h >= 0 
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                      : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                  }`}>
                    {holding.cryptocurrency?.symbol?.slice(0, 2).toUpperCase() || 'CR'}
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-medium">{holding.cryptocurrency?.symbol || 'Unknown'}</span>
                      <Badge variant={priceChange24h >= 0 ? 'default' : 'destructive'} className="text-xs">
                        {priceChange24h >= 0 ? '+' : ''}{priceChange24h.toFixed(2)}%
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {parseFloat(holding.amount).toFixed(6)} @ ${parseFloat(holding.averagePrice || '0').toFixed(6)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-medium">${parseFloat(holding.currentValue || '0').toFixed(2)}</p>
                  <p className={`text-sm flex items-center gap-1 ${
                    pnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                  }`}>
                    {pnl >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    ${Math.abs(pnl).toFixed(2)} ({pnlPercentage.toFixed(2)}%)
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}