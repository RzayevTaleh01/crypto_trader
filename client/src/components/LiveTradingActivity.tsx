import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Activity, Bot, DollarSign } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useWebSocket } from "@/hooks/useWebSocket";

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

  const { data: botSettings } = useQuery({
    queryKey: ['/api/bot-settings'],
    refetchInterval: 5000, // Reduced frequency
  });

  const { data: recentTrades } = useQuery({
    queryKey: ['/api/trades/user/1'],
    refetchInterval: 10000, // Reduced frequency since we use WebSocket for live updates
  });

  // WebSocket for real-time updates
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
            price: `$${parseFloat(trade.price).toFixed(2)}`,
            total: `$${parseFloat(trade.total).toFixed(2)}`,
            type: trade.type.toUpperCase(),
            strategy: botSettings?.strategy || 'scalping'
          };

          // Add new trade to the beginning and limit to 10
          setActivities(prev => [newActivity, ...prev.slice(0, 9)]);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    socket.addEventListener('message', handleNewTrade);
    return () => socket.removeEventListener('message', handleNewTrade);
  }, [socket, botSettings]);

  // Initial load of trading data
  useEffect(() => {
    const safeBotSettings = botSettings || {};
    const trades = Array.isArray(recentTrades) ? recentTrades : [];
    
    if (trades && trades.length > 0) {
      const latestTrades = trades
        .filter((trade: any) => trade.isBot)
        .slice(0, 10)
        .map((trade: any) => ({
          timestamp: new Date(trade.createdAt).toLocaleTimeString('az-AZ'),
          action: 'EXECUTED',
          symbol: trade.cryptocurrency?.symbol || 'N/A',
          amount: parseFloat(trade.amount).toFixed(6),
          price: `$${parseFloat(trade.price).toFixed(2)}`,
          total: `$${parseFloat(trade.total).toFixed(2)}`,
          type: trade.type.toUpperCase(),
          strategy: safeBotSettings.strategy || 'scalping'
        }));
      
      setActivities(latestTrades);
    }
  }, [recentTrades, botSettings]);

  const safeBotSettings = botSettings || {};
  const isActive = safeBotSettings.isActive;
  const currentStrategy = safeBotSettings.strategy || 'scalping';

  const getStrategyName = (strategy: string) => {
    switch (strategy) {
      case 'scalping': return 'Scalping';
      case 'momentum': return 'Momentum';
      case 'mean-reversion': return 'Mean Reversion';
      case 'grid': return 'Grid';
      default: return 'Scalping';
    }
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Activity className="h-5 w-5 text-crypto-blue" />
            <CardTitle className="text-lg font-semibold">Canlı Ticarət Fəaliyyəti</CardTitle>
          </div>
          <div className="flex items-center space-x-2">
            <Badge 
              variant={isActive ? "default" : "secondary"}
              className={isActive ? "bg-crypto-green text-white animate-pulse" : ""}
            >
              {isActive ? 'Aktiv' : 'Qeyri-aktiv'}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {getStrategyName(currentStrategy)}
            </Badge>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Bot Status */}
        <div className="flex items-center justify-between p-3 bg-background/50 rounded-lg border border-border/30">
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded-full ${isActive ? 'bg-crypto-green/20' : 'bg-gray-500/20'}`}>
              <Bot className={`h-4 w-4 ${isActive ? 'text-crypto-green' : 'text-gray-500'}`} />
            </div>
            <div>
              <p className="text-sm font-medium">
                {isActive ? 'Bot aktiv şəkildə ticarət edir' : 'Bot dayanıb'}
              </p>
              <p className="text-xs text-muted-foreground">
                Cari strategiya: {getStrategyName(currentStrategy)}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <TrendingUp className="h-4 w-4 text-crypto-green" />
            <span className="text-sm font-medium text-crypto-green">
              {activities.length} əməliyyat
            </span>
          </div>
        </div>

        {/* Trading Activities */}
        {activities.length === 0 ? (
          <div className="text-center py-8">
            <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Bot ticarət fəaliyyəti gözlənilir...</p>
          </div>
        ) : (
          <div className="space-y-2">
            {activities.map((activity, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 bg-background/30 rounded-lg border border-border/50 hover:bg-background/50 transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <div className="flex flex-col">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-medium text-crypto-blue">
                        {activity.symbol}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {getStrategyName(activity.strategy)}
                      </Badge>
                    </div>
                    <div className="flex items-center space-x-2 mt-1">
                      <span className="text-xs text-muted-foreground">
                        Miqdar: {activity.amount}
                      </span>
                      <span className="text-xs text-muted-foreground">•</span>
                      <span className="text-xs text-muted-foreground">
                        Qiymət: {activity.price}
                      </span>
                      <span className="text-xs text-muted-foreground">•</span>
                      <span className="text-xs text-muted-foreground">
                        Toplam: {activity.total}
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Badge 
                    variant={activity.type === 'BUY' ? 'default' : 'secondary'}
                    className={activity.type === 'BUY' ? 'bg-crypto-green text-white' : 'bg-red-500 text-white'}
                  >
                    {activity.type === 'BUY' ? 'ALINIB' : 'SATILMIŞIR'}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {activity.timestamp}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Performance Summary */}
        {activities.length > 0 && (
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div className="p-3 bg-crypto-green/10 rounded-lg border border-crypto-green/20">
              <div className="flex items-center space-x-2">
                <DollarSign className="h-4 w-4 text-crypto-green" />
                <span className="text-sm font-medium text-crypto-green">
                  Ümumi Alış
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {activities.filter(a => a.type === 'BUY').length} əməliyyat
              </p>
            </div>
            <div className="p-3 bg-red-500/10 rounded-lg border border-red-500/20">
              <div className="flex items-center space-x-2">
                <TrendingUp className="h-4 w-4 text-red-500" />
                <span className="text-sm font-medium text-red-500">
                  Ümumi Satış
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {activities.filter(a => a.type === 'SELL').length} əməliyyat
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}