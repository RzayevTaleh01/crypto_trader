
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TrendingUp, TrendingDown, DollarSign, ArrowRight } from "lucide-react";

interface BalanceHistoryProps {
  isOpen: boolean;
  onClose: () => void;
  balanceType: "main" | "profit";
  userId: number;
}

interface TradeHistoryItem {
  id: number;
  type: "BUY" | "SELL";
  amount: string;
  price: string;
  total: string;
  pnl?: string;
  createdAt: string;
  cryptoId: number;
  cryptocurrency?: {
    symbol: string;
    name: string;
  };
}

interface BalanceHistoryItem {
  timestamp: string;
  action: string;
  amount: number;
  description: string;
  newBalance: number;
  relatedTrade?: TradeHistoryItem;
}

export default function BalanceHistoryDialog({ isOpen, onClose, balanceType, userId }: BalanceHistoryProps) {
  const [balanceHistory, setBalanceHistory] = useState<BalanceHistoryItem[]>([]);
  const [trades, setTrades] = useState<TradeHistoryItem[]>([]);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  // Fetch data when dialog opens
  useEffect(() => {
    if (!isOpen || !userId) return;

    const fetchData = async () => {
      setLoading(true);
      setError("");
      
      try {
        console.log('🔄 Fetching balance history data...');
        
        // Fetch trades
        const tradesResponse = await fetch('/api/trades/user');
        console.log('📊 Trades response status:', tradesResponse.status);
        
        if (!tradesResponse.ok) {
          throw new Error(`Trades API failed: ${tradesResponse.status}`);
        }
        
        const tradesData = await tradesResponse.json();
        console.log('📊 Raw trades data:', tradesData);
        
        // Fetch user data
        const userResponse = await fetch(`/api/user/${userId}`);
        console.log('👤 User response status:', userResponse.status);
        
        if (!userResponse.ok) {
          throw new Error(`User API failed: ${userResponse.status}`);
        }
        
        const userData = await userResponse.json();
        console.log('👤 Raw user data:', userData);

        // Fetch cryptocurrencies to map trade data
        const cryptosResponse = await fetch('/api/cryptocurrencies');
        const cryptosData = await cryptosResponse.json();
        console.log('💰 Cryptos data length:', cryptosData.length);

        // Map crypto data by ID for quick lookup
        const cryptoMap = new Map();
        cryptosData.forEach((crypto: any) => {
          cryptoMap.set(crypto.id, { symbol: crypto.symbol, name: crypto.name });
        });

        // Process trades data - ensure it's an array
        let processedTrades: TradeHistoryItem[] = [];
        if (Array.isArray(tradesData)) {
          processedTrades = tradesData;
        } else if (tradesData.trades && Array.isArray(tradesData.trades)) {
          processedTrades = tradesData.trades;
        } else {
          console.warn('⚠️ Invalid trades data structure:', tradesData);
          processedTrades = [];
        }

        // Add cryptocurrency info to trades
        const tradesWithCrypto = processedTrades.map((trade: any) => ({
          ...trade,
          cryptocurrency: cryptoMap.get(trade.cryptoId) || { symbol: 'Unknown', name: 'Unknown' }
        }));

        console.log('✅ Processed trades with crypto info:', tradesWithCrypto.length);

        setTrades(tradesWithCrypto);
        setUser(userData.user || userData);
        
      } catch (error: any) {
        console.error('❌ Error fetching balance history data:', error);
        setError(error.message || 'Məlumatları yükləyərkən xəta baş verdi');
        setTrades([]);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isOpen, userId]);

  // Generate balance history from trades
  useEffect(() => {
    if (!trades.length || !user) {
      console.log('⚠️ Cannot generate balance history - missing trades or user data');
      setBalanceHistory([]);
      return;
    }

    console.log('🔄 Generating balance history for', balanceType, 'balance');

    const history: BalanceHistoryItem[] = [];
    let runningMainBalance = 20.00; // Başlanğıc balans
    let runningProfitBalance = 0.00;

    // Başlanğıc balansı əlavə et
    if (balanceType === "main") {
      history.push({
        timestamp: new Date(Date.now() - trades.length * 24 * 60 * 60 * 1000).toISOString(),
        action: "INITIAL",
        amount: 20.00,
        description: "Başlanğıc əsas balans",
        newBalance: 20.00
      });
    }

    // Tarixə görə trades sırala
    const sortedTrades = [...trades].sort((a, b) => 
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    console.log('📊 Processing', sortedTrades.length, 'sorted trades');

    sortedTrades.forEach((trade, index) => {
      const tradeAmount = parseFloat(trade.total);
      const profit = parseFloat(trade.pnl || '0');

      console.log(`🔍 Processing trade ${index + 1}:`, {
        type: trade.type,
        symbol: trade.cryptocurrency?.symbol,
        amount: tradeAmount,
        profit: profit
      });

      if (trade.type === 'BUY') {
        // Alış zamanı əsas balansdan çıxılır
        if (balanceType === "main") {
          runningMainBalance -= tradeAmount;
          history.push({
            timestamp: trade.createdAt,
            action: "BUY",
            amount: -tradeAmount,
            description: `${trade.cryptocurrency?.symbol || 'Unknown'} alışı üçün ödəniş`,
            newBalance: runningMainBalance,
            relatedTrade: trade
          });
        }
      } else if (trade.type === 'SELL') {
        const originalInvestment = tradeAmount - profit;

        if (balanceType === "main") {
          // Satış zamanı əsas investisiya əsas balansa qayıdır
          runningMainBalance += originalInvestment;
          history.push({
            timestamp: trade.createdAt,
            action: "SELL_RETURN",
            amount: originalInvestment,
            description: `${trade.cryptocurrency?.symbol || 'Unknown'} satışından əsas investisiyanın qayıdışı`,
            newBalance: runningMainBalance,
            relatedTrade: trade
          });
        } else if (balanceType === "profit" && profit > 0) {
          // Kar kar balansına əlavə edilir
          runningProfitBalance += profit;
          history.push({
            timestamp: trade.createdAt,
            action: "PROFIT",
            amount: profit,
            description: `${trade.cryptocurrency?.symbol || 'Unknown'} satışından kar`,
            newBalance: runningProfitBalance,
            relatedTrade: trade
          });
        }
      }
    });

    console.log('✅ Generated balance history:', history.length, 'entries');
    setBalanceHistory(history.reverse()); // Ən yenidən köhnəyə
  }, [trades, user, balanceType]);

  const getCurrentBalance = () => {
    if (balanceType === "main") {
      return parseFloat(user?.balance || '0');
    } else {
      return parseFloat(user?.profitBalance || '0');
    }
  };

  const getBalanceTitle = () => {
    return balanceType === "main" ? "Əsas Balans Tarixçəsi" : "Kar Balansı Tarixçəsi";
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('az-AZ', {
      day: '2-digit',
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[95vh] overflow-hidden flex flex-col">
        <DialogHeader className="border-b border-border pb-4">
          <DialogTitle className="flex items-center gap-3 text-xl">
            <div className="bg-crypto-green/10 p-2 rounded-lg">
              <DollarSign className="h-6 w-6 text-crypto-green" />
            </div>
            {getBalanceTitle()}
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-2">
            Bu balansın necə formalaşdığını və tarixçəsini görə bilərsiniz
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          <div className="space-y-6 h-full overflow-y-auto pr-2">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="relative mx-auto mb-4">
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-crypto-green/20 border-t-crypto-green"></div>
                  <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-crypto-green/40 animate-pulse"></div>
                </div>
                <p className="text-lg font-medium text-foreground">Məlumatlar yüklənir...</p>
                <p className="text-sm text-muted-foreground mt-1">Balans tarixçəsi hazırlanır</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center bg-destructive/10 border border-destructive/20 rounded-lg p-6">
                <div className="bg-destructive/20 p-3 rounded-full w-fit mx-auto mb-3">
                  <svg className="h-6 w-6 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <p className="text-destructive font-semibold text-lg">Xəta baş verdi</p>
                <p className="text-sm text-muted-foreground mt-2">{error}</p>
                <button 
                  onClick={() => window.location.reload()} 
                  className="mt-4 px-4 py-2 bg-crypto-green text-white rounded-md hover:bg-crypto-green/80 transition-colors"
                >
                  Yenidən cəhd et
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Cari Balans */}
              <Card className="bg-gradient-to-br from-crypto-green/5 to-crypto-green/10 border-crypto-green/20">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <div className="bg-crypto-green/20 p-1.5 rounded-md">
                      <div className="h-4 w-4 text-crypto-green" />
                    </div>
                    Cari Balans
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-4xl font-bold text-crypto-green mb-2">
                    ${getCurrentBalance().toFixed(2)}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {balanceType === "main" 
                      ? "🎯 Ticarət üçün istifadə edilən balans" 
                      : "💰 Satışlardan əldə edilən kar"
                    }
                  </p>
                  <div className="mt-3 text-xs text-crypto-green/80 bg-crypto-green/10 rounded-md px-2 py-1 w-fit">
                    {balanceType === "main" ? "Əsas Balans" : "Kar Balansı"}
                  </div>
                </CardContent>
              </Card>

              {/* Balans Tarixçəsi */}
              <Card className="flex-1">
                <CardHeader className="bg-muted/30 rounded-t-lg">
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-crypto-green" />
                    Balans Dəyişiklikləri
                    <Badge variant="secondary" className="ml-auto">
                      {balanceHistory.length} əməliyyat
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-2 p-4">
                      {balanceHistory.length === 0 ? (
                        <div className="text-center py-12">
                          <div className="bg-muted/50 rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                            <DollarSign className="h-8 w-8 text-muted-foreground" />
                          </div>
                          <p className="text-lg font-medium text-muted-foreground">
                            {balanceType === "profit" 
                              ? "Hələ kar əldə edilməyib" 
                              : "Balans dəyişikliyi yoxdur"
                            }
                          </p>
                          <p className="text-sm text-muted-foreground/70 mt-1">
                            {balanceType === "profit" 
                              ? "Coin satışından sonra kar burada görünəcək" 
                              : "Alış-satış əməliyyatları burada izlənəcək"
                            }
                          </p>
                        </div>
                      ) : (
                        balanceHistory.map((item, index) => (
                          <div key={index} className="group hover:bg-muted/50 transition-colors duration-200">
                            <div className="flex items-center justify-between p-4 border-l-4 border-transparent group-hover:border-crypto-green/30">
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                  <div className={`p-2 rounded-full ${
                                    item.action === "BUY" 
                                      ? "bg-crypto-red/10" 
                                      : item.action === "PROFIT" 
                                      ? "bg-crypto-green/10"
                                      : "bg-crypto-blue/10"
                                  }`}>
                                    {item.action === "BUY" ? (
                                      <TrendingDown className="h-4 w-4 text-crypto-red" />
                                    ) : item.action === "PROFIT" ? (
                                      <TrendingUp className="h-4 w-4 text-crypto-green" />
                                    ) : (
                                      <ArrowRight className="h-4 w-4 text-crypto-blue" />
                                    )}
                                  </div>
                                  
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <Badge 
                                        variant={item.action === "BUY" ? "destructive" : 
                                                item.action === "PROFIT" ? "default" : "secondary"}
                                        className="text-xs font-medium"
                                      >
                                        {item.action === "INITIAL" ? "🎯 BAŞLANĞIC" :
                                         item.action === "BUY" ? "🛒 ALIŞ" :
                                         item.action === "SELL_RETURN" ? "↩️ QAYTARMA" :
                                         item.action === "PROFIT" ? "💰 KAR" : item.action}
                                      </Badge>
                                      <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded">
                                        {formatTime(item.timestamp)}
                                      </span>
                                    </div>
                                    
                                    <p className="text-sm font-medium mt-1 text-foreground">
                                      {item.description}
                                    </p>
                                    
                                    {item.relatedTrade && (
                                      <div className="mt-2 text-xs text-muted-foreground bg-muted/30 rounded px-2 py-1 w-fit">
                                        📊 {item.relatedTrade.amount} {item.relatedTrade.cryptocurrency?.symbol || 'Unknown'} × 
                                        ${parseFloat(item.relatedTrade.price).toFixed(4)}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="text-right ml-4">
                                <div className={`text-xl font-bold mb-1 ${
                                  item.amount >= 0 ? 'text-crypto-green' : 'text-crypto-red'
                                }`}>
                                  {item.amount >= 0 ? '+' : ''}${Math.abs(item.amount).toFixed(2)}
                                </div>
                                
                                <div className="flex items-center gap-1 text-sm text-muted-foreground bg-muted/30 rounded px-2 py-1">
                                  <ArrowRight className="h-3 w-3" />
                                  <span className="font-medium">${item.newBalance.toFixed(2)}</span>
                                </div>
                              </div>
                            </div>
                            {index < balanceHistory.length - 1 && (
                              <Separator className="mx-4" />
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Xülasə */}
              {balanceHistory.length > 0 && (
                <Card className="bg-gradient-to-r from-crypto-blue/5 to-crypto-green/5 border-crypto-blue/20">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <div className="bg-crypto-blue/20 p-1.5 rounded-md">
                        <svg className="h-4 w-4 text-crypto-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                      </div>
                      Xülasə Məlumatları
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-white/5 rounded-lg p-3">
                        <div className="text-2xl font-bold text-crypto-blue mb-1">
                          {balanceHistory.length}
                        </div>
                        <p className="text-sm text-muted-foreground">📊 Ümumi əməliyyat</p>
                      </div>
                      <div className="bg-white/5 rounded-lg p-3">
                        <div className="text-sm font-medium text-foreground mb-1">
                          {balanceHistory[0] ? formatTime(balanceHistory[0].timestamp) : 'Yoxdur'}
                        </div>
                        <p className="text-sm text-muted-foreground">🕐 Son yeniləmə</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
