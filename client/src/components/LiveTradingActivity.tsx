import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, TrendingUp, TrendingDown, Clock, DollarSign } from "lucide-react";
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
  const { socket } = useWebSocket();

  // Primary data source: API query for initial load and fallback
  const { data: apiActivities = [], isLoading } = useQuery<TradingActivity[]>({
    queryKey: ['/api/trades/recent', 1],
  });

  // Initialize activities from API data
  useEffect(() => {
    if (apiActivities && apiActivities.length > 0) {
      setActivities(apiActivities);
    }
  }, [apiActivities]);

  // Listen for real-time trading updates via WebSocket
  useEffect(() => {
    if (!socket) return;

    const handleNewTrade = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'tradeUpdate' && message.data) {
          // Add new trade to the beginning of the list
          setActivities(prev => [message.data, ...prev.slice(0, 9)]); // Keep only 10 most recent
        } else if (message.type === 'tradesUpdate' && message.data) {
          // Update entire trades list
          setActivities(message.data);
        }
      } catch (error) {
        console.log('Error parsing WebSocket trade message:', error);
      }
    };

    socket.addEventListener('message', handleNewTrade);
    return () => socket.removeEventListener('message', handleNewTrade);
  }, [socket]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Live Trading Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4 text-muted-foreground">
            Loading activity...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!activities || activities.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Live Trading Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No trading activity yet</p>
            <p className="text-sm text-muted-foreground">Activate the bot to start trading</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Live Trading Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {activities.map((activity, index) => {
            const isBuy = activity.action?.toLowerCase() === 'buy';
            const timestamp = new Date(activity.timestamp);
            const timeString = timestamp.toLocaleTimeString('en-US', { 
              hour12: false, 
              hour: '2-digit', 
              minute: '2-digit', 
              second: '2-digit' 
            });

            return (
              <div key={`${activity.timestamp}-${index}`} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    isBuy 
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                      : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                  }`}>
                    {isBuy ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-medium">{activity.symbol || 'Unknown'}</span>
                      <Badge variant={isBuy ? 'default' : 'destructive'} className="text-xs">
                        {activity.action?.toUpperCase() || 'TRADE'}
                      </Badge>
                      {activity.strategy && (
                        <Badge variant="outline" className="text-xs">
                          {activity.strategy}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>{timeString}</span>
                      <span>•</span>
                      <span>{parseFloat(activity.amount || '0').toFixed(6)} coins</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-medium">${parseFloat(activity.price || '0').toFixed(6)}</p>
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <DollarSign className="h-3 w-3" />
                    ${parseFloat(activity.total || '0').toFixed(2)}
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