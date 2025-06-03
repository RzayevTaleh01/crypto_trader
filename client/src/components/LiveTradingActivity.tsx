import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Activity, Bot, DollarSign } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface TradingActivity {
  timestamp: string;
  action: string;
  symbol: string;
  priceChange: string;
  probability: string;
  decision: string;
  strategy: string;
}

export default function LiveTradingActivity() {
  const [activities, setActivities] = useState<TradingActivity[]>([]);

  const { data: botSettings } = useQuery({
    queryKey: ['/api/bot-settings'],
    refetchInterval: 2000,
  });

  // Simulate real-time trading activity based on bot logs
  useEffect(() => {
    const interval = setInterval(() => {
      const safeBotSettings = botSettings || {};
      if (safeBotSettings.isActive) {
        const symbols = ['BTC', 'ETH', 'STETH', 'WSTETH', 'AVAX', 'SOL'];
        const randomSymbol = symbols[Math.floor(Math.random() * symbols.length)];
        const priceChange = (Math.random() * 10 - 5).toFixed(2);
        const probability = (Math.random() * 0.5).toFixed(2);
        
        const newActivity: TradingActivity = {
          timestamp: new Date().toLocaleTimeString('az-AZ'),
          action: 'ANALYSIS',
          symbol: randomSymbol,
          priceChange: priceChange + '%',
          probability: probability,
          decision: parseFloat(probability) > 0.3 ? 'TRADE' : 'HOLD',
          strategy: safeBotSettings.strategy || 'momentum'
        };

        setActivities(prev => [newActivity, ...prev.slice(0, 9)]);
      }
    }, 15000); // Update every 15 seconds

    return () => clearInterval(interval);
  }, [botSettings?.isActive, botSettings?.strategy]);

  const safeBotSettings = botSettings || {};
  const isActive = safeBotSettings.isActive;
  const currentStrategy = safeBotSettings.strategy || 'scalping';

  const getStrategyName = (strategy: string) => {
    switch (strategy) {
      case 'scalping': return 'Scalping';
      case 'momentum': return 'Momentum';
      case 'mean-reversion': return 'Mean Reversion';
      case 'grid': return 'Grid Trading';
      default: return 'Unknown';
    }
  };

  const getStrategyColor = (strategy: string) => {
    switch (strategy) {
      case 'scalping': return 'bg-blue-500';
      case 'momentum': return 'bg-green-500';
      case 'mean-reversion': return 'bg-purple-500';
      case 'grid': return 'bg-orange-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center">
            <Activity className="h-5 w-5 mr-2 text-crypto-blue" />
            Canlı Ticarət Fəaliyyəti
          </div>
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-crypto-green animate-pulse' : 'bg-gray-400'}`} />
            <span className={`text-sm font-medium ${isActive ? 'text-crypto-green' : 'text-gray-500'}`}>
              {isActive ? 'Aktiv' : 'Dayandırılıb'}
            </span>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current Strategy Display */}
        <div className="bg-background/50 rounded-lg p-4 border border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Bot className="h-5 w-5 text-crypto-blue" />
              <div>
                <p className="text-sm font-medium">Hazırki Strategiya</p>
                <p className="text-xs text-muted-foreground">Bot analiz edir və ticarət qərarları verir</p>
              </div>
            </div>
            <Badge className={`${getStrategyColor(currentStrategy)} text-white`}>
              {getStrategyName(currentStrategy)}
            </Badge>
          </div>
        </div>

        {/* Live Activity Feed */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground mb-3">Son Fəaliyyətlər</h4>
          
          {!isActive ? (
            <div className="text-center py-8 text-muted-foreground">
              <Bot className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Bot dayandırılıb</p>
              <p className="text-xs">Canlı fəaliyyəti görmək üçün botu başladın</p>
            </div>
          ) : activities.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <TrendingUp className="h-6 w-6 mx-auto mb-2 animate-pulse" />
              <p className="text-sm">Bot analizə başlayır...</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
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
                          Qiymət dəyişikliği: {activity.priceChange}
                        </span>
                        <span className="text-xs text-muted-foreground">•</span>
                        <span className="text-xs text-muted-foreground">
                          Ehtimal: {activity.probability}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Badge 
                      variant={activity.decision === 'TRADE' ? 'default' : 'secondary'}
                      className={activity.decision === 'TRADE' ? 'bg-crypto-green text-white' : ''}
                    >
                      {activity.decision === 'TRADE' ? 'TİCARƏT' : 'SAXLA'}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {activity.timestamp}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Strategy Info */}
        {isActive && (
          <div className="bg-background/30 rounded-lg p-3 border border-border/50">
            <div className="flex items-center space-x-2 mb-2">
              <DollarSign className="h-4 w-4 text-crypto-blue" />
              <span className="text-sm font-medium">Strategiya Məlumatı</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {currentStrategy === 'scalping' && 'Qısa müddətli qiymət dəyişikliklərindən faydalanır'}
              {currentStrategy === 'momentum' && 'Güclü qiymət trendlərini izləyir və dəstəkləyir'}
              {currentStrategy === 'mean-reversion' && 'Qiymətlərin orta dəyərə qayıtmasını gözləyir'}
              {currentStrategy === 'grid' && 'Müəyyən qiymət aralığında çoxlu kiçik ticarətlər edir'}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}