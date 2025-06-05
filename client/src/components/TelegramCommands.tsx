import { Card, CardContent } from "@/components/ui/card";
import { 
  Play, 
  BarChart3, 
  Wallet, 
  History, 
  Square, 
  Settings,
  MessageSquare
} from "lucide-react";

export default function TelegramCommands() {
  const commands = [
    {
      command: '/start',
      description: 'Trading botunu başlat və avtomatik ticarət aktiv et',
      icon: Play,
      color: 'text-crypto-green'
    },
    {
      command: '/stop',
      description: 'Trading botunu dayandır və ticarəti durdur',
      icon: Square,
      color: 'text-crypto-red'
    },
    {
      command: '/status',
      description: 'Bot statusu və cari kar-zərər məlumatlarını göstər',
      icon: BarChart3,
      color: 'text-crypto-blue'
    },
    {
      command: '/balance',
      description: 'Portfolio balansı və coin məlumatlarını göstər',
      icon: Wallet,
      color: 'text-yellow-500'
    },
    {
      command: '/help',
      description: 'Bütün mövcud komandların siyahısını göstər',
      icon: MessageSquare,
      color: 'text-purple-500'
    }
  ];

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-6">
        <h3 className="text-xl font-bold mb-6">Telegram Bot Komandları</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {commands.map((cmd) => (
            <div key={cmd.command} className="bg-background rounded-lg p-4">
              <div className="flex items-center space-x-3 mb-2">
                <cmd.icon className={`h-5 w-5 ${cmd.color}`} />
                <code className="text-crypto-blue font-mono text-sm">{cmd.command}</code>
              </div>
              <p className="text-muted-foreground text-sm">{cmd.description}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 p-4 bg-gradient-to-r from-crypto-blue/20 to-crypto-green/20 rounded-lg border border-crypto-blue/30">
          <div className="flex items-center space-x-3">
            <MessageSquare className="h-5 w-5 text-crypto-blue" />
            <div>
              <p className="font-medium">Telegram Bot Aktiv</p>
              <p className="text-muted-foreground text-sm">
                Bot hazırda işləyir və avtomatik bildirişlər göndərir. Yuxarıdakı komandları istifadə edərək botunu idarə edə bilərsiniz.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
