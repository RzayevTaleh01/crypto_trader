import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Play, Square, Bot, Settings } from "lucide-react";
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

export default function BotSettings({ userId }: BotSettingsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [config, setConfig] = useState<BotConfig>({
    strategy: 'scalping',
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

  // Load server settings only once with type safety
  useEffect(() => {
    if (serverSettings && !hasLoaded) {
      const safeSettings = serverSettings || {};
      setConfig({
        strategy: safeSettings.strategy || 'scalping',
        riskLevel: safeSettings.riskLevel || 5,
        maxDailyLoss: safeSettings.maxDailyLoss || '50',
        targetProfit: safeSettings.targetProfit || '100',
        isActive: Boolean(safeSettings.isActive)
      });
      setHasLoaded(true);
    }
  }, [serverSettings, hasLoaded]);

  // Update only bot status from server
  useEffect(() => {
    if (serverSettings && hasLoaded) {
      const safeSettings = serverSettings || {};
      setConfig(prev => ({
        ...prev,
        isActive: Boolean(safeSettings.isActive)
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
    const startConfig = { ...config, isActive: true };
    setConfig(startConfig);
    updateMutation.mutate(startConfig);
    
    toast({
      title: "Bot işə salındı",
      description: `${config.strategy} strategiyası ilə ticarət başladı.`,
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
          {/* Trading Strategy */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Ticarət Strategiyası</Label>
            <Select 
              value={config.strategy} 
              onValueChange={(value) => handleConfigChange('strategy', value)}
              disabled={isRunning || isUpdating}
            >
              <SelectTrigger className="w-full bg-background border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="scalping">Scalping - Qısa müddətli qazanc</SelectItem>
                <SelectItem value="momentum">Momentum - Trend izləmə</SelectItem>
                <SelectItem value="mean-reversion">Mean Reversion - Orta dəyər qaytarma</SelectItem>
                <SelectItem value="grid">Grid - Şəbəkə ticarəti</SelectItem>
                <SelectItem value="rsi">RSI - Aşırı alış/satış göstəricisi</SelectItem>
              </SelectContent>
            </Select>
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
              {isRunning ? 'Bot İşləyir' : 'Botu Başlat'}
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

          {/* Current Strategy Display */}
          <div className="bg-background/50 rounded-lg p-3 border border-border">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Hazırki Strategiya:</span>
              <span className="font-medium text-crypto-blue">
                {config.strategy === 'scalping' && 'Scalping'}
                {config.strategy === 'momentum' && 'Momentum'}
                {config.strategy === 'mean-reversion' && 'Mean Reversion'}
                {config.strategy === 'grid' && 'Grid Trading'}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm mt-1">
              <span className="text-muted-foreground">Risk Səviyyəsi:</span>
              <span className="font-medium">{config.riskLevel}/10</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}