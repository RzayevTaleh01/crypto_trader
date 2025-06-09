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
  profitBalance?: string;
}

export default function BalanceManager({ userId, currentBalance, profitBalance = "0.00" }: BalanceManagerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("100");

  const updateBalanceMutation = useMutation({
    mutationFn: async (balanceData: { balance?: string; profitBalance?: string }) => {
      const response = await fetch(`/api/user/${userId}/balance`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(balanceData),
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
        description: "Balans uğurla dəyişdirildi.",
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
      const response = await fetch(`/api/user/${userId}/reset`, {
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
        description: "Bütün məlumatlar silindi, balanslar sıfırlandı",
      });
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

  const handleSetMainBalance = (newBalance: string) => {
    if (parseFloat(newBalance) < 0) return;
    updateBalanceMutation.mutate({ balance: newBalance });
  };

  const handleAddToMainBalance = () => {
    const newBalance = (parseFloat(currentBalance) + parseFloat(amount)).toFixed(2);
    handleSetMainBalance(newBalance);
  };

  const handleRemoveFromMainBalance = () => {
    const newBalance = Math.max(0, parseFloat(currentBalance) - parseFloat(amount)).toFixed(2);
    handleSetMainBalance(newBalance);
  };

  const handleTransferProfitToMain = () => {
    const profitAmount = parseFloat(profitBalance);
    if (profitAmount <= 0) {
      toast({
        title: "Xəta",
        description: "Transfer ediləcək kar yoxdur.",
        variant: "destructive",
      });
      return;
    }

    const newMainBalance = (parseFloat(currentBalance) + profitAmount).toFixed(2);
    const newProfitBalance = "0.00";

    updateBalanceMutation.mutate({ 
      balance: newMainBalance, 
      profitBalance: newProfitBalance 
    });

    toast({
      title: "Transfer uğurlu",
      description: `$${profitAmount.toFixed(2)} kar əsas balansa köçürüldü.`,
    });
  };

  const quickAmounts = ["50", "100", "250", "500", "1000"];

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-6">
        <h3 className="text-xl font-bold mb-6 flex items-center">
          <DollarSign className="h-5 w-5 mr-2 text-crypto-green" />
          Balans İdarəetməsi
        </h3>

        <div className="space-y-6">
          {/* Balance Display */}
          <div className="space-y-4">
            <div className="text-center p-4 bg-crypto-blue/10 rounded-lg border-2 border-crypto-blue/20">
              <Label className="text-sm text-muted-foreground">Əsas Balans</Label>
              <div className="text-3xl font-bold text-crypto-blue mt-1">
                ${parseFloat(currentBalance).toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Trade üçün istifadə edilən əsas pul
              </p>
            </div>

            <div className="text-center p-4 bg-green-500/10 rounded-lg border-2 border-green-500/20">
              <Label className="text-sm text-muted-foreground">Kar Balansı</Label>
              <div className="text-3xl font-bold text-crypto-green mt-1">
                ${parseFloat(profitBalance).toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Yalnız satış qazanclarından toplanan pul
              </p>
              {parseFloat(profitBalance) > 0 && (
                <Button
                  onClick={handleTransferProfitToMain}
                  disabled={updateBalanceMutation.isPending}
                  className="mt-3 w-full bg-crypto-green text-white hover:bg-crypto-green/80 text-xs py-1 h-8"
                >
                  Əsas Balansa Transfer Et
                </Button>
              )}
            </div>
          </div>

          {/* Total Display */}
          <div className="text-center pt-4 border-t border-border">
            <Label className="text-sm text-muted-foreground">Ümumi Məbləğ</Label>
            <div className="text-4xl font-bold text-foreground mt-2">
              ${(parseFloat(currentBalance) + parseFloat(profitBalance)).toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Əsas Balans + Kar Balansı
            </p>
          </div>

          {/* Amount Input */}
          <div className="pt-4 border-t border-border">
            <Label className="text-sm font-medium mb-3 block">Əsas Balans İdarəetməsi</Label>
            <div className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">Məbləğ</Label>
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
                <Label className="text-xs text-muted-foreground mb-2 block">Tez Seçim</Label>
                <div className="grid grid-cols-5 gap-2">
                  {quickAmounts.map((quickAmount) => (
                    <Button
                      key={quickAmount}
                      variant="outline"
                      size="sm"
                      onClick={() => setAmount(quickAmount)}
                      className="text-xs"
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
                  onClick={handleAddToMainBalance}
                  disabled={updateBalanceMutation.isPending || !amount || parseFloat(amount) <= 0}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Əlavə Et
                </Button>
                <Button
                  className="flex-1 bg-crypto-red text-white hover:bg-crypto-red/80"
                  onClick={handleRemoveFromMainBalance}
                  disabled={updateBalanceMutation.isPending || !amount || parseFloat(amount) <= 0}
                >
                  <Minus className="h-4 w-4 mr-2" />
                  Çıxart
                </Button>
              </div>

              {/* Set Exact Balance */}
              <div className="pt-2">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => handleSetMainBalance(amount)}
                  disabled={updateBalanceMutation.isPending || !amount}
                >
                  Dəqiq Balans Təyin Et: ${amount}
                </Button>
              </div>
            </div>
          </div>

          {/* Reset Database */}
          <div className="pt-6 border-t border-border">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => resetDatabaseMutation.mutate()}
              disabled={resetDatabaseMutation.isPending}
              className="w-full"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              {resetDatabaseMutation.isPending ? 'Sıfırlanır...' : 'Hamısını Sıfırla'}
            </Button>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Bütün məlumatları və balansları sıfırlayır
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}