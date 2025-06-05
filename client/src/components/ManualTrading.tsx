import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { apiRequest } from '@/lib/queryClient';
import { TrendingUp, TrendingDown, DollarSign } from 'lucide-react';

interface Cryptocurrency {
  id: number;
  symbol: string;
  name: string;
  currentPrice: string;
  priceChange24h: string;
}

interface PortfolioHolding {
  id: number;
  cryptoId: number;
  amount: string;
  averagePrice: string;
  totalInvested: string;
  cryptocurrency: Cryptocurrency;
  currentValue: string;
  pnl: string;
  pnlPercentage: string;
}

export default function ManualTrading({ userId }: { userId: number }) {
  const [selectedCrypto, setSelectedCrypto] = useState<string>('');
  const [tradeAmount, setTradeAmount] = useState<string>('');
  const [tradeType, setTradeType] = useState<'buy' | 'sell'>('buy');
  
  const queryClient = useQueryClient();

  const { data: cryptos = [] } = useQuery<Cryptocurrency[]>({
    queryKey: ['/api/cryptocurrencies'],
    staleTime: 10000, // Keep crypto data fresh for 10 seconds
    gcTime: 60000, // Cache for 1 minute
    refetchOnMount: true,
  });

  const { data: portfolio = [] } = useQuery<PortfolioHolding[]>({
    queryKey: ['/api/portfolio/user', userId],
    staleTime: 500, // Fresh data for 0.5 seconds
    refetchInterval: 2000, // Backup refetch every 2 seconds
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

  const { data: user } = useQuery({
    queryKey: ['/api/user', userId],
    staleTime: 5000, // User data changes less frequently
    refetchOnMount: true,
  });

  const tradeMutation = useMutation({
    mutationFn: async (tradeData: any) => {
      return apiRequest('/api/trades/manual', {
        method: 'POST',
        body: JSON.stringify(tradeData)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/portfolio/user', userId] });
      queryClient.invalidateQueries({ queryKey: ['/api/user', userId] });
      queryClient.invalidateQueries({ queryKey: ['/api/trades/user', userId] });
      setTradeAmount('');
      setSelectedCrypto('');
    }
  });

  const sellAllProfitableMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/trades/sell-profitable', {
        method: 'POST',
        body: JSON.stringify({ userId })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/portfolio/user', userId] });
      queryClient.invalidateQueries({ queryKey: ['/api/user', userId] });
      queryClient.invalidateQueries({ queryKey: ['/api/trades/user', userId] });
    }
  });

  const handleTrade = () => {
    if (!selectedCrypto || !tradeAmount || parseFloat(tradeAmount) <= 0) return;

    const crypto = cryptos.find(c => c.id.toString() === selectedCrypto);
    if (!crypto) return;

    const currentPrice = parseFloat(crypto.currentPrice);
    let quantity: number;
    let total: number;

    if (tradeType === 'buy') {
      total = parseFloat(tradeAmount);
      quantity = total / currentPrice;
    } else {
      quantity = parseFloat(tradeAmount);
      total = quantity * currentPrice;
    }

    tradeMutation.mutate({
      userId,
      cryptoId: parseInt(selectedCrypto),
      type: tradeType,
      amount: quantity.toString(),
      price: currentPrice.toString(),
      total: total.toString(),
      isBot: false
    });
  };

  const handleSellAllProfitable = () => {
    sellAllProfitableMutation.mutate();
  };

  const profitableHoldings = portfolio.filter(holding => {
    const pnlPercentage = parseFloat(holding.pnlPercentage);
    return pnlPercentage > 0;
  });

  const totalProfitableValue = profitableHoldings.reduce((sum, holding) => {
    const pnl = parseFloat(holding.pnl);
    return sum + (pnl > 0 ? pnl : 0);
  }, 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Manual Trading
          </CardTitle>
          <CardDescription>
            Execute buy/sell orders manually for precise control
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Trade Type</label>
              <Select value={tradeType} onValueChange={(value: 'buy' | 'sell') => setTradeType(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="buy">Buy</SelectItem>
                  <SelectItem value="sell">Sell</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Cryptocurrency</label>
              <Select value={selectedCrypto} onValueChange={setSelectedCrypto}>
                <SelectTrigger>
                  <SelectValue placeholder="Select crypto" />
                </SelectTrigger>
                <SelectContent>
                  {cryptos.map((crypto) => (
                    <SelectItem key={crypto.id} value={crypto.id.toString()}>
                      {crypto.symbol} - ${parseFloat(crypto.currentPrice).toFixed(2)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">
                {tradeType === 'buy' ? 'USD Amount' : 'Quantity'}
              </label>
              <Input
                type="number"
                value={tradeAmount}
                onChange={(e) => setTradeAmount(e.target.value)}
                placeholder={tradeType === 'buy' ? "Enter USD amount" : "Enter quantity"}
              />
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button 
              onClick={handleTrade} 
              disabled={tradeMutation.isPending || !selectedCrypto || !tradeAmount}
              className="flex-1"
            >
              {tradeMutation.isPending ? 'Processing...' : `${tradeType.toUpperCase()} ${selectedCrypto ? cryptos.find(c => c.id.toString() === selectedCrypto)?.symbol : ''}`}
            </Button>
          </div>
          
          {user?.user && (
            <div className="text-sm text-muted-foreground">
              Available Balance: ${parseFloat(user.user.balance).toFixed(2)}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-green-500" />
            Profit Realization
          </CardTitle>
          <CardDescription>
            Sell all profitable positions to realize gains
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {profitableHoldings.length}
              </div>
              <div className="text-sm text-muted-foreground">Profitable Positions</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                ${totalProfitableValue.toFixed(2)}
              </div>
              <div className="text-sm text-muted-foreground">Total Unrealized Profit</div>
            </div>
            <div className="flex items-center justify-center">
              <Button 
                onClick={handleSellAllProfitable}
                disabled={sellAllProfitableMutation.isPending || profitableHoldings.length === 0}
                className="bg-green-600 hover:bg-green-700"
              >
                {sellAllProfitableMutation.isPending ? 'Selling...' : 'Sell All Profitable'}
              </Button>
            </div>
          </div>
          
          {profitableHoldings.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-medium">Profitable Holdings:</h4>
              {profitableHoldings.map((holding) => (
                <div key={holding.id} className="flex items-center justify-between p-2 bg-green-50 dark:bg-green-900/20 rounded">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{holding.cryptocurrency.symbol}</span>
                    <Badge variant="outline" className="text-green-600">
                      +{holding.pnlPercentage}%
                    </Badge>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-green-600">
                      +${parseFloat(holding.pnl).toFixed(2)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {parseFloat(holding.amount).toFixed(6)} coins
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}