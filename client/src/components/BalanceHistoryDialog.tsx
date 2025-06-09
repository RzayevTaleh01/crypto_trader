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
  cryptoId: number;
  cryptocurrency?: {
    symbol: string;
    name: string;
  };
}

interface BalanceHistoryItem {
  timestamp: string;
  action: "BUY" | "SELL" | "PROFIT" | "MANUAL_ADD" | "MANUAL_REMOVE";
  amount: number;
  description: string;
  newBalance: number;
  relatedTrade?: TradeHistoryItem;
}

export default function BalanceHistoryDialog({ isOpen, onClose, balanceType, userId }: BalanceHistoryProps) {
  const [balanceHistory, setBalanceHistory] = useState<BalanceHistoryItem[]>([]);

  const { data: userData } = useQuery({
    queryKey: [`/api/user/${userId}`],
    queryFn: async () => {
      const response = await fetch(`/api/user/${userId}`);
      return response.json();
    }
  });

  const user = userData?.user;

  const { data: tradesResponse } = useQuery({
    queryKey: [`/api/trades/user/${userId}`],
    queryFn: async () => {
      const response = await fetch(`/api/trades/user/${userId}`);
      return response.json();
    }
  });

  const trades = tradesResponse || [];

  const { data: cryptocurrencies = [] } = useQuery({
    queryKey: [`/api/cryptocurrencies`],
    queryFn: async () => {
      const response = await fetch(`/api/cryptocurrencies`);
      return response.json();
    }
  });

  useEffect(() => {
    if (!user || !trades) {
      return;
    }

    console.log('🔍 Generating balance history for', balanceType, 'balance');

    const history: BalanceHistoryItem[] = [];
    const sortedTrades = [...trades].sort((a, b) => 
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    let runningMainBalance = 0;
    let runningProfitBalance = 0;

    sortedTrades.forEach((trade) => {
      const tradeAmount = parseFloat(trade.total);
      const profit = parseFloat(trade.pnl || '0');
      
      // Find cryptocurrency info
      const crypto = cryptocurrencies.find((c: any) => c.id === trade.cryptoId);
      const cryptoSymbol = crypto?.symbol || trade.cryptocurrency?.symbol || 'Unknown';

      if (trade.type === 'BUY') {
        if (balanceType === "main") {
          runningMainBalance -= tradeAmount;
          history.push({
            timestamp: trade.createdAt,
            action: "BUY",
            amount: -tradeAmount,
            description: `${cryptoSymbol} alışı`,
            newBalance: runningMainBalance,
            relatedTrade: trade
          });
        }
      } else if (trade.type === 'SELL') {
        const originalInvestment = tradeAmount - profit;

        if (balanceType === "main") {
          // Əsas investisiya əsas balansa qayıdır
          runningMainBalance += originalInvestment;
          history.push({
            timestamp: trade.createdAt,
            action: "SELL",
            amount: originalInvestment,
            description: `${cryptoSymbol} satışından əsas investisiyanın qayıdışı`,
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
            description: `${cryptoSymbol} satışından kar`,
            newBalance: runningProfitBalance,
            relatedTrade: trade
          });
        }
      }
    });

    console.log('✅ Generated balance history:', history.length, 'entries');
    setBalanceHistory(history.reverse());
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

  const getActionColor = (action: string) => {
    switch (action) {
      case "BUY": return "text-crypto-red";
      case "SELL": return "text-crypto-blue";
      case "PROFIT": return "text-crypto-green";
      default: return "text-muted-foreground";
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case "BUY": return <TrendingDown className="h-4 w-4" />;
      case "SELL": return <ArrowRight className="h-4 w-4" />;
      case "PROFIT": return <TrendingUp className="h-4 w-4" />;
      default: return <DollarSign className="h-4 w-4" />;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            {getBalanceTitle()}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current Balance */}
          <Card>
            <CardContent className="p-4">
              <div className="text-center">
                <div className="text-sm text-muted-foreground">Cari Balans</div>
                <div className="text-2xl font-bold text-foreground">
                  ${getCurrentBalance().toFixed(2)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {balanceType === "main" 
                    ? "Trade üçün istifadə edilən əsas balans" 
                    : "Satışlardan əldə edilən kar balansı"
                  }
                </div>
              </div>
            </CardContent>
          </Card>

          {/* History */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Tarixçə</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-96">
                <div className="p-4 space-y-3">
                  {balanceHistory.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      Hələ heç bir əməliyyat yoxdur
                    </div>
                  ) : (
                    balanceHistory.map((item, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className={`${getActionColor(item.action)}`}>
                            {getActionIcon(item.action)}
                          </div>
                          <div>
                            <div className="text-sm font-medium">{item.description}</div>
                            <div className="text-xs text-muted-foreground">
                              {new Date(item.timestamp).toLocaleString('az-AZ')}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`text-sm font-medium ${item.amount >= 0 ? 'text-crypto-green' : 'text-crypto-red'}`}>
                            {item.amount >= 0 ? '+' : ''}${item.amount.toFixed(2)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Balans: ${item.newBalance.toFixed(2)}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}