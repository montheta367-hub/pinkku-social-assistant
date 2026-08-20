import React, { useState } from 'react';
import { UserProfile, PlatformConnection, SocialPost, CustomerMessage } from '../types';
import { SpiderConnectionHub } from '../components/SpiderConnectionHub';
import { PlatformLogo } from '../components/PlatformLogo';
import { PostsStatusBarChart, ChannelAudienceDonut } from '../components/DashboardCharts';
import { TabType } from '../components/Sidebar';
import {
  Sparkles,
  TrendingUp,
  Users,
  MessageSquare,
  Calendar,
  BarChart3,
  PieChart,
  CheckCircle2,
  Plus
} from 'lucide-react';

interface DashboardViewProps {
  user: UserProfile;
  connections: PlatformConnection[];
  posts: SocialPost[];
  messages: CustomerMessage[];
  onSelectTab: (tab: TabType) => void;
  onToggleConnection: (id: string) => void;
  onRefreshConnections: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  user,
  connections,
  posts,
  messages,
  onSelectTab,
  onToggleConnection,
  onRefreshConnections
}) => {
  const [quickTopic, setQuickTopic] = useState("");
  const unreadMessages = messages.filter(m => m.status === 'unread');
  const scheduledPosts = posts.filter(p => p.status === 'scheduled');
  const publishedPosts = posts.filter(p => p.status === 'published');

  const totalFollowers = connections.reduce((acc, curr) => acc + (curr.followerCount || 0), 0);
  const connectedCount = connections.filter(c => c.connected).length;

  return (
    <div className="space-y-7 pb-12">
      
      {/* Welcome Banner */}
      <div className="rounded-3xl bg-gradient-to-br from-pink-50 via-rose-50 to-white border border-pink-100/80 p-6 sm:p-8 relative overflow-hidden shadow-sm">
        <div className="absolute right-0 top-0 bottom-0 w-1/2 opacity-40 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-pink-200/60 via-rose-100/40 to-transparent pointer-events-none"></div>

        <div className="relative z-10 space-y-3 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/80 border border-pink-200 text-[#FF2D85] text-xs font-black shadow-sm">
            <span>🌸</span>
            <span>Hi, {user.name}!</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
            Your Business Dashboard
          </h1>

          <p className="text-xs sm:text-sm text-slate-500 font-medium leading-relaxed">
            {connectedCount === 0 ? (
              <>You haven't connected any channels yet. <strong className="text-slate-900">Connect your first channel</strong> to start receiving messages and publishing posts.</>
            ) : (
              <>
                <strong className="text-slate-900">{connectedCount} channel{connectedCount === 1 ? '' : 's'}</strong> connected. You have <strong className="text-slate-900">{unreadMessages.length} unread customer inquir{unreadMessages.length === 1 ? 'y' : 'ies'}</strong> and <strong className="text-slate-900">{scheduledPosts.length} post{scheduledPosts.length === 1 ? '' : 's'} scheduled</strong> for today.
              </>
            )}
          </p>

          <div className="pt-2 flex flex-wrap items-center gap-3">
            <button
              onClick={() => onSelectTab('creator')}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-[#FF2D85] text-white font-extrabold text-xs shadow-md shadow-pink-500/25 hover:opacity-95 transition-all flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              <span>Create AI Post</span>
            </button>

            <button
              onClick={() => onSelectTab('messages')}
              className="px-4 py-2.5 rounded-xl bg-white hover:bg-pink-50 border border-pink-200 text-slate-700 font-bold text-xs transition-all flex items-center gap-2 shadow-sm"
            >
              <MessageSquare className="w-4 h-4" />
              <span>Reply to Customer DMs ({unreadMessages.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

        <div className="bg-pink-50/60 rounded-3xl p-5 border border-pink-100 shadow-sm space-y-3">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold">Total Audience</span>
            <div className="p-2 rounded-xl bg-white text-[#FF2D85] shadow-sm">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900">{totalFollowers.toLocaleString()}</div>
            <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 mt-0.5">
              {totalFollowers > 0 ? (
                <>
                  <TrendingUp className="w-3 h-3" />
                  <span>+14.8% this week across channels</span>
                </>
              ) : (
                <span className="text-slate-400">Connect a channel to start tracking growth</span>
              )}
            </div>
          </div>
        </div>

        <div className="bg-blue-50/60 rounded-3xl p-5 border border-blue-100 shadow-sm space-y-3">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold">Customer Inquiries</span>
            <div className="p-2 rounded-xl bg-white text-blue-600 shadow-sm">
              <MessageSquare className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900">{messages.length} Active</div>
            <div className="flex items-center gap-1 text-[11px] font-bold text-amber-600 mt-0.5">
              <span>{unreadMessages.length} awaiting response</span>
            </div>
          </div>
        </div>

        <div className="bg-indigo-50/60 rounded-3xl p-5 border border-indigo-100 shadow-sm space-y-3">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold">Published Content</span>
            <div className="p-2 rounded-xl bg-white text-indigo-600 shadow-sm">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900">{posts.length} Posts</div>
            <div className="flex items-center gap-1 text-[11px] font-bold text-slate-500 mt-0.5">
              <span>{scheduledPosts.length} scheduled for publishing</span>
            </div>
          </div>
        </div>

        <div className="bg-emerald-50/60 rounded-3xl p-5 border border-emerald-100 shadow-sm space-y-3">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold">AI Response Rate</span>
            <div className="p-2 rounded-xl bg-white text-emerald-600 shadow-sm">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900">&lt; 3 mins</div>
            <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 mt-0.5">
              <span>99.2% accuracy in Burmese</span>
            </div>
          </div>
        </div>

      </div>

      {/* Insights Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="w-4 h-4 text-[#FF2D85]" />
            <h2 className="text-sm font-black text-slate-900">Posts by Status</h2>
          </div>
          <p className="text-[11px] text-slate-400 font-medium mb-2">Draft, scheduled, and published content</p>
          <PostsStatusBarChart
            data={[
              { label: 'Draft', value: posts.filter(p => p.status === 'draft').length },
              { label: 'Scheduled', value: scheduledPosts.length },
              { label: 'Published', value: publishedPosts.length },
            ]}
          />
        </div>

        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <PieChart className="w-4 h-4 text-[#FF2D85]" />
            <h2 className="text-sm font-black text-slate-900">Audience by Channel</h2>
          </div>
          <p className="text-[11px] text-slate-400 font-medium mb-2">Followers across your connected platforms</p>
          <ChannelAudienceDonut connections={connections} />
        </div>
      </div>

      {/* Spider Hub Component */}
      <SpiderConnectionHub
        connections={connections}
        onToggleConnect={onToggleConnection}
        onRefreshAll={onRefreshConnections}
        managedPlatforms={['gmail', 'tiktok']}
        onManage={(id) => onSelectTab(id as TabType)}
      />

      {/* Content & Messages 2-Column Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Recent Posts & Schedule */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-[#FF2D85]" />
              <h2 className="text-base font-black text-slate-900">Upcoming & Recent Posts</h2>
            </div>
            <button
              onClick={() => onSelectTab('calendar')}
              className="text-xs font-bold text-[#FF2D85] hover:underline"
            >
              View Calendar →
            </button>
          </div>

          <div className="space-y-3">
            {posts.length === 0 && (
              <div className="p-6 rounded-2xl bg-pink-50/40 border border-dashed border-pink-100 text-center">
                <p className="text-xs text-slate-500 font-medium">No posts yet — create your first AI-generated post to see it here.</p>
              </div>
            )}
            {posts.slice(0, 3).map((post) => (
              <div key={post.id} className="p-4 rounded-2xl bg-pink-50/40 border border-pink-100/60 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-xs font-black text-slate-900">{post.title}</h3>
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${
                    post.status === 'published' ? 'bg-emerald-100 text-emerald-800' :
                    post.status === 'scheduled' ? 'bg-blue-100 text-blue-800' : 'bg-slate-200 text-slate-700'
                  }`}>
                    {post.status}
                  </span>
                </div>

                <p className="text-xs text-slate-600 font-medium line-clamp-2">
                  {post.myanmarContent || post.content}
                </p>

                <div className="flex items-center justify-between pt-1 text-[11px] text-slate-400">
                  <div className="flex items-center gap-1.5">
                    {post.platforms.map((p) => (
                      <PlatformLogo key={p} platform={p} className="w-3.5 h-3.5" />
                    ))}
                  </div>
                  <span>{post.scheduledDate ? `${post.scheduledDate} @ ${post.scheduledTime}` : post.createdAt}</span>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={() => onSelectTab('creator')}
            className="w-full py-2.5 rounded-xl border border-dashed border-slate-300 hover:border-pink-500 hover:bg-pink-50/30 text-slate-700 hover:text-[#FF2D85] font-bold text-xs transition-all flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Create New Social Post</span>
          </button>
        </div>

        {/* Customer Inquiries Queue */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-blue-600" />
              <h2 className="text-base font-black text-slate-900">Customer Inquiries</h2>
            </div>
            <button
              onClick={() => onSelectTab('messages')}
              className="text-xs font-bold text-blue-600 hover:underline"
            >
              All Messages ({messages.length}) →
            </button>
          </div>

          <div className="space-y-3">
            {messages.length === 0 && (
              <div className="p-6 rounded-2xl bg-blue-50/40 border border-dashed border-blue-100 text-center">
                <p className="text-xs text-slate-500 font-medium">No customer messages yet — connect a channel to start receiving inquiries.</p>
              </div>
            )}
            {messages.slice(0, 3).map((msg) => (
              <div key={msg.id} className="p-4 rounded-2xl bg-blue-50/40 border border-blue-100/60 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <PlatformLogo platform={msg.platform} className="w-4 h-4" />
                    <span className="text-xs font-black text-slate-900">{msg.customerName}</span>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400">{msg.timestamp}</span>
                </div>

                <p className="text-xs text-slate-700 font-medium line-clamp-2">
                  "{msg.message}"
                </p>

                {msg.suggestedReplyMyanmar && (
                  <div className="p-2.5 rounded-xl bg-pink-50/60 border border-pink-100 text-[11px] text-slate-800 space-y-1">
                    <div className="flex items-center gap-1 font-bold text-[#FF2D85]">
                      <Sparkles className="w-3 h-3" />
                      <span>AI Suggested Reply:</span>
                    </div>
                    <p className="line-clamp-2">{msg.suggestedReplyMyanmar}</p>
                  </div>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={() => onSelectTab('messages')}
            className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-all flex items-center justify-center gap-2 shadow-sm"
          >
            <span>Open Customer Auto-Reply Studio</span>
          </button>
        </div>

      </div>

    </div>
  );
};
