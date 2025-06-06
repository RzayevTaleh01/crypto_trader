import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DollarSign, Plus, Minus, RotateCcw } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface BalanceManagerProps {
  userId: number;
  currentBalance: string;
}

export default function BalanceManager({ userId, currentBalance }: BalanceManagerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("100");

  const updateBalanceMutation = useMutation({
    mutationFn: async (newBalance: string) => {
      const response = await fetch(`/api/user/${userId}/balance`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ balance: newBalance }),
      });

      if (!response.ok) {
        throw new Error('Failed to update balance');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      queryClient.invalidateQueries({ queryKey: ['/api/analytics'] });
      toast({
        title: "Balans yeniləndi",
        description: "Ticarət balansı uğurla dəyişdirildi.",
      });
    },
    onError: () => {
      toast({
        title: "Xəta",
        description: "Balans yenilənmədi.",
        variant: "destructive",
      });
    }
  });

  const resetDatabaseMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/database/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to reset database');
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Baza sıfırlandı",
        description: "Bütün məlumatlar silindi, balans $20 oldu",
      });
      // Clear all cache and refetch everything
      queryClient.clear();
      setTimeout(() => {
        queryClient.refetchQueries();
      }, 500);
    },
    onError: () => {
      toast({
        title: "Xəta",
        description: "Baza sıfırlanarkən xəta baş verdi",
        variant: "destructive",
      });
    },
  });

  const handleSetBalance = (newBalance: string) => {
    if (parseFloat(newBalance) < 0) return;
    updateBalanceMutation.mutate(newBalance);
  };

  const handleAddFunds = () => {
    const newBalance = (parseFloat(currentBalance) + parseFloat(amount)).toFixed(2);
    handleSetBalance(newBalance);
  };

  const handleRemoveFunds = () => {
    const newBalance = Math.max(0, parseFloat(currentBalance) - parseFloat(amount)).toFixed(2);
    handleSetBalance(newBalance);
  };

  const quickAmounts = ["50", "100", "250", "500", "1000"];

  return (
      <Card className="bg-card border-border">
        <CardContent className="p-6">
          <h3 className="text-xl font-bold mb-6 flex items-center">
            <DollarSign className="h-5 w-5 mr-2 text-crypto-green" />
            Balance Manager
          </h3>

          <div className="space-y-6">
            {/* Current Balance Display */}
            <div className="text-center">
              <Label className="text-sm text-muted-foreground">Mövcud Balans</Label>
              <div className="text-3xl font-bold text-crypto-green">
                ${parseFloat(currentBalance).toFixed(2)}
              </div>
            </div>

            {/* Amount Input */}
            <div>
              <Label className="text-sm font-medium mb-2 block">Məbləğ</Label>
              <Input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="bg-background border-border text-lg text-center"
                  placeholder="100"
                  min="0"
                  step="0.01"
              />
            </div>

            {/* Quick Amount Buttons */}
            <div>
              <Label className="text-sm font-medium mb-2 block">Tez Seçim</Label>
              <div className="grid grid-cols-3 gap-2">
                {quickAmounts.map((quickAmount) => (
                    <Button
                        key={quickAmount}
                        variant="outline"
                        size="sm"
                        onClick={() => setAmount(quickAmount)}
                        className="text-sm"
                    >
                      ${quickAmount}
                    </Button>
                ))}
              </div>
            </div>

            {/* Add/Remove Buttons */}
            <div className="flex space-x-3">
              <Button
                  className="flex-1 bg-crypto-green text-white hover:bg-crypto-green/80"
                  onClick={handleAddFunds}
                  disabled={updateBalanceMutation.isPending || !amount || parseFloat(amount) <= 0}
              >
                <Plus className="h-4 w-4 mr-2" />
                Əlavə Et
              </Button>
              <Button
                  className="flex-1 bg-crypto-red text-white hover:bg-crypto-red/80"
                  onClick={handleRemoveFunds}
                  disabled={updateBalanceMutation.isPending || !amount || parseFloat(amount) <= 0}
              >
                <Minus className="h-4 w-4 mr-2" />
                Çıxart
              </Button>
            </div>

            {/* Set Exact Balance */}
            <div className="border-t border-border pt-4">
              <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => handleSetBalance(amount)}
                  disabled={updateBalanceMutation.isPending || !amount}
              >
                Dəqiq Balans Təyin Et: ${amount}
              </Button>
            </div>

            <div className="pt-4 border-t">
              <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => resetDatabaseMutation.mutate()}
                  disabled={resetDatabaseMutation.isPending}
                  className="w-full"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                {resetDatabaseMutation.isPending ? 'Sıfırlanır...' : 'Sıfırla'}
              </Button>
              <p className="text-xs text-muted-foreground mt-2 text-center">
                Bütün məlumatları silir və $20 balans ilə başlayır
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
  );
}