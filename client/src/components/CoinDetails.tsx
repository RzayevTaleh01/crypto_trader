import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft, 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  DollarSign,
  BarChart3,
  Clock
} from "lucide-react";
import { format } from "date-fns";

interface CoinDetailsProps {
  symbol: string;
  onBack: () => void;
}

interface TradeData {
  id: number;
  type: 'BUY' | 'SELL';
  amount: string;
  price: string;
  total: string;
  pnl: string;
  reason: string;
  createdAt: string;
  cryptocurrency: {
    symbol: string;
    name: string;
    currentPrice: string;
  };
}

interface CoinStats {
  totalBought: number;
  totalSold: number;
  totalInvested: number;
  totalRealized: number;
  currentHolding: number;
  averageBuyPrice: number;
  averageSellPrice: number;
  realizedProfit: number;
  unrealizedProfit: number;
  winningTrades: number;
  totalTrades: number;
  winRate: number;
}

export default function CoinDetails({ symbol, onBack }: CoinDetailsProps) {
  const [stats, setStats] = useState<CoinStats>({
    totalBought: 0,
    totalSold: 0,
    totalInvested: 0,
    totalRealized: 0,
    currentHolding: 0,
    averageBuyPrice: 0,
    averageSellPrice: 0,
    realizedProfit: 0,
    unrealizedProfit: 0,
    winningTrades: 0,
    totalTrades: 0,
    winRate: 0
  });

  // Get all trades for this specific coin
  const { data: trades = [] } = useQuery<TradeData[]>({
    queryKey: ['/api/trades/coin', symbol],
    queryFn: () => fetch(`/api/trades/coin/${symbol}`).then(res => res.json()),
    staleTime: 2000,
    refetchOnMount: true,
  });

  // Get current coin info
  const { data: coinInfo } = useQuery({
    queryKey: ['/api/cryptocurrencies/symbol', symbol],
    queryFn: () => fetch(`/api/cryptocurrencies/symbol/${symbol}`).then(res => res.json()),
    staleTime: 5000,
  });

  // Calculate statistics when trades change
  useEffect(() => {
    if (trades.length === 0) return;

    const buyTrades = trades.filter(t => t.type === 'BUY');
    const sellTrades = trades.filter(t => t.type === 'SELL');

    const totalBought = buyTrades.reduce((sum, t) => sum + parseFloat(t.amount), 0);
    const totalSold = sellTrades.reduce((sum, t) => sum + parseFloat(t.amount), 0);
    const totalInvested = buyTrades.reduce((sum, t) => sum + parseFloat(t.total), 0);
    const totalRealized = sellTrades.reduce((sum, t) => sum + parseFloat(t.total), 0);
    
    const currentHolding = totalBought - totalSold;
    const averageBuyPrice = totalBought > 0 ? totalInvested / totalBought : 0;
    const averageSellPrice = totalSold > 0 ? totalRealized / totalSold : 0;
    
    const realizedProfit = sellTrades.reduce((sum, t) => sum + parseFloat(t.pnl || '0'), 0);
    const currentPrice = coinInfo ? parseFloat(coinInfo.currentPrice) : 0;
    const unrealizedProfit = currentHolding > 0 ? (currentPrice - averageBuyPrice) * currentHolding : 0;
    
    const winningTrades = sellTrades.filter(t => parseFloat(t.pnl || '0') > 0).length;
    const winRate = sellTrades.length > 0 ? (winningTrades / sellTrades.length) * 100 : 0;

    setStats({
      totalBought,
      totalSold,
      totalInvested,
      totalRealized,
      currentHolding,
      averageBuyPrice,
      averageSellPrice,
      realizedProfit,
      unrealizedProfit,
      winningTrades,
      totalTrades: sellTrades.length,
      winRate
    });
  }, [trades, coinInfo]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={onBack}
            className="flex items-center space-x-2"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Geri</span>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{symbol} Detayları</h1>
            <p className="text-muted-foreground">
              {coinInfo?.name || symbol} - ${coinInfo?.currentPrice || '0.00'}
            </p>
          </div>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-4 w-4 text-green-500" />
              <div>
                <p className="text-sm text-muted-foreground">Ümumi Alış</p>
                <p className="text-lg font-bold">{stats.totalBought.toFixed(4)}</p>
                <p className="text-xs text-muted-foreground">${stats.totalInvested.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <TrendingDown className="h-4 w-4 text-red-500" />
              <div>
                <p className="text-sm text-muted-foreground">Ümumi Satış</p>
                <p className="text-lg font-bold">{stats.totalSold.toFixed(4)}</p>
                <p className="text-xs text-muted-foreground">${stats.totalRealized.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <BarChart3 className="h-4 w-4 text-blue-500" />
              <div>
                <p className="text-sm text-muted-foreground">Hal-hazırda</p>
                <p className="text-lg font-bold">{stats.currentHolding.toFixed(4)}</p>
                <p className="text-xs text-muted-foreground">${(stats.currentHolding * (coinInfo ? parseFloat(coinInfo.currentPrice) : 0)).toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <DollarSign className={`h-4 w-4 ${(stats.realizedProfit + stats.unrealizedProfit) >= 0 ? 'text-green-500' : 'text-red-500'}`} />
              <div>
                <p className="text-sm text-muted-foreground">Ümumi Kar</p>
                <p className={`text-lg font-bold ${(stats.realizedProfit + stats.unrealizedProfit) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ${(stats.realizedProfit + stats.unrealizedProfit).toFixed(2)}
                </p>
                <p className="text-xs text-muted-foreground">Win Rate: {stats.winRate.toFixed(1)}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Ortalama Qiymətlər</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ortalama Alış Qiyməti:</span>
              <span className="font-medium">${stats.averageBuyPrice.toFixed(6)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ortalama Satış Qiyməti:</span>
              <span className="font-medium">${stats.averageSellPrice.toFixed(6)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cari Qiymət:</span>
              <span className="font-medium">${coinInfo?.currentPrice || '0.00'}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Kar/Zərər Analizi</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Realize Olunmuş Kar:</span>
              <span className={`font-medium ${stats.realizedProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${stats.realizedProfit.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Realize Olunmamış Kar:</span>
              <span className={`font-medium ${stats.unrealizedProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${stats.unrealizedProfit.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Trading Statistikası:</span>
              <span className="font-medium">{stats.winningTrades}/{stats.totalTrades} Qazanclı</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Trades History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Clock className="h-5 w-5" />
            <span>Tranzaksiya Tarixçəsi</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {trades.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">Bu koin üçün tranzaksiya tapılmadı</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {trades.map((trade) => (
                <div
                  key={trade.id}
                  className="flex items-center justify-between p-3 bg-background rounded-lg border hover:shadow-sm transition-shadow"
                >
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-1">
                      <Badge 
                        variant={trade.type === 'BUY' ? 'default' : 'secondary'}
                        className={trade.type === 'BUY' ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'}
                      >
                        {trade.type}
                      </Badge>
                      <span className="font-medium">{parseFloat(trade.amount).toFixed(4)} {symbol}</span>
                      <span className="text-sm text-muted-foreground">@ ${parseFloat(trade.price).toFixed(6)}</span>
                    </div>
                    
                    <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                      <div className="flex items-center space-x-1">
                        <Calendar className="h-3 w-3" />
                        <span>{format(new Date(trade.createdAt), 'dd/MM/yyyy HH:mm')}</span>
                      </div>
                      <span>Toplam: ${parseFloat(trade.total).toFixed(2)}</span>
                      {trade.reason && <span>Sebəb: {trade.reason}</span>}
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className="text-lg font-semibold">${parseFloat(trade.total).toFixed(2)}</div>
                    {trade.type === 'SELL' && trade.pnl && (
                      <div className={`text-sm ${parseFloat(trade.pnl) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {parseFloat(trade.pnl) >= 0 ? '+' : ''}${parseFloat(trade.pnl).toFixed(2)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}