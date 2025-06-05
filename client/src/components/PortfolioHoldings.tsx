import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, Wallet, DollarSign, TrendingDown as SellIcon } from "lucide-react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Primary data source: API query for initial load and fallback
  const { data: apiHoldings = [], isLoading } = useQuery<PortfolioHolding[]>({
    queryKey: ['/api/portfolio/user', userId],
    enabled: !!userId,
  });

  // Mutation for selling all portfolio
  const sellAllPortfolioMutation = useMutation({
    mutationFn: async () => {
      if (holdings.length === 0) {
        throw new Error('Portfeldə satılacaq koin yoxdur');
      }
      
      const response = await apiRequest('POST', '/api/trades/sell-all', { userId });
      
      return response;
    },
    onMutate: async () => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['/api/portfolio/user', userId] });
      
      // Optimistic update - immediately clear portfolio
      queryClient.setQueryData(['/api/portfolio/user', userId], []);
      
      // Show immediate feedback
      toast({
        title: "Satış prosesi başladı",
        description: "Bütün portfel satılır...",
        variant: "default",
      });
    },
    onSuccess: async (data: any) => {
      // Clear all portfolio related cache immediately
      queryClient.removeQueries({ queryKey: ['/api/portfolio/user'] });
      queryClient.setQueryData(['/api/portfolio/user', userId], []);
      
      toast({
        title: "Bütün portfel satıldı",
        description: `${data.soldCount || 0} koin satıldı. Trading dayandırıldı.`,
        variant: "default",
      });
      
      // Force fresh data fetch
      setTimeout(() => {
        queryClient.refetchQueries({ queryKey: ['/api/portfolio/user'] });
        queryClient.refetchQueries({ queryKey: ['/api/trades/sold'] });
        queryClient.refetchQueries({ queryKey: ['/api/trades/recent'] });
        queryClient.refetchQueries({ queryKey: ['/api/stats'] });
        queryClient.refetchQueries({ queryKey: ['/api/portfolio/performance'] });
      }, 100);
    },
    onError: (error: any) => {
      toast({
        title: "Satış xətası",
        description: error.message || "Portfel satışı zamanı xəta baş verdi",
        variant: "destructive",
      });
    },
  });

  // Mutation for selling profitable coins
  const sellProfitableCoinsMutation = useMutation({
    mutationFn: async () => {
      const profitableCoins = holdings.filter(holding => parseFloat(holding.pnl || '0') > 0.05);
      
      if (profitableCoins.length === 0) {
        throw new Error('Kar 0.05-dən çox olan koin yoxdur');
      }

      const sellPromises = profitableCoins.map(holding => 
        apiRequest('POST', `/api/trades/sell`, {
          userId,
          cryptoId: holding.cryptoId,
          amount: holding.amount,
          reason: 'Manual kar realizasiyası'
        })
      );

      return Promise.all(sellPromises);
    },
    onSuccess: (data) => {
      toast({
        title: "Satış uğurlu oldu",
        description: `${data.length} karlı koin satıldı`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/portfolio/user', userId] });
      queryClient.invalidateQueries({ queryKey: ['/api/trades/recent'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
    },
    onError: (error: any) => {
      toast({
        title: "Satış xətası",
        description: error.message || "Satış zamanı xəta baş verdi",
        variant: "destructive",
      });
    },
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
        const data = JSON.parse(event.data);
        if (data.type === 'portfolioUpdate' && data.data) {
          setHoldings(data.data);
          // Also update the query cache
          queryClient.setQueryData(['/api/portfolio/user', userId], data.data);
        }
      } catch (error) {
        console.error('Error parsing portfolio update:', error);
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

  const profitableCoinsCount = holdings.filter(holding => parseFloat(holding.pnl || '0') > 0.05).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Portfolio Holdings
          </div>
          <div className="flex items-center gap-3">
            {holdings.length > 0 && (
              <Button
                onClick={() => sellAllPortfolioMutation.mutate()}
                disabled={sellAllPortfolioMutation.isPending}
                variant="outline"
                size="sm"
                className="flex items-center gap-1 border-red-200 text-red-600 hover:bg-red-50"
              >
                <SellIcon className="h-3 w-3" />
                Hamısını Sat
              </Button>
            )}
            {profitableCoinsCount > 0 && (
              <Button
                onClick={() => sellProfitableCoinsMutation.mutate()}
                disabled={sellProfitableCoinsMutation.isPending}
                variant="destructive"
                size="sm"
                className="flex items-center gap-1"
              >
                <SellIcon className="h-3 w-3" />
                Karlı Sat ({profitableCoinsCount})
              </Button>
            )}
            <div className="text-right">
              <div className="text-lg font-bold">${totalValue.toFixed(2)}</div>
              <div className={`text-sm flex items-center gap-1 ${
                totalPnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
              }`}>
                {totalPnl >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                ${Math.abs(totalPnl).toFixed(2)} ({totalPnlPercentage.toFixed(2)}%)
              </div>
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
              <div
                key={holding.id}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="text-sm font-medium text-muted-foreground">
                    {holding.cryptocurrency?.symbol || 'N/A'}
                  </div>
                  <div>
                    <div className="font-semibold">
                      {parseFloat(holding.amount || '0').toFixed(6)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      @ ${parseFloat(holding.averagePrice || '0').toFixed(6)}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="font-semibold">
                    ${parseFloat(holding.currentValue || '0').toFixed(2)}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    ${parseFloat(holding.cryptocurrency?.currentPrice || '0').toFixed(6)}
                  </div>
                </div>

                <div className="text-right">
                  <div className={`font-semibold flex items-center gap-1 ${
                    pnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                  }`}>
                    {pnl >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    ${Math.abs(pnl).toFixed(2)}
                  </div>
                  <div className={`text-sm ${
                    pnlPercentage >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                  }`}>
                    {pnlPercentage >= 0 ? '+' : ''}{pnlPercentage.toFixed(2)}%
                  </div>
                </div>

                <div className="text-right">
                  <Badge variant={priceChange24h >= 0 ? "default" : "destructive"} className="text-xs">
                    {priceChange24h >= 0 ? '+' : ''}{priceChange24h.toFixed(2)}%
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 pt-4 border-t">
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Total Invested:</span>
            <span className="font-medium">${totalInvested.toFixed(2)}</span>
          </div>
          <div className="flex justify-between items-center text-sm mt-1">
            <span className="text-muted-foreground">Current Value:</span>
            <span className="font-medium">${totalValue.toFixed(2)}</span>
          </div>
          <div className="flex justify-between items-center text-sm mt-1">
            <span className="text-muted-foreground">Total P&L:</span>
            <span className={`font-medium ${
              totalPnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            }`}>
              ${Math.abs(totalPnl).toFixed(2)} ({totalPnlPercentage.toFixed(2)}%)
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}