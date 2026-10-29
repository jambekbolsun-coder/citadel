import {
  Banknote, BarChart3, Bell, BellRing, Briefcase, Building2, Calendar, CalendarDays, CalendarPlus, Camera, CheckSquare, FileText, Film, Folder,
  Gauge, Globe, House, IdCard, Inbox, KeyRound, LayoutGrid, List, Lock, LogOut, Megaphone, Palette, Receipt, ScrollText, Send, Settings,
  ShieldCheck, Smartphone, Sun, Tag, Trophy, User, UserPlus, Users, Wallet, type LucideIcon,
} from "lucide-react";

export const ICONS: Record<string, LucideIcon> = {
  home: House, sun: Sun, check: CheckSquare, calendar: CalendarDays, calendarold: Calendar, folder: Folder, film: Film, camera: Camera,
  shield: ShieldCheck, megaphone: Megaphone, inbox: Inbox, users: Users, tag: Tag, globe: Globe, wallet: Wallet, banknote: Banknote,
  chart: BarChart3, idcard: IdCard, key: KeyRound, list: List, settings: Settings, bell: Bell, bellring: BellRing, scroll: ScrollText,
  user: User, briefcase: Briefcase, trophy: Trophy, palette: Palette, layout: LayoutGrid, smartphone: Smartphone, lock: Lock, logout: LogOut,
  gauge: Gauge, building: Building2, file: FileText, send: Send, userplus: UserPlus, receipt: Receipt, calendarplus: CalendarPlus,
};

export function iconOf(name: string): LucideIcon {
  return ICONS[name] ?? House;
}
