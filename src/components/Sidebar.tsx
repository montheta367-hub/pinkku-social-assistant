import React from 'react';
import {
  LayoutDashboard,
  PenTool,
  Calendar,
  MessageSquare,
  Share2,
  Mail,
  Bot,
  BarChart3,
  Settings,
  Sparkles,
  Music2,
  CalendarClock
} from 'lucide-react';
import pinkkuIcon from '../assets/pinkku-icon.png';
import { PlatformConnection } from '../types';

export type TabType =
  | 'dashboard'
  | 'creator'
  | 'calendar'
  | 'messages'
  | 'connections'
  | 'gmail'
  | 'schedule'
  | 'tiktok'
  | 'agents'
  | 'analytics'
  | 'settings';

interface SidebarProps {
  currentTab: TabType;
  onSelectTab: (tab: TabType) => void;
  unreadMessagesCount: number;
  connections: PlatformConnection[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  unreadMessagesCount,
  connections
}) => {
  const connectedCount = connections.filter(c => c.connected).length;
  const menuItems = [
    { id: 'dashboard' as TabType, label: 'Overview', icon: LayoutDashboard },
    { id: 'creator' as TabType, label: 'AI Content Studio', icon: PenTool, badge: 'AI' },
    { id: 'calendar' as TabType, label: 'Social Calendar', icon: Calendar },
    { id: 'messages' as TabType, label: 'Customer DMs', icon: MessageSquare, count: unreadMessagesCount },
    { id: 'connections' as TabType, label: 'Spider Connect Hub', icon: Share2 },
    { id: 'gmail' as TabType, label: 'Google Business Inbox', icon: Mail },
    { id: 'schedule' as TabType, label: 'AI Smart Schedule', icon: CalendarClock },
    { id: 'tiktok' as TabType, label: 'TikTok Management', icon: Music2 },
    { id: 'agents' as TabType, label: 'Autonomous AI Crew', icon: Bot, badge: 'New' },
    { id: 'analytics' as TabType, label: 'Growth Analytics', icon: BarChart3 },
    { id: 'settings' as TabType, label: 'Settings', icon: Settings },
  ];

  return (
    <aside className="w-full md:w-64 shrink-0 bg-pink-50 border-r border-pink-200/70 p-4 space-y-6 flex flex-col justify-between">
      <div className="space-y-1">
        <div className="px-3 py-2 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
          Management
        </div>

        <nav className="space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-white text-[#FF2D85] shadow-sm font-extrabold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-[#FF2D85]' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </div>

                <div className="flex items-center gap-1.5">
                  {item.badge && (
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                      isActive ? 'bg-[#FF2D85] text-white' : 'bg-pink-100 text-[#FF2D85]'
                    }`}>
                      {item.badge}
                    </span>
                  )}
                  {item.count !== undefined && item.count > 0 && (
                    <span className="w-5 h-5 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center">
                      {item.count}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Spider AI Assistant Banner */}
      <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 text-white space-y-2">
        <div className="flex items-center gap-2">
          <img src={pinkkuIcon} alt="" className="w-5 h-5 rounded-full object-cover" />
          <span className="text-xs font-black tracking-tight text-pink-300">Pinkku Spider Sync</span>
        </div>
        <p className="text-[11px] text-slate-300 leading-relaxed">
          Auto-syncing Gmail, TikTok & Telegram today — more channels coming soon.
        </p>
        <div className="pt-1 flex items-center justify-between text-[10px] font-bold">
          {connectedCount > 0 ? (
            <span className="flex items-center gap-1.5 text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
              {connectedCount} Channel{connectedCount === 1 ? '' : 's'} Active
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-slate-400">
              <span className="w-2 h-2 rounded-full bg-slate-500"></span>
              No Channels Connected Yet
            </span>
          )}
        </div>
      </div>
    </aside>
  );
};
