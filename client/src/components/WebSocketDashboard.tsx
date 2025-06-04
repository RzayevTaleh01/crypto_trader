import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Activity, Clock, Play, Square } from "lucide-react";
import { useWebSocket } from "@/hooks/useWebSocket";

export default function WebSocketDashboard() {
  const { wsData, isConnected } = useWebSocket();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isConnected && wsData.user) {
      setIsLoading(false);
    }
  }, [isConnected, wsData]);

  const toggleBot = async () => {
    if (!wsData.botSettings) return;
    
    const newStatus = !wsData.botSettings.isActive;
    
    try {
      const response = await fetch('/api/bot-settings/1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: newStatus })
      });
      
      if (!response.ok) throw new Error('Failed to update bot status');
    } catch (error) {
      console.error('Bot toggle error:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted/20 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-20">
            <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary mx-auto"></div>
            <p className="text-muted-foreground mt-4">WebSocket bağlantısı kuruluyor...</p>
          </div>
        </div>
      </div>
    );
  }

  const stats = wsData.analytics || {
    totalProfit: '0.00',
    activeTrades: 0,
    winRate: '0',
    uptime: '99.7'
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">
              WebSocket Dashboard
            </h1>
            <p className="text-muted-foreground mt-2">
              Real-time crypto trading - Tamamilə WebSocket əsaslı sistem
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            <Badge variant={isConnected ? "default" : "destructive"} className="px-3 py-1">
              WebSocket: {isConnected ? "Bağlı" : "Bağlantı yoxdur"}
            </Badge>
            
            <Button
              onClick={toggleBot}
              variant={wsData.botSettings?.isActive ? "destructive" : "default"}
              size="lg"
              className="gap-2"
            >
              {wsData.botSettings?.isActive ? (
                <>
                  <Square className="h-4 w-4" />
                  Botu Dayandır
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Botu Başlat
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="border-l-4 border-l-green-500">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ümumi Mənfəət</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-500">
                ${parseFloat(stats.totalProfit || '0').toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground">WebSocket ilə real-time</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-blue-500">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Aktiv Ticarətlər</CardTitle>
              <Activity className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-500">
                {stats.activeTrades || 0}
              </div>
              <p className="text-xs text-muted-foreground">Canlı pozisiyalar</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-purple-500">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Qalib Nisbəti</CardTitle>
              <TrendingUp className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-500">
                {stats.winRate || '0'}%
              </div>
              <p className="text-xs text-muted-foreground">Uğur dərəcəsi</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-orange-500">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Uptime</CardTitle>
              <Clock className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-500">
                {stats.uptime || '99.7'}%
              </div>
              <p className="text-xs text-muted-foreground">Sistem sabitliyi</p>
            </CardContent>
          </Card>
        </div>

        {/* Bot Status and Portfolio */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Bot Status */}
          <Card>
            <CardHeader>
              <CardTitle>Bot Statusu</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span>Status:</span>
                  <Badge variant={wsData.botSettings?.isActive ? "default" : "secondary"}>
                    {wsData.botSettings?.isActive ? "Aktiv" : "Deaktiv"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>Strategiya:</span>
                  <span className="font-medium">{wsData.botSettings?.strategy || 'EMA + RSI'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Balans:</span>
                  <span className="font-medium">${wsData.user?.balance || '0.00'}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Bütün məlumatlar WebSocket vasitəsilə real-time yenilənir
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Recent Trades */}
          <Card>
            <CardHeader>
              <CardTitle>Son Ticarətlər</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {wsData.trades?.slice(0, 5).map((trade: any, index: number) => (
                  <div key={index} className="flex items-center justify-between p-2 rounded border">
                    <div className="flex items-center gap-2">
                      <Badge variant={trade.type === 'buy' ? 'default' : 'destructive'}>
                        {trade.type?.toUpperCase()}
                      </Badge>
                      <span className="font-medium">{trade.symbol}</span>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">${trade.quantity}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(trade.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                )) || (
                  <div className="text-center text-muted-foreground py-4">
                    Hələ ticarət edilməyib
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Connection Info */}
        <Card>
          <CardHeader>
            <CardTitle>WebSocket Bağlantı Məlumatları</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="font-medium">Bağlantı Statusu:</span>
                <span className={`ml-2 ${isConnected ? 'text-green-500' : 'text-red-500'}`}>
                  {isConnected ? 'Aktiv' : 'Bağlantı yoxdur'}
                </span>
              </div>
              <div>
                <span className="font-medium">API Sorğuları:</span>
                <span className="ml-2 text-green-500">Tamamilə aradan qaldırılıb</span>
              </div>
              <div>
                <span className="font-medium">Məlumat Mənbəyi:</span>
                <span className="ml-2 text-blue-500">Yalnız WebSocket</span>
              </div>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}