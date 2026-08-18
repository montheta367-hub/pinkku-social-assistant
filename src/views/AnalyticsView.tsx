import React from 'react';
import { BarChart3, TrendingUp, Users, Eye, MessageSquare, ArrowUpRight, Award } from 'lucide-react';
import { PlatformLogo } from '../components/PlatformLogo';

export const AnalyticsView: React.FC = () => {
  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-[#FF2D85]" />
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Cross-Platform Growth Analytics
            </h1>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Aggregated metrics for Facebook, TikTok, Instagram & Telegram channels in Myanmar.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-500">Last 30 Days</span>
        </div>
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm space-y-2">
          <span className="text-xs font-bold text-slate-500">Total Reach</span>
          <div className="text-2xl font-black text-slate-900">148,200</div>
          <div className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />
            <span>+24.5% vs previous month</span>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm space-y-2">
          <span className="text-xs font-bold text-slate-500">Total Orders Closed via DMs</span>
          <div className="text-2xl font-black text-slate-900">328 Orders</div>
          <div className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />
            <span>MMK 14.8M gross revenue</span>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm space-y-2">
          <span className="text-xs font-bold text-slate-500">Top Acquisition Channel</span>
          <div className="text-2xl font-black text-[#1877F2]">Facebook</div>
          <div className="text-[11px] font-bold text-slate-500">
            58% of all buyer inquiries
          </div>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm space-y-2">
          <span className="text-xs font-bold text-slate-500">AI Time Saved</span>
          <div className="text-2xl font-black text-[#FF2D85]">62 Hours</div>
          <div className="text-[11px] font-bold text-slate-500">
            Auto customer replies & copywriting
          </div>
        </div>

      </div>

      {/* Breakdown per Platform */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-4">
        <h3 className="text-base font-black text-slate-900">Channel Performance Breakdown</h3>

        <div className="space-y-3">
          {[
            { id: 'facebook', name: 'Facebook Page', followers: '28,400', reach: '82,400', conv: '4.8%', growth: '+18%' },
            { id: 'tiktok', name: 'TikTok Channel', followers: '45,800', reach: '52,100', conv: '3.2%', growth: '+34%' },
            { id: 'instagram', name: 'Instagram Shop', followers: '14,200', reach: '18,500', conv: '5.1%', growth: '+12%' },
            { id: 'telegram', name: 'Telegram VIP Orders', followers: '6,200', reach: '9,800', conv: '8.4%', growth: '+22%' },
          ].map((item) => (
            <div key={item.id} className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <PlatformLogo platform={item.id} className="w-6 h-6" />
                <div>
                  <h4 className="text-xs font-black text-slate-900">{item.name}</h4>
                  <p className="text-[11px] text-slate-500 font-medium">{item.followers} Followers</p>
                </div>
              </div>

              <div className="flex items-center gap-6 text-xs">
                <div>
                  <span className="text-slate-400 font-medium block text-[10px]">Monthly Reach</span>
                  <span className="font-bold text-slate-800">{item.reach}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium block text-[10px]">DM Order Rate</span>
                  <span className="font-bold text-emerald-600">{item.conv}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium block text-[10px]">Growth</span>
                  <span className="font-black text-[#FF2D85]">{item.growth}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};
