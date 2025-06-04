import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Activity, Bot, DollarSign } from "lucide-react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useWebSocketData } from "@/hooks/useWebSocketData";

interface TradingActivity {
  timestamp: string;
  action: string;
  symbol: string;
  amount: string;
  price: string;
  total: string;
  type: string;
  strategy: string;
}

export default function LiveTradingActivity() {
  const [activities, setActivities] = useState<TradingActivity[]>([]);
  const wsData = useWebSocketData();
  const { socket } = useWebSocket();

  // Listen for real-time trading updates via WebSocket
  useEffect(() => {
    if (!socket) return;

    const handleNewTrade = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'newTrade') {
          const trade = message.data;
          const newActivity = {
            timestamp: new Date(trade.createdAt).toLocaleTimeString('az-AZ'),
            action: 'EXECUTED',
            symbol: trade.cryptocurrency?.symbol || 'N/A',
            amount: parseFloat(trade.amount).toFixed(6),
            price: `$${parseFloat(trade.price).toFixed(6)}`,
            total: `$${parseFloat(trade.total).toFixed(2)}`,
            type: trade.type.toUpperCase(),
            strategy: 'EMA-RSI'
          };

          // Add new trade to the beginning and limit to 10
          setActivities(prev => [newActivity, ...prev.slice(0, 9)]);
        }
      } catch (error) {
        console.log('Error parsing WebSocket message:', error);
      }
    };

    socket.addEventListener('message', handleNewTrade);
    return () => socket.removeEventListener('message', handleNewTrade);
  }, [socket]);

  // Initial load of trading data
  useEffect(() => {
    if (wsData?.data?.trades && Array.isArray(wsData.data.trades)) {
      const latestTrades = wsData.data.trades
        .filter((trade: any) => trade.isBot)
        .slice(0, 10)
        .map((trade: any) => ({
          timestamp: new Date(trade.createdAt).toLocaleTimeString('az-AZ'),
          action: 'EXECUTED',
          symbol: trade.cryptocurrency?.symbol || 'N/A',
          amount: parseFloat(trade.amount).toFixed(6),
          price: `$${parseFloat(trade.price).toFixed(6)}`,
          total: `$${parseFloat(trade.total).toFixed(2)}`,
          type: trade.type.toUpperCase(),
          strategy: 'EMA-RSI'
        }));
      
      setActivities(latestTrades);
    }
  }, [wsData?.data?.trades]);

  const isActive = wsData?.data?.botStatus?.isActive || false;
  const currentStrategy = 'EMA-RSI';

  const getStrategyName = (strategy: string) => {
    switch (strategy) {
      case 'EMA-RSI': return 'EMA-RSI';
      case 'scalping': return 'Scalping';
      case 'momentum': return 'Momentum';
      default: return 'EMA-RSI';
    }
  };

  const getStatusBadgeVariant = () => {
    return isActive ? "default" : "secondary";
  };

  if (!wsData?.data?.trades || wsData.data.trades.length === 0) {
    return (
      <Card className="bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-950 dark:to-red-950 border-orange-200 dark:border-orange-800">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Canlı Ticarət Fəaliyyəti</CardTitle>
          <Badge variant={getStatusBadgeVariant()} className="flex items-center gap-1">
            <Bot className="h-3 w-3" />
            {isActive ? 'Aktiv' : 'Dayandırılıb'} - {getStrategyName(currentStrategy)}
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-center">
            <div className="space-y-2">
              <Activity className="h-8 w-8 text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">
                Hələ ki ticarət fəaliyyəti yoxdur
              </p>
              <p className="text-xs text-muted-foreground">
                Bot aktivləşdirilməyi gözləyir
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-950 dark:to-red-950 border-orange-200 dark:border-orange-800">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Canlı Ticarət Fəaliyyəti</CardTitle>
        <Badge variant={getStatusBadgeVariant()} className="flex items-center gap-1">
          <Bot className="h-3 w-3" />
          {isActive ? 'Aktiv' : 'Dayandırılıb'} - {getStrategyName(currentStrategy)}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {activities.length === 0 ? (
            <div className="flex items-center justify-center py-4 text-center">
              <div className="space-y-2">
                <Activity className="h-6 w-6 text-muted-foreground mx-auto" />
                <p className="text-sm text-muted-foreground">
                  Real vaxt ticarət məlumatları yüklənir...
                </p>
              </div>
            </div>
          ) : (
            activities.map((activity, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-white/60 dark:bg-black/60 rounded-lg border border-orange-100 dark:border-orange-800">
                <div className="flex items-center space-x-3">
                  <div className={`p-2 rounded-full ${
                    activity.type === 'BUY' 
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                      : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                  }`}>
                    {activity.type === 'BUY' ? <TrendingUp className="h-4 w-4" /> : <DollarSign className="h-4 w-4" />}
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-medium">{activity.symbol}</span>
                      <Badge variant={activity.type === 'BUY' ? 'default' : 'destructive'} className="text-xs">
                        {activity.type}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {activity.amount} @ {activity.price}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-medium">{activity.total}</p>
                  <p className="text-xs text-muted-foreground">{activity.timestamp}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}