import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";

interface RecentTradesProps {
  userId: number;
}

export default function RecentTrades({ userId }: RecentTradesProps) {
  const { data: tradesResponse } = useQuery({
    queryKey: ['/api/trades/user', userId],
    enabled: !!userId,
    refetchInterval: 5000, // Refresh every 5 seconds for real-time updates
  });

  const trades = tradesResponse?.trades || [];

  const getColorClasses = (symbol: string) => {
    const colors = {
      'BTC': 'bg-orange-500',
      'ETH': 'bg-gray-400',
      'BNB': 'bg-yellow-400',
      'ADA': 'bg-blue-500',
      'SOL': 'bg-purple-500',
      'DOT': 'bg-pink-500',
      'MATIC': 'bg-indigo-500',
      'LINK': 'bg-blue-600'
    };
    return colors[symbol as keyof typeof colors] || 'bg-gray-500';
  };

  const getTextColor = (symbol: string) => {
    return ['BNB'].includes(symbol) ? 'text-black' : 'text-white';
  };

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold">Recent Trades</h3>
          <Button variant="ghost" className="text-crypto-blue hover:text-crypto-blue/80 text-sm font-medium">
            View All
          </Button>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-muted-foreground text-sm border-b border-border">
                <th className="text-left py-3">Pair</th>
                <th className="text-left py-3">Type</th>
                <th className="text-left py-3">Amount</th>
                <th className="text-left py-3">P&L</th>
                <th className="text-left py-3">Time</th>
              </tr>
            </thead>
            <tbody>
              {trades.slice(0, 10).map((trade: any) => {
                const pnl = parseFloat(trade.pnl || "0");
                const isProfit = pnl >= 0;
                
                return (
                  <tr key={trade.id} className="border-b border-border/50">
                    <td className="py-3">
                      <div className="flex items-center space-x-2">
                        <div className={`w-6 h-6 ${getColorClasses(trade.cryptocurrency?.symbol)} rounded-full flex items-center justify-center`}>
                          <span className={`text-xs font-bold ${getTextColor(trade.cryptocurrency?.symbol)}`}>
                            {trade.cryptocurrency?.symbol?.slice(0, 1) || 'C'}
                          </span>
                        </div>
                        <span className="font-medium">
                          {trade.cryptocurrency?.symbol || 'UNKNOWN'}/USDT
                        </span>
                      </div>
                    </td>
                    <td className="py-3">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        trade.type === 'buy' 
                          ? 'bg-crypto-green/20 text-crypto-green' 
                          : 'bg-crypto-red/20 text-crypto-red'
                      }`}>
                        {trade.type.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 text-muted-foreground">
                      {parseFloat(trade.amount).toFixed(6)}
                    </td>
                    <td className="py-3">
                      <span className={`font-medium ${isProfit ? 'text-crypto-green' : 'text-crypto-red'}`}>
                        {isProfit ? '+' : ''}${Math.abs(pnl).toFixed(2)}
                      </span>
                    </td>
                    <td className="py-3 text-muted-foreground text-sm">
                      {formatDistanceToNow(new Date(trade.createdAt), { addSuffix: true })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          
          {trades.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No trades yet. Start trading to see your history here.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
