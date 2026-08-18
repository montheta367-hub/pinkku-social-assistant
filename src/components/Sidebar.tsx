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
  Music2
} from 'lucide-react';

export type TabType =
  | 'dashboard'
  | 'creator'
  | 'calendar'
  | 'messages'
  | 'connections'
  | 'gmail'
  | 'tiktok'
  | 'agents'
  | 'analytics'
  | 'settings';

interface SidebarProps {
  currentTab: TabType;
  onSelectTab: (tab: TabType) => void;
  unreadMessagesCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  unreadMessagesCount
}) => {
  const menuItems = [
    { id: 'dashboard' as TabType, label: 'Overview', icon: LayoutDashboard },
    { id: 'creator' as TabType, label: 'AI Content Studio', icon: PenTool, badge: 'AI' },
    { id: 'calendar' as TabType, label: 'Social Calendar', icon: Calendar },
    { id: 'messages' as TabType, label: 'Customer DMs', icon: MessageSquare, count: unreadMessagesCount },
    { id: 'connections' as TabType, label: 'Spider Connect Hub', icon: Share2 },
    { id: 'gmail' as TabType, label: 'Google Business Inbox', icon: Mail },
    { id: 'tiktok' as TabType, label: 'TikTok Management', icon: Music2 },
    { id: 'agents' as TabType, label: 'Autonomous AI Crew', icon: Bot, badge: 'New' },
    { id: 'analytics' as TabType, label: 'Growth Analytics', icon: BarChart3 },
    { id: 'settings' as TabType, label: 'Settings', icon: Settings },
  ];

  return (
    <aside className="w-full md:w-64 shrink-0 bg-white border-r border-slate-200/80 p-4 space-y-6 flex flex-col justify-between">
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
                    ? 'bg-pink-50 text-[#FF2D85] shadow-sm font-extrabold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
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
          <span className="text-lg">🕷️</span>
          <span className="text-xs font-black tracking-tight text-pink-300">Pinkku Spider Sync</span>
        </div>
        <p className="text-[11px] text-slate-300 leading-relaxed">
          Auto-syncing Facebook, Instagram, TikTok, Telegram & Google accounts seamlessly.
        </p>
        <div className="pt-1 flex items-center justify-between text-[10px] text-emerald-400 font-bold">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            All 5 Channels Active
          </span>
        </div>
      </div>
    </aside>
  );
};
