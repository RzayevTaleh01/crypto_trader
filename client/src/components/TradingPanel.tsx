import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, DollarSign, Coins } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface TradingPanelProps {
  userId: number;
}

export default function TradingPanel({ userId }: TradingPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedCrypto, setSelectedCrypto] = useState<string>("");
  const [tradeType, setTradeType] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState<string>("");
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [limitPrice, setLimitPrice] = useState<string>("");

  // Fetch cryptocurrencies and user data
  const { data: cryptocurrencies = [] } = useQuery({
    queryKey: ['/api/cryptocurrencies'],
    refetchInterval: 10000,
  });

  const { data: user } = useQuery({
    queryKey: ['/api/user', userId],
  });

  const { data: portfolio = [] } = useQuery({
    queryKey: ['/api/portfolio/user', userId],
  });

  // Execute trade mutation
  const executeTradeMutation = useMutation({
    mutationFn: async (tradeData: any) => {
      return apiRequest('POST', '/api/trades', tradeData);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/trades/user'] });
      queryClient.invalidateQueries({ queryKey: ['/api/portfolio/user'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      queryClient.invalidateQueries({ queryKey: ['/api/analytics/user'] });
      
      toast({
        title: "Trade Executed",
        description: data.message,
      });
      
      // Reset form
      setAmount("");
      setLimitPrice("");
    },
    onError: (error: any) => {
      toast({
        title: "Trade Failed",
        description: error.message || "Failed to execute trade",
        variant: "destructive",
      });
    }
  });

  const selectedCryptoData = cryptocurrencies.find((c: any) => c.id.toString() === selectedCrypto);
  const currentPrice = selectedCryptoData ? parseFloat(selectedCryptoData.currentPrice) : 0;
  const priceChange = selectedCryptoData ? parseFloat(selectedCryptoData.priceChange24h) : 0;
  
  const portfolioItem = portfolio.find((p: any) => p.cryptoId.toString() === selectedCrypto);
  const availableAmount = portfolioItem ? parseFloat(portfolioItem.amount) : 0;
  
  const calculateTotal = () => {
    const price = orderType === "limit" && limitPrice ? parseFloat(limitPrice) : currentPrice;
    const qty = parseFloat(amount) || 0;
    return (price * qty).toFixed(2);
  };

  const calculateMaxAmount = () => {
    if (tradeType === "buy") {
      const price = orderType === "limit" && limitPrice ? parseFloat(limitPrice) : currentPrice;
      const balance = parseFloat(user?.balance || "0");
      return price > 0 ? (balance / price).toFixed(6) : "0";
    } else {
      return availableAmount.toFixed(6);
    }
  };

  const handleExecuteTrade = () => {
    if (!selectedCrypto || !amount || parseFloat(amount) <= 0) {
      toast({
        title: "Invalid Trade",
        description: "Please select a cryptocurrency and enter a valid amount",
        variant: "destructive",
      });
      return;
    }

    const price = orderType === "limit" && limitPrice ? parseFloat(limitPrice) : currentPrice;
    
    if (orderType === "limit" && (!limitPrice || parseFloat(limitPrice) <= 0)) {
      toast({
        title: "Invalid Limit Price",
        description: "Please enter a valid limit price",
        variant: "destructive",
      });
      return;
    }

    const tradeData = {
      userId,
      cryptoId: parseInt(selectedCrypto),
      type: tradeType,
      amount,
      price: price.toString(),
      total: calculateTotal(),
      isBot: false
    };

    executeTradeMutation.mutate(tradeData);
  };

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
        <h3 className="text-xl font-bold mb-6">Manual Trading</h3>
        
        <Tabs value={tradeType} onValueChange={(value) => setTradeType(value as "buy" | "sell")} className="mb-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="buy" className="data-[state=active]:bg-crypto-green data-[state=active]:text-white">
              <TrendingUp className="h-4 w-4 mr-2" />
              Buy
            </TabsTrigger>
            <TabsTrigger value="sell" className="data-[state=active]:bg-crypto-red data-[state=active]:text-white">
              <TrendingDown className="h-4 w-4 mr-2" />
              Sell
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="space-y-4">
          {/* Cryptocurrency Selection */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Cryptocurrency</Label>
            <Select value={selectedCrypto} onValueChange={setSelectedCrypto}>
              <SelectTrigger className="w-full bg-background border-border">
                <SelectValue placeholder="Select cryptocurrency" />
              </SelectTrigger>
              <SelectContent>
                {cryptocurrencies.map((crypto: any) => (
                  <SelectItem key={crypto.id} value={crypto.id.toString()}>
                    <div className="flex items-center space-x-2">
                      <div className={`w-6 h-6 ${getColorClasses(crypto.symbol)} rounded-full flex items-center justify-center`}>
                        <span className={`text-xs font-bold ${getTextColor(crypto.symbol)}`}>
                          {crypto.symbol.slice(0, 1)}
                        </span>
                      </div>
                      <span>{crypto.symbol} - ${parseFloat(crypto.currentPrice).toFixed(2)}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Price Info */}
          {selectedCryptoData && (
            <div className="bg-background rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-lg font-bold">${currentPrice.toFixed(2)}</p>
                  <p className="text-muted-foreground text-sm">{selectedCryptoData.name}</p>
                </div>
                <div className="text-right">
                  <div className="flex items-center space-x-1">
                    {priceChange >= 0 ? (
                      <TrendingUp className="h-4 w-4 text-crypto-green" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-crypto-red" />
                    )}
                    <p className={`text-sm font-medium ${priceChange >= 0 ? 'text-crypto-green' : 'text-crypto-red'}`}>
                      {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
                    </p>
                  </div>
                  {tradeType === "sell" && portfolioItem && (
                    <Badge variant="secondary" className="mt-1">
                      Available: {availableAmount.toFixed(6)}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Order Type */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Order Type</Label>
            <Select value={orderType} onValueChange={(value) => setOrderType(value as "market" | "limit")}>
              <SelectTrigger className="w-full bg-background border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="market">Market Order</SelectItem>
                <SelectItem value="limit">Limit Order</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Limit Price (if limit order) */}
          {orderType === "limit" && (
            <div>
              <Label className="text-sm font-medium mb-2 block">Limit Price ($)</Label>
              <Input
                type="number"
                value={limitPrice}
                onChange={(e) => setLimitPrice(e.target.value)}
                className="bg-background border-border"
                placeholder="Enter limit price"
                step="0.01"
              />
            </div>
          )}

          {/* Amount */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-medium">Amount</Label>
              <Button
                variant="ghost"
                size="sm"
                className="text-crypto-blue text-xs"
                onClick={() => setAmount(calculateMaxAmount())}
              >
                Max: {calculateMaxAmount()}
              </Button>
            </div>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="bg-background border-border"
              placeholder="Enter amount"
              step="0.000001"
            />
          </div>

          {/* Total */}
          {amount && selectedCryptoData && (
            <div className="bg-background rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Total</span>
                </div>
                <span className="text-lg font-bold">${calculateTotal()}</span>
              </div>
              {tradeType === "buy" && (
                <p className="text-muted-foreground text-xs mt-1">
                  Available balance: ${user?.balance || '0.00'}
                </p>
              )}
            </div>
          )}

          {/* Execute Button */}
          <Button
            className={`w-full ${tradeType === 'buy' ? 'bg-crypto-green hover:bg-crypto-green/80' : 'bg-crypto-red hover:bg-crypto-red/80'} text-white`}
            onClick={handleExecuteTrade}
            disabled={executeTradeMutation.isPending || !selectedCrypto || !amount}
          >
            <Coins className="h-4 w-4 mr-2" />
            {executeTradeMutation.isPending 
              ? `Processing ${tradeType}...` 
              : `${tradeType === 'buy' ? 'Buy' : 'Sell'} ${selectedCryptoData?.symbol || ''}`
            }
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}