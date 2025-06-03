import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Wallet, DollarSign } from "lucide-react";

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
  const { data: holdings = [], isLoading } = useQuery({
    queryKey: ['/api/portfolio/user', userId],
    enabled: !!userId,
  });

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

  if (!holdings.length) {
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
            No active positions
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalValue = holdings.reduce((sum: number, holding: PortfolioHolding) => 
    sum + parseFloat(holding.currentValue || '0'), 0
  );

  const totalInvested = holdings.reduce((sum: number, holding: PortfolioHolding) => 
    sum + parseFloat(holding.totalInvested), 0
  );

  const totalPnL = totalValue - totalInvested;
  const totalPnLPercentage = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          Portfolio Holdings
        </CardTitle>
        <div className="flex gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <DollarSign className="h-4 w-4" />
            Total Value: ${totalValue.toFixed(2)}
          </div>
          <div className="flex items-center gap-1">
            {totalPnL >= 0 ? (
              <TrendingUp className="h-4 w-4 text-green-600" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-600" />
            )}
            <span className={totalPnL >= 0 ? "text-green-600" : "text-red-600"}>
              ${totalPnL.toFixed(2)} ({totalPnLPercentage >= 0 ? '+' : ''}{totalPnLPercentage.toFixed(2)}%)
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Header Row */}
        <div className="grid grid-cols-5 gap-4 p-3 bg-muted/30 rounded-lg text-sm font-medium text-muted-foreground">
          <div>Coin</div>
          <div className="text-center">Alış Qiyməti</div>
          <div className="text-center">Hazırki Qiymət</div>
          <div className="text-center">Məbləğ</div>
          <div className="text-center">Kar/Zərər</div>
        </div>

        {holdings.map((holding: PortfolioHolding) => {
          const currentValue = parseFloat(holding.currentValue || '0');
          const pnl = parseFloat(holding.pnl || '0');
          const pnlPercentage = parseFloat(holding.pnlPercentage || '0');
          const amount = parseFloat(holding.amount);
          const avgPrice = parseFloat(holding.averagePrice);
          const currentPrice = parseFloat(holding.cryptocurrency.currentPrice);
          const priceChange24h = parseFloat(holding.cryptocurrency.priceChange24h);
          
          return (
            <div key={holding.id} className="grid grid-cols-5 gap-4 p-3 bg-muted/50 rounded-lg items-center">
              {/* Coin Info */}
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                  <span className="text-xs font-medium text-primary">
                    {holding.cryptocurrency.symbol.slice(0, 2)}
                  </span>
                </div>
                <div>
                  <div className="font-medium">{holding.cryptocurrency.symbol}</div>
                  <div className="text-xs text-muted-foreground">
                    {holding.cryptocurrency.name}
                  </div>
                </div>
              </div>
              
              {/* Buy Price */}
              <div className="text-center">
                <div className="font-medium text-blue-600">
                  ${avgPrice.toFixed(6)}
                </div>
                <div className="text-xs text-muted-foreground">
                  Ortalama
                </div>
              </div>
              
              {/* Current Price */}
              <div className="text-center">
                <div className="font-medium">
                  ${currentPrice.toFixed(6)}
                </div>
                <div className={`text-xs ${priceChange24h >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {priceChange24h >= 0 ? '+' : ''}{priceChange24h.toFixed(2)}% 24s
                </div>
              </div>
              
              {/* Amount & Value */}
              <div className="text-center">
                <div className="font-medium">
                  {amount.toFixed(6)}
                </div>
                <div className="text-xs text-muted-foreground">
                  ${currentValue.toFixed(2)} dəyər
                </div>
              </div>
              
              {/* P&L */}
              <div className="text-center">
                <Badge variant={pnl >= 0 ? "default" : "destructive"} className="mb-1">
                  {pnl >= 0 ? '+' : ''}${pnl.toFixed(3)}
                </Badge>
                <div className={`text-sm font-medium ${pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {pnlPercentage >= 0 ? '+' : ''}{pnlPercentage.toFixed(2)}%
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}