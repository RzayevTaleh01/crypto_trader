import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Play, Square, Bot, Settings, TrendingUp, Zap, Target } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface BotSettingsProps {
  userId: number;
}

interface BotConfig {
  strategy: string;
  riskLevel: number;
  maxDailyLoss: string;
  targetProfit: string;
  isActive: boolean;
}

interface TradingStrategy {
  id: string;
  name: string;
  description: string;
  riskLevel: string;
  expectedReturn: string;
  timeframe: string;
}

export default function BotSettings({ userId }: BotSettingsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [config, setConfig] = useState<BotConfig>({
    strategy: 'rsi',
    riskLevel: 5,
    maxDailyLoss: '50',
    targetProfit: '100',
    isActive: false
  });

  const [hasLoaded, setHasLoaded] = useState(false);

  const { data: serverSettings } = useQuery({
    queryKey: ['/api/bot-settings'],
    refetchInterval: 3000,
  });

  const { data: availableStrategies } = useQuery({
    queryKey: ['/api/strategies/available'],
  });

  // Load server settings only once with type safety
  useEffect(() => {
    if (serverSettings && !hasLoaded) {
      setConfig({
        strategy: serverSettings.strategy || 'rsi',
        riskLevel: serverSettings.riskLevel || 5,
        maxDailyLoss: serverSettings.maxDailyLoss || '50',
        targetProfit: serverSettings.targetProfit || '100',
        isActive: Boolean(serverSettings.isActive)
      });
      setHasLoaded(true);
    }
  }, [serverSettings, hasLoaded]);

  // Update only bot status from server
  useEffect(() => {
    if (serverSettings && hasLoaded) {
      setConfig(prev => ({
        ...prev,
        isActive: Boolean(serverSettings.isActive)
      }));
    }
  }, [serverSettings?.isActive, hasLoaded]);

  const updateMutation = useMutation({
    mutationFn: async (newConfig: Partial<BotConfig>) => {
      const response = await fetch(`/api/bot-settings/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig)
      });
      if (!response.ok) throw new Error('Failed to update settings');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/bot-settings'] });
    },
    onError: () => {
      toast({
        title: "Xəta",
        description: "Bot ayarları yenilənmədi.",
        variant: "destructive",
      });
    }
  });

  const handleConfigChange = (key: keyof BotConfig, value: any) => {
    const newConfig = { ...config, [key]: value };
    setConfig(newConfig);
    
    // Update server immediately
    updateMutation.mutate({ [key]: value });
  };

  const handleStartBot = () => {
    if (!config.strategy) {
      toast({
        title: "Xəta",
        description: "Əvvəlcə bir strategiya seçin.",
        variant: "destructive",
      });
      return;
    }
    
    const startConfig = { ...config, isActive: true };
    setConfig(startConfig);
    updateMutation.mutate(startConfig);
    
    toast({
      title: "Bot işə salındı",
      description: `${config.strategy} strategiyası ilə avtomatik ticarət başladı.`,
    });
  };

  const handleStopBot = () => {
    const stopConfig = { ...config, isActive: false };
    setConfig(stopConfig);
    updateMutation.mutate({ isActive: false });
    
    toast({
      title: "Bot dayandırıldı",
      description: "Avtomatik ticarət dayandırıldı.",
    });
  };

  const isRunning = config.isActive;
  const isUpdating = updateMutation.isPending;

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold flex items-center">
            <Bot className="h-5 w-5 mr-2 text-crypto-blue" />
            Bot Configuration
          </h3>
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-crypto-green animate-pulse' : 'bg-gray-400'}`} />
            <span className={`text-sm font-medium ${isRunning ? 'text-crypto-green' : 'text-gray-500'}`}>
              {isRunning ? 'Aktiv' : 'Dayandırılıb'}
            </span>
          </div>
        </div>
        
        <div className="space-y-6">
          {/* Available Strategies */}
          <div className="space-y-4">
            <Label className="text-sm font-medium mb-3 block">Mövcud Ticarət Strategiyaları</Label>
            
            {availableStrategies?.strategies?.map((strategy: TradingStrategy) => (
              <div 
                key={strategy.id}
                className={`p-4 rounded-lg border-2 transition-all cursor-pointer ${
                  config.strategy === strategy.id
                    ? 'border-crypto-blue bg-crypto-blue/10'
                    : 'border-border bg-background hover:border-crypto-blue/50'
                }`}
                onClick={() => !isRunning && !isUpdating && handleConfigChange('strategy', strategy.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center space-x-2">
                      <h4 className="font-semibold text-foreground">{strategy.name}</h4>
                      {strategy.id === 'rsi' && <Target className="h-4 w-4 text-crypto-blue" />}
                      {strategy.id === 'momentum' && <TrendingUp className="h-4 w-4 text-crypto-green" />}
                      {strategy.id === 'arbitrage' && <Zap className="h-4 w-4 text-crypto-orange" />}
                      {strategy.id === 'advanced' && <Bot className="h-4 w-4 text-crypto-red" />}
                    </div>
                    <p className="text-sm text-muted-foreground">{strategy.description}</p>
                    
                    <div className="flex flex-wrap gap-2 mt-3">
                      <Badge variant="outline" className="text-xs">
                        Risk: {strategy.riskLevel}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        Qazanc: {strategy.expectedReturn}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        Müddət: {strategy.timeframe}
                      </Badge>
                    </div>
                  </div>
                  
                  {config.strategy === strategy.id && (
                    <div className="ml-3">
                      <div className="w-2 h-2 bg-crypto-blue rounded-full animate-pulse" />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Risk Level */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Risk Səviyyəsi: {config.riskLevel}</Label>
            <Slider
              value={[config.riskLevel]}
              onValueChange={(value) => handleConfigChange('riskLevel', value[0])}
              max={10}
              min={1}
              step={1}
              className="flex-1"
              disabled={isRunning || isUpdating}
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>Təhlükəsiz (1)</span>
              <span>Yüksək Risk (10)</span>
            </div>
          </div>

          {/* Max Daily Loss */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Maksimum Gündəlik Zərər ($)</Label>
            <Input
              type="number"
              value={config.maxDailyLoss}
              onChange={(e) => handleConfigChange('maxDailyLoss', e.target.value)}
              className="bg-background border-border"
              placeholder="50"
              disabled={isRunning || isUpdating}
            />
          </div>

          {/* Target Profit */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Gündəlik Hədəf Qazanc ($)</Label>
            <Input
              type="number"
              value={config.targetProfit}
              onChange={(e) => handleConfigChange('targetProfit', e.target.value)}
              className="bg-background border-border"
              placeholder="100"
              disabled={isRunning || isUpdating}
            />
          </div>

          {/* Bot Control Buttons */}
          <div className="flex space-x-3 pt-4 border-t border-border">
            <Button
              className="flex-1 bg-crypto-green text-white hover:bg-crypto-green/80"
              onClick={handleStartBot}
              disabled={isRunning || isUpdating}
            >
              <Play className="h-4 w-4 mr-2" />
              {isRunning ? 'Bot İşləyir' : 'Avtomatik Başlat'}
            </Button>
            <Button
              className="flex-1 bg-crypto-red text-white hover:bg-crypto-red/80"
              onClick={handleStopBot}
              disabled={!isRunning || isUpdating}
            >
              <Square className="h-4 w-4 mr-2" />
              Botu Dayandır
            </Button>
          </div>

          {/* EMA-RSI Strategy Info */}
          <div className="bg-crypto-blue/5 rounded-lg p-4 border border-crypto-blue/20">
            <Label className="text-sm font-medium block mb-3 text-crypto-blue">
              🎯 EMA-RSI Strategiya - Python Əsaslı Avtomatik Treyd
            </Label>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>• EMA20/EMA50 crossover sinyalları</p>
              <p>• RSI 30/70 səviyyələri</p>
              <p>• Volume filtri və risk idarəsi</p>
              <p>• Binance testnet üzərində real data</p>
            </div>
          </div>



          {/* Current Strategy Display */}
          <div className="bg-background/50 rounded-lg p-3 border border-border">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Seçilmiş Strategiya:</span>
              <span className="font-medium text-crypto-blue">
                {availableStrategies?.strategies?.find((s: TradingStrategy) => s.id === config.strategy)?.name || config.strategy}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm mt-1">
              <span className="text-muted-foreground">Risk Səviyyəsi:</span>
              <span className="font-medium">{config.riskLevel}/10</span>
            </div>
            <div className="flex items-center justify-between text-sm mt-1">
              <span className="text-muted-foreground">Bot Status:</span>
              <span className={`font-medium ${isRunning ? 'text-crypto-green' : 'text-gray-500'}`}>
                {isRunning ? 'Avtomatik İşləyir' : 'Manuel Nəzarət'}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}