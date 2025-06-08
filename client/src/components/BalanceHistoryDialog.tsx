
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TrendingUp, TrendingDown, DollarSign, ArrowRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

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
  cryptocurrency: {
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

  const { data: trades } = useQuery<TradeHistoryItem[]>({
    queryKey: ['/api/trades/user', userId],
    enabled: isOpen && !!userId,
  });

  const { data: user } = useQuery({
    queryKey: ['/api/user', userId],
    enabled: isOpen && !!userId,
  });

  useEffect(() => {
    if (!trades || !user) return;

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

    sortedTrades.forEach(trade => {
      const tradeAmount = parseFloat(trade.total);
      const profit = parseFloat(trade.pnl || '0');

      if (trade.type === 'BUY') {
        // Alış zamanı əsas balansdan çıxılır
        if (balanceType === "main") {
          runningMainBalance -= tradeAmount;
          history.push({
            timestamp: trade.createdAt,
            action: "BUY",
            amount: -tradeAmount,
            description: `${trade.cryptocurrency.symbol} alışı üçün ödəniş`,
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
            description: `${trade.cryptocurrency.symbol} satışından əsas investisiyanın qayıdışı`,
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
            description: `${trade.cryptocurrency.symbol} satışından kar`,
            newBalance: runningProfitBalance,
            relatedTrade: trade
          });
        }
      }
    });

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
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            {getBalanceTitle()}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Cari Balans */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Cari Balans</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">
                ${getCurrentBalance().toFixed(2)}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {balanceType === "main" 
                  ? "Ticarət üçün istifadə edilən balans" 
                  : "Satışlardan əldə edilən kar"
                }
              </p>
            </CardContent>
          </Card>

          {/* Balans Tarixçəsi */}
          <Card>
            <CardHeader>
              <CardTitle>Balans Dəyişiklikləri</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-96">
                <div className="space-y-3">
                  {balanceHistory.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      {balanceType === "profit" 
                        ? "Hələ kar əldə edilməyib" 
                        : "Balans dəyişikliyi yoxdur"
                      }
                    </div>
                  ) : (
                    balanceHistory.map((item, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            {item.action === "BUY" ? (
                              <TrendingDown className="h-4 w-4 text-red-500" />
                            ) : (
                              <TrendingUp className="h-4 w-4 text-green-500" />
                            )}
                            <Badge 
                              variant={item.action === "BUY" ? "destructive" : "default"}
                              className="text-xs"
                            >
                              {item.action === "INITIAL" ? "BAŞLANĞIC" :
                               item.action === "BUY" ? "ALIŞ" :
                               item.action === "SELL_RETURN" ? "GERI QAYTARMA" :
                               item.action === "PROFIT" ? "KAR" : item.action}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              {formatTime(item.timestamp)}
                            </span>
                          </div>
                          
                          <p className="text-sm font-medium">
                            {item.description}
                          </p>
                          
                          {item.relatedTrade && (
                            <div className="mt-1 text-xs text-muted-foreground">
                              {item.relatedTrade.amount} {item.relatedTrade.cryptocurrency.symbol} × 
                              ${parseFloat(item.relatedTrade.price).toFixed(4)}
                            </div>
                          )}
                        </div>

                        <div className="text-right">
                          <div className={`text-lg font-bold ${
                            item.amount >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {item.amount >= 0 ? '+' : ''}${Math.abs(item.amount).toFixed(2)}
                          </div>
                          
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <ArrowRight className="h-3 w-3" />
                            <span>${item.newBalance.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Xülasə */}
          {balanceHistory.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Xülasə</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Ümumi əməliyyat: </span>
                    <span className="font-medium">{balanceHistory.length}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Son yeniləmə: </span>
                    <span className="font-medium">
                      {balanceHistory[0] ? formatTime(balanceHistory[0].timestamp) : 'Yoxdur'}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
