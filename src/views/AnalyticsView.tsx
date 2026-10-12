import React, { useEffect, useState } from 'react';
import { BarChart3, MessageSquare, Send, Package, CheckCircle2 } from 'lucide-react';
import { PlatformLogo } from '../components/PlatformLogo';

interface ReportSummary {
  posts: {
    published: number;
    failed: number;
    pending: number;
    byPlatform: Record<string, { published: number; failed: number; pending: number }>;
  };
  messages: {
    total: number;
    replied: number;
    replyRate: number;
    byPlatform: { telegram: number; facebook: number };
  };
  orders: {
    total: number;
    fulfilled: number;
    new: number;
  };
}

export const AnalyticsView: React.FC = () => {
  const [data, setData] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('pinkku_token');
    if (!token) return;
    fetch('/api/report/summary', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => (res.ok ? res.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError('Could not load report data.'))
      .finally(() => setLoading(false));
  }, []);

  const platforms = data ? Object.keys(data.posts.byPlatform) : [];

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-[#FF2D85]" />
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Report
            </h1>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Real numbers from your own Pinkku account — posts, customer replies, and orders.
          </p>
        </div>
      </div>

      {loading && (
        <div className="bg-white rounded-3xl p-8 border border-slate-200/80 shadow-sm text-center text-xs font-bold text-slate-400">
          Loading your report…
        </div>
      )}

      {error && !loading && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3.5 text-xs font-bold text-rose-700">
          {error}
        </div>
      )}

      {data && !loading && (
        <>
          {/* Top Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

            <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm space-y-2">
              <span className="text-xs font-bold text-slate-500 flex items-center gap-1.5">
                <Send className="w-3.5 h-3.5" /> Posts Published
              </span>
              <div className="text-2xl font-black text-slate-900">{data.posts.published}</div>
              {data.posts.failed > 0 && (
                <div className="text-[11px] font-bold text-rose-600">{data.posts.failed} failed</div>
              )}
            </div>

            <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm space-y-2">
              <span className="text-xs font-bold text-slate-500 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5" /> Customer Messages
              </span>
              <div className="text-2xl font-black text-slate-900">{data.messages.total}</div>
              <div className="text-[11px] font-bold text-slate-500">
                Telegram {data.messages.byPlatform.telegram} · Facebook {data.messages.byPlatform.facebook}
              </div>
            </div>

            <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm space-y-2">
              <span className="text-xs font-bold text-slate-500 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> Reply Rate
              </span>
              <div className="text-2xl font-black text-[#FF2D85]">{data.messages.replyRate}%</div>
              <div className="text-[11px] font-bold text-slate-500">{data.messages.replied} of {data.messages.total} replied</div>
            </div>

            <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm space-y-2">
              <span className="text-xs font-bold text-slate-500 flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5" /> Orders Captured
              </span>
              <div className="text-2xl font-black text-emerald-600">{data.orders.total}</div>
              <div className="text-[11px] font-bold text-slate-500">{data.orders.fulfilled} fulfilled · {data.orders.new} new</div>
            </div>

          </div>

          {/* Breakdown per Platform */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-4">
            <h3 className="text-base font-black text-slate-900">Publishing by Channel</h3>

            {platforms.length === 0 && (
              <p className="text-xs text-slate-400 font-medium">No posts published yet — once you publish, the breakdown shows up here.</p>
            )}

            <div className="space-y-3">
              {platforms.map((platform) => {
                const stats = data.posts.byPlatform[platform];
                return (
                  <div key={platform} className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <PlatformLogo platform={platform} className="w-6 h-6" />
                      <h4 className="text-xs font-black text-slate-900 capitalize">{platform}</h4>
                    </div>
                    <div className="flex items-center gap-6 text-xs">
                      <div>
                        <span className="text-slate-400 font-medium block text-[10px]">Published</span>
                        <span className="font-bold text-emerald-600">{stats.published}</span>
                      </div>
                      {stats.failed > 0 && (
                        <div>
                          <span className="text-slate-400 font-medium block text-[10px]">Failed</span>
                          <span className="font-bold text-rose-600">{stats.failed}</span>
                        </div>
                      )}
                      {stats.pending > 0 && (
                        <div>
                          <span className="text-slate-400 font-medium block text-[10px]">Pending</span>
                          <span className="font-bold text-slate-500">{stats.pending}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

    </div>
  );
};
