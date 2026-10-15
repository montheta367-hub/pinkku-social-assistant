import React, { useEffect, useState } from 'react';
import { BarChart3, MessageSquare, Send, Package, CheckCircle2, Download } from 'lucide-react';
import { PlatformLogo } from '../components/PlatformLogo';

interface ReportSummary {
  period: { since: string; days: number; platform: string };
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

const DATE_RANGES = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export const AnalyticsView: React.FC = () => {
  const [data, setData] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [platform, setPlatform] = useState('all');
  const [days, setDays] = useState(30);

  useEffect(() => {
    const token = localStorage.getItem('pinkku_token');
    if (!token) return;
    setLoading(true);
    fetch(`/api/report/summary?platform=${platform}&days=${days}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => (res.ok ? res.json() : Promise.reject()))
      .then(d => { setData(d); setError(''); })
      .catch(() => setError('Could not load report data.'))
      .finally(() => setLoading(false));
  }, [platform, days]);

  const platforms = data ? Object.keys(data.posts.byPlatform) : [];

  const handleDownload = () => {
    if (!data) return;
    const rows = [
      ['Metric', 'Value'],
      ['Reporting period', `${formatDate(data.period.since)} - ${formatDate(new Date().toISOString())}`],
      ['Platform filter', data.period.platform],
      ['Posts Published', String(data.posts.published)],
      ['Posts Failed', String(data.posts.failed)],
      ['Posts Pending', String(data.posts.pending)],
      ['Customer Messages', String(data.messages.total)],
      ['Messages Replied', String(data.messages.replied)],
      ['Reply Rate', `${data.messages.replyRate}%`],
      ['Orders Captured', String(data.orders.total)],
      ['Orders Fulfilled', String(data.orders.fulfilled)],
      ['Orders New', String(data.orders.new)],
    ];
    const csv = rows.map(r => r.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pinkku-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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

        <button
          onClick={handleDownload}
          disabled={!data}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-[#FF2D85] text-white font-extrabold text-xs shadow-md shadow-pink-500/25 hover:opacity-95 transition-all flex items-center gap-2 disabled:opacity-50 self-start sm:self-auto"
        >
          <Download className="w-4 h-4" />
          <span>Download Report</span>
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Platform</label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-pink-500"
            >
              <option value="all">All platforms</option>
              <option value="facebook">Facebook</option>
              <option value="instagram">Instagram</option>
              <option value="tiktok">TikTok</option>
              <option value="telegram">Telegram</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Date range</label>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-pink-500"
            >
              {DATE_RANGES.map(r => (
                <option key={r.days} value={r.days}>{r.label}</option>
              ))}
            </select>
          </div>
        </div>

        {data && (
          <div className="text-right">
            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Reporting period</span>
            <span className="text-xs font-black text-slate-800">
              {formatDate(data.period.since)} – {formatDate(new Date().toISOString())}
            </span>
          </div>
        )}
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

          {/* Messages by Platform — single metric (count), so one consistent
              brand hue per bar; the platform icon already carries identity,
              so no categorical palette or legend is needed here. */}
          {data.messages.total > 0 && (
            <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-4">
              <div>
                <h3 className="text-base font-black text-slate-900">Messages by Channel</h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">{data.messages.total} total messages received</p>
              </div>
              <div className="space-y-3">
                {([
                  { key: 'telegram', count: data.messages.byPlatform.telegram },
                  { key: 'facebook', count: data.messages.byPlatform.facebook },
                ] as const)
                  .filter(row => row.count > 0)
                  .map((row) => {
                    const max = Math.max(data.messages.byPlatform.telegram, data.messages.byPlatform.facebook, 1);
                    const pct = Math.max((row.count / max) * 100, 4);
                    return (
                      <div key={row.key} className="flex items-center gap-3">
                        <div className="w-24 flex items-center gap-1.5 shrink-0">
                          <PlatformLogo platform={row.key} className="w-3.5 h-3.5" />
                          <span className="text-xs font-bold text-slate-700 capitalize">{row.key}</span>
                        </div>
                        <div className="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[#FF2D85]"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-10 text-right text-xs font-black text-slate-900 shrink-0">{row.count}</span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

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
