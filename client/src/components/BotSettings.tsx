import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Play, Square, Bot } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface BotSettingsProps {
  userId: number;
}

export default function BotSettings({ userId }: BotSettingsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: settingsResponse } = useQuery({
    queryKey: ['/api/bot-settings', userId],
    enabled: !!userId,
    refetchInterval: 3000, // Refresh every 3 seconds for real-time status
  });

  const settings = settingsResponse || {};

  const [localSettings, setLocalSettings] = useState({
    strategy: settings.strategy || 'scalping',
    riskLevel: settings.riskLevel || 5,
    maxDailyLoss: settings.maxDailyLoss || '50',
    targetProfit: settings.targetProfit || '100'
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (newSettings: any) => {
      const response = await fetch(`/api/bot-settings/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings)
      });
      if (!response.ok) throw new Error('Failed to update settings');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/bot-settings'] });
      toast({
        title: "Bot ayarları yeniləndi",
        description: "Bot strategiyası və parametrləri uğurla dəyişdirildi.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Xəta",
        description: "Bot ayarları yenilənmədi.",
        variant: "destructive",
      });
    }
  });

  const toggleBotMutation = useMutation({
    mutationFn: async (isActive: boolean) => {
      const response = await fetch(`/api/bot-settings/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...localSettings, isActive })
      });
      if (!response.ok) throw new Error('Failed to toggle bot');
      return response.json();
    },
    onSuccess: (data, isActive) => {
      queryClient.invalidateQueries({ queryKey: ['/api/bot-settings'] });
      toast({
        title: isActive ? "Bot işə salındı" : "Bot dayandırıldı",
        description: isActive ? "Bot avtomatik ticarətə başladı." : "Bot ticarəti dayandırdı.",
      });
    },
    onError: () => {
      toast({
        title: "Xəta",
        description: "Bot vəziyyəti dəyişdirilmədi.",
        variant: "destructive",
      });
    }
  });

  const handleStartBot = () => {
    toggleBotMutation.mutate(true);
  };

  const handleStopBot = () => {
    toggleBotMutation.mutate(false);
  };

  const handleSettingChange = (key: string, value: any) => {
    const newSettings = { ...localSettings, [key]: value };
    setLocalSettings(newSettings);
    
    // Auto-save settings immediately
    updateSettingsMutation.mutate(newSettings);
  };

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-6">
        <h3 className="text-xl font-bold mb-6">Bot Configuration</h3>
        
        <div className="space-y-6">
          {/* Trading Strategy */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Trading Strategy</Label>
            <Select 
              value={localSettings.strategy} 
              onValueChange={(value) => handleSettingChange('strategy', value)}
            >
              <SelectTrigger className="w-full bg-background border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="scalping">Scalping Strategy</SelectItem>
                <SelectItem value="momentum">Momentum Trading</SelectItem>
                <SelectItem value="mean-reversion">Mean Reversion</SelectItem>
                <SelectItem value="grid">Grid Trading</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Risk Level */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Risk Level</Label>
            <div className="flex items-center space-x-4">
              <Slider
                value={[localSettings.riskLevel]}
                onValueChange={(value) => handleSettingChange('riskLevel', value[0])}
                max={10}
                min={1}
                step={1}
                className="flex-1"
              />
              <span className="text-sm font-medium w-8">{localSettings.riskLevel}</span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>Conservative</span>
              <span>Aggressive</span>
            </div>
          </div>

          {/* Max Daily Loss */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Max Daily Loss ($)</Label>
            <Input
              type="number"
              value={localSettings.maxDailyLoss}
              onChange={(e) => handleSettingChange('maxDailyLoss', e.target.value)}
              className="bg-background border-border"
              placeholder="50"
            />
          </div>

          {/* Target Profit */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Daily Target Profit ($)</Label>
            <Input
              type="number"
              value={localSettings.targetProfit}
              onChange={(e) => handleSettingChange('targetProfit', e.target.value)}
              className="bg-background border-border"
              placeholder="100"
            />
          </div>

          {/* Bot Control Buttons */}
          <div className="flex space-x-3 pt-4">
            <Button
              className="flex-1 bg-crypto-green text-white hover:bg-crypto-green/80"
              onClick={handleStartBot}
              disabled={updateSettingsMutation.isPending || settings?.isActive}
            >
              <Play className="h-4 w-4 mr-2" />
              {settings?.isActive ? 'Bot Running' : 'Start Bot'}
            </Button>
            <Button
              className="flex-1 bg-crypto-red text-white hover:bg-crypto-red/80"
              onClick={handleStopBot}
              disabled={updateSettingsMutation.isPending || !settings?.isActive}
            >
              <Square className="h-4 w-4 mr-2" />
              Stop Bot
            </Button>
          </div>

          {/* Telegram Bot Status */}
          <div className="border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Telegram Bot</span>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-crypto-green rounded-full animate-pulse" />
                <span className="text-crypto-green text-sm">Connected</span>
              </div>
            </div>
            <p className="text-muted-foreground text-xs mt-1">
              @cryptotrade_bot - Receiving commands
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
