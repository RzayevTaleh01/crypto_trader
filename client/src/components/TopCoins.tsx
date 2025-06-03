import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown } from "lucide-react";

export default function TopCoins() {
  const { data: cryptocurrencies = [] } = useQuery({
    queryKey: ['/api/cryptocurrencies'],
    refetchInterval: 30000, // Refetch every 30 seconds
  });

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
        <h3 className="text-xl font-bold mb-6">Top Performing Coins</h3>
        <div className="space-y-4">
          {cryptocurrencies.slice(0, 8).map((coin: any) => {
            const priceChange = parseFloat(coin.priceChange24h || "0");
            const isPositive = priceChange >= 0;
            
            return (
              <div key={coin.id} className="flex items-center justify-between p-3 bg-background rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className={`w-8 h-8 ${getColorClasses(coin.symbol)} rounded-full flex items-center justify-center`}>
                    <span className={`text-xs font-bold ${getTextColor(coin.symbol)}`}>
                      {coin.symbol.slice(0, 3)}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium">{coin.symbol}</p>
                    <p className="text-muted-foreground text-sm">{coin.name}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold">
                    ${parseFloat(coin.currentPrice).toLocaleString(undefined, { 
                      minimumFractionDigits: 2, 
                      maximumFractionDigits: coin.currentPrice < 1 ? 6 : 2 
                    })}
                  </p>
                  <div className="flex items-center space-x-1">
                    {isPositive ? (
                      <TrendingUp className="h-3 w-3 text-crypto-green" />
                    ) : (
                      <TrendingDown className="h-3 w-3 text-crypto-red" />
                    )}
                    <p className={`text-sm ${isPositive ? 'text-crypto-green' : 'text-crypto-red'}`}>
                      {isPositive ? '+' : ''}{priceChange.toFixed(2)}%
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <Button 
          className="w-full mt-4 bg-crypto-green/20 text-crypto-green hover:bg-crypto-green/30 border-0"
          variant="outline"
        >
          Analyze More Coins
        </Button>
      </CardContent>
    </Card>
  );
}
