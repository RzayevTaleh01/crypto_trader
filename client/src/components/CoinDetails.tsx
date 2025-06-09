
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ArrowLeft, 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  DollarSign,
  BarChart3,
  Clock,
  Target,
  Activity,
  Brain,
  Signal,
  AlertCircle,
  CheckCircle2
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
  isBot: boolean;
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

interface TradingSignal {
  type: 'BUY' | 'SELL';
  reason: string;
  confidence: number;
  indicators: string[];
  expectedTarget?: number;
  stopLoss?: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
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

  const [tradingSignals, setTradingSignals] = useState<TradingSignal[]>([]);

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

    // Parse trading signals from bot trades
    const signals: TradingSignal[] = [];
    
    buyTrades.forEach(trade => {
      if (trade.isBot && trade.reason) {
        const signal = parseTradingSignal(trade, currentPrice, averageBuyPrice);
        if (signal) signals.push(signal);
      }
    });

    sellTrades.forEach(trade => {
      if (trade.isBot && trade.reason) {
        const signal = parseTradingSignal(trade, currentPrice, averageBuyPrice);
        if (signal) signals.push(signal);
      }
    });

    setTradingSignals(signals);
  }, [trades, coinInfo]);

  // Parse trading signals from reason text
  const parseTradingSignal = (trade: TradeData, currentPrice: number, avgBuyPrice: number): TradingSignal | null => {
    const reason = trade.reason.toLowerCase();
    const indicators: string[] = [];
    let confidence = 50;
    let expectedTarget = 0;
    let stopLoss = 0;
    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM';

    // Parse indicators from reason
    if (reason.includes('rsi')) indicators.push('RSI Oversold');
    if (reason.includes('momentum')) indicators.push('Strong Momentum');
    if (reason.includes('trend')) indicators.push('Trend Analysis');
    if (reason.includes('volume')) indicators.push('Volume Surge');
    if (reason.includes('fibonacci')) indicators.push('Fibonacci Support');
    if (reason.includes('macd')) indicators.push('MACD Signal');
    if (reason.includes('bollinger')) indicators.push('Bollinger Bands');
    if (reason.includes('whale')) indicators.push('Whale Activity');
    if (reason.includes('golden cross')) indicators.push('Golden Cross');
    if (reason.includes('breakout')) indicators.push('Breakout Pattern');

    // Extract confidence if available
    const confidenceMatch = reason.match(/confidence[:\s]*(\d+)%?/);
    if (confidenceMatch) {
      confidence = parseInt(confidenceMatch[1]);
    }

    // Extract expected return if available
    const returnMatch = reason.match(/expectedreturn[:\s]*(\d+\.?\d*)%?/);
    if (returnMatch) {
      const expectedReturn = parseFloat(returnMatch[1]) / 100;
      expectedTarget = parseFloat(trade.price) * (1 + expectedReturn);
    }

    // Determine risk level
    if (confidence > 80) riskLevel = 'LOW';
    else if (confidence < 50) riskLevel = 'HIGH';

    // Calculate targets for buy trades
    if (trade.type === 'BUY') {
      if (!expectedTarget) {
        expectedTarget = parseFloat(trade.price) * 1.05; // Default 5% target
      }
      stopLoss = parseFloat(trade.price) * 0.97; // 3% stop loss
    }

    return {
      type: trade.type,
      reason: trade.reason,
      confidence,
      indicators,
      expectedTarget: expectedTarget > 0 ? expectedTarget : undefined,
      stopLoss: stopLoss > 0 ? stopLoss : undefined,
      riskLevel
    };
  };

  // TradingView Widget Component
  const TradingViewChart = () => {
    useEffect(() => {
      const script = document.createElement('script');
      script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
      script.async = true;
      script.innerHTML = JSON.stringify({
        "autosize": true,
        "symbol": `BINANCE:${symbol}USDT`,
        "interval": "15",
        "timezone": "Asia/Baku",
        "theme": "dark",
        "style": "1",
        "locale": "en",
        "enable_publishing": false,
        "withdateranges": true,
        "range": "1D",
        "hide_side_toolbar": false,
        "allow_symbol_change": false,
        "save_image": false,
        "calendar": false,
        "support_host": "https://www.tradingview.com"
      });

      const container = document.getElementById(`tradingview-chart-${symbol}`);
      if (container) {
        container.innerHTML = '';
        container.appendChild(script);
      }

      return () => {
        if (container) {
          container.innerHTML = '';
        }
      };
    }, [symbol]);

    return (
      <div className="h-96 w-full">
        <div id={`tradingview-chart-${symbol}`} className="h-full w-full bg-gray-900 rounded-lg overflow-hidden"></div>
      </div>
    );
  };

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
              {coinInfo?.priceChange24h && (
                <span className={`ml-2 ${parseFloat(coinInfo.priceChange24h) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  ({parseFloat(coinInfo.priceChange24h) >= 0 ? '+' : ''}{parseFloat(coinInfo.priceChange24h).toFixed(2)}%)
                </span>
              )}
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

      {/* Main Content Tabs */}
      <Tabs defaultValue="chart" className="w-full" key={`tabs-${symbol}`}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="chart">Qrafik</TabsTrigger>
          <TabsTrigger value="signals">Trading Siqnalları</TabsTrigger>
          <TabsTrigger value="analysis">Analiz</TabsTrigger>
          <TabsTrigger value="history">Tarixçə</TabsTrigger>
        </TabsList>

        {/* Price Chart Tab */}
        <TabsContent value="chart" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Activity className="h-5 w-5" />
                <span>{symbol}/USDT 24 Saatlıq Qrafik</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <TradingViewChart />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Trading Signals Tab */}
        <TabsContent value="signals" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Brain className="h-5 w-5" />
                <span>AI Trading Siqnalları</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {tradingSignals.length === 0 ? (
                <div className="text-center py-8">
                  <Signal className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">Bu koin üçün AI siqnalları tapılmadı</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {tradingSignals.map((signal, index) => (
                    <div key={`signal-${symbol}-${index}`} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Badge 
                            variant={signal.type === 'BUY' ? 'default' : 'secondary'}
                            className={signal.type === 'BUY' ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'}
                          >
                            {signal.type} SİQNALI
                          </Badge>
                          <Badge variant="outline" className={
                            signal.riskLevel === 'LOW' ? 'border-green-500 text-green-500' :
                            signal.riskLevel === 'HIGH' ? 'border-red-500 text-red-500' :
                            'border-yellow-500 text-yellow-500'
                          }>
                            {signal.riskLevel} RİSK
                          </Badge>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium">Etibar: {signal.confidence}%</p>
                        </div>
                      </div>
                      
                      <div className="text-sm text-muted-foreground">
                        <p className="font-medium mb-2">Səbəb:</p>
                        <p>{signal.reason}</p>
                      </div>

                      {signal.indicators.length > 0 && (
                        <div>
                          <p className="text-sm font-medium mb-2">Aktiv İndikatorlar:</p>
                          <div className="flex flex-wrap gap-2">
                            {signal.indicators.map((indicator, idx) => (
                              <Badge key={`indicator-${symbol}-${index}-${idx}`} variant="secondary" className="text-xs">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                {indicator}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {(signal.expectedTarget || signal.stopLoss) && (
                        <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                          {signal.expectedTarget && (
                            <div>
                              <p className="text-xs text-muted-foreground">Məqsəd Qiymət:</p>
                              <p className="text-sm font-bold text-green-600">
                                ${signal.expectedTarget.toFixed(6)}
                              </p>
                            </div>
                          )}
                          {signal.stopLoss && (
                            <div>
                              <p className="text-xs text-muted-foreground">Stop Loss:</p>
                              <p className="text-sm font-bold text-red-600">
                                ${signal.stopLoss.toFixed(6)}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analysis Tab */}
        <TabsContent value="analysis" className="space-y-4">
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
                <div className="pt-2 border-t">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Məqsəd Qiymət (5%):</span>
                    <span className="font-medium text-green-600">
                      ${(stats.averageBuyPrice * 1.05).toFixed(6)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Stop Loss (3%):</span>
                    <span className="font-medium text-red-600">
                      ${(stats.averageBuyPrice * 0.97).toFixed(6)}
                    </span>
                  </div>
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
                <div className="pt-2 border-t">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">ROI:</span>
                    <span className={`font-medium ${((stats.realizedProfit + stats.unrealizedProfit) / stats.totalInvested * 100) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {stats.totalInvested > 0 ? ((stats.realizedProfit + stats.unrealizedProfit) / stats.totalInvested * 100).toFixed(2) : '0.00'}%
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Current Position Alert */}
          {stats.currentHolding > 0 && (
            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="p-4">
                <div className="flex items-start space-x-3">
                  <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
                  <div className="space-y-2">
                    <h4 className="font-medium text-blue-900">Aktiv Pozisiya</h4>
                    <p className="text-sm text-blue-800">
                      Hal-hazırda {stats.currentHolding.toFixed(4)} {symbol} tutursunuz. 
                      Ortalama alış qiyməti ${stats.averageBuyPrice.toFixed(6)}.
                    </p>
                    <div className="flex space-x-4 text-xs">
                      <span className="text-green-700">
                        <Target className="h-3 w-3 inline mr-1" />
                        Məqsəd: ${(stats.averageBuyPrice * 1.05).toFixed(6)} (+5%)
                      </span>
                      <span className="text-red-700">
                        <AlertCircle className="h-3 w-3 inline mr-1" />
                        Stop: ${(stats.averageBuyPrice * 0.97).toFixed(6)} (-3%)
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-4">
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
                      key={`trade-${symbol}-${trade.id}`}
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
                          {trade.isBot && (
                            <Badge variant="outline" className="border-blue-500 text-blue-500">
                              AI BOT
                            </Badge>
                          )}
                          <span className="font-medium">{parseFloat(trade.amount).toFixed(4)} {symbol}</span>
                          <span className="text-sm text-muted-foreground">@ ${parseFloat(trade.price).toFixed(6)}</span>
                        </div>
                        
                        <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                          <div className="flex items-center space-x-1">
                            <Calendar className="h-3 w-3" />
                            <span>{format(new Date(trade.createdAt), 'dd/MM/yyyy HH:mm')}</span>
                          </div>
                          <span>Toplam: ${parseFloat(trade.total).toFixed(2)}</span>
                        </div>

                        {trade.reason && (
                          <div className="mt-2 text-xs text-muted-foreground bg-gray-50 p-2 rounded">
                            <strong>Səbəb:</strong> {trade.reason}
                          </div>
                        )}
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
