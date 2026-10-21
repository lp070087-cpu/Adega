import {
  Activity, ArrowDownUp, Banknote, BarChart3, Bell, Bike, Boxes, Calendar,
  CheckCircle2, CircleDollarSign, Clock3, CreditCard, Gift, Image, Inbox,
  LayoutDashboard, Map, Package, Plug, Receipt, Search, Settings, ShoppingBag,
  Store, Tags, Target, Truck, Users, Wallet, Trophy, ShieldCheck, BookOpen, TriangleAlert, type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  '📊': LayoutDashboard, '🧭': ShoppingBag, '🏪': Store, '🏷️': Tags,
  '🎁': Gift, '🖼️': Image, '👥': Users, '👤': Users, '🛵': Bike,
  '🗺️': Map, '🧾': Receipt, '📦': Package, '💰': CircleDollarSign,
  '📈': BarChart3, '🔌': Plug, '⚙️': Settings, '📭': Inbox,
  '🎯': Target, '💳': CreditCard, '💵': Banknote, '🚚': Truck,
  '⏰': Clock3, '🕒': Clock3, '✅': CheckCircle2, '🔔': Bell,
  '📅': Calendar, '📋': Receipt, '🔎': Search, '🔍': Search,
  '💸': ArrowDownUp, '🏦': Wallet, '🍺': Boxes,
  '🏆': Trophy, '🎭': ShieldCheck, '📚': BookOpen, '⚠️': TriangleAlert,
  '⏱️': Clock3, '⏳': Clock3, '🔵': Activity,
  chat: Inbox, campaign: Target, points: Trophy,
};

/** Compatibilidade com os ícones legados sem manter emojis na operação. */
export function Icon({ name, className = 'h-5 w-5' }: { name: string; className?: string }) {
  const Glyph = ICONS[name] ?? Activity;
  return <Glyph aria-hidden="true" className={className} strokeWidth={1.7} />;
}
