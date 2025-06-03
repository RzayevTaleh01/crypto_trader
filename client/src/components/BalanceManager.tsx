import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Minus, DollarSign, TrendingUp } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface BalanceManagerProps {
  userId: number;
  currentBalance: string;
}

export default function BalanceManager({ userId, currentBalance }: BalanceManagerProps) {
  const [amount, setAmount] = useState('');
  const [operation, setOperation] = useState<'add' | 'subtract'>('add');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const balanceUpdateMutation = useMutation({
    mutationFn: async ({ amount, operation }: { amount: string, operation: 'add' | 'subtract' }) => {
      const currentBalanceNum = parseFloat(currentBalance) || 0;
      const amountNum = parseFloat(amount) || 0;
      
      const newBalance = operation === 'add' 
        ? currentBalanceNum + amountNum 
        : Math.max(0, currentBalanceNum - amountNum);

      return apiRequest(`/api/user/${userId}/balance`, {
        method: 'PATCH',
        body: { balance: newBalance.toFixed(2) }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user', userId] });
      queryClient.invalidateQueries({ queryKey: ['/api/analytics/user'] });
      toast({
        title: 'Balance Updated',
        description: `Successfully ${operation === 'add' ? 'added' : 'subtracted'} $${amount}`,
      });
      setAmount('');
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to update balance',
        variant: 'destructive',
      });
    }
  });

  const handleBalanceUpdate = () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast({
        title: 'Invalid Amount',
        description: 'Please enter a valid amount',
        variant: 'destructive',
      });
      return;
    }

    balanceUpdateMutation.mutate({ amount, operation });
  };

  const quickAmounts = ['10', '50', '100', '500', '1000'];

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <DollarSign className="h-5 w-5 text-crypto-green" />
          <span>Balance Manager</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-center p-4 bg-crypto-green/10 rounded-lg">
          <p className="text-sm text-muted-foreground">Current Balance</p>
          <p className="text-2xl font-bold text-crypto-green">${currentBalance}</p>
        </div>

        <div className="space-y-3">
          <Label>Operation</Label>
          <div className="flex space-x-2">
            <Button
              variant={operation === 'add' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setOperation('add')}
              className="flex-1"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Funds
            </Button>
            <Button
              variant={operation === 'subtract' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setOperation('subtract')}
              className="flex-1"
            >
              <Minus className="h-4 w-4 mr-1" />
              Withdraw
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Amount ($)</Label>
          <Input
            type="number"
            placeholder="Enter amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min="0"
            step="0.01"
          />
        </div>

        <div className="space-y-2">
          <Label>Quick Amounts</Label>
          <div className="grid grid-cols-3 gap-2">
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

        <Button
          onClick={handleBalanceUpdate}
          disabled={balanceUpdateMutation.isPending || !amount}
          className="w-full"
        >
          {balanceUpdateMutation.isPending ? 'Processing...' : 
           `${operation === 'add' ? 'Add' : 'Withdraw'} $${amount || '0'}`}
        </Button>

        <div className="text-xs text-muted-foreground space-y-1">
          <p className="flex items-center">
            <TrendingUp className="h-3 w-3 mr-1" />
            Higher balance = more trading opportunities
          </p>
          <p>• Minimum $50 recommended for optimal bot performance</p>
          <p>• Bot uses max 5% of balance per trade</p>
        </div>
      </CardContent>
    </Card>
  );
}