import React, { useState, useEffect } from 'react';
import { SocialPost, PlatformType } from '../types';
import { PlatformLogo } from '../components/PlatformLogo';
import { Calendar, Plus, ChevronLeft, ChevronRight, Mail, CalendarPlus, CalendarCheck, FileText, ClipboardCheck, Trash2, Undo2, Check } from 'lucide-react';

interface ContentCalendarViewProps {
  posts: SocialPost[];
  onCreatePost: () => void;
  onSubmitForReview: (id: string) => void;
  onApprovePost: (id: string, date: string, time: string) => void;
  onRequestChanges: (id: string) => void;
  onDeleteDraft: (id: string) => void;
}

type Importance = 'urgent' | 'important' | 'normal' | 'low';

interface DetectedEvent {
  id: string;
  title: string;
  date: string;
  time: string | null;
  importance: Importance;
  sourceSubject: string;
}

const IMPORTANCE_STYLE: Record<Importance, { bg: string; border: string; tag: string; dot: string }> = {
  urgent: { bg: 'bg-red-50/70', border: 'border-red-200 hover:border-red-400', tag: 'text-red-600', dot: 'bg-red-500' },
  important: { bg: 'bg-orange-50/70', border: 'border-orange-200 hover:border-orange-400', tag: 'text-orange-600', dot: 'bg-orange-500' },
  normal: { bg: 'bg-indigo-50/70', border: 'border-indigo-200 hover:border-indigo-400', tag: 'text-indigo-600', dot: 'bg-indigo-400' },
  low: { bg: 'bg-slate-50/70', border: 'border-slate-200 hover:border-slate-300', tag: 'text-slate-400', dot: 'bg-slate-300' },
};

const IMPORTANCE_RANK: Record<Importance, number> = { urgent: 0, important: 1, normal: 2, low: 3 };

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getWeekStart(offset: number): Date {
  const now = new Date();
  const day = now.getDay(); // 0 = Sun
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(now.getDate() + diffToMonday + offset * 7);
  return monday;
}

// Converts a picked calendar date into the weekOffset (relative to this
// week's Monday) whose 7-day range contains it, so the date picker can jump
// straight to any week instead of only stepping one week at a time.
function weekOffsetForDate(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  const targetDay = target.getDay();
  const targetMonday = new Date(target);
  targetMonday.setDate(target.getDate() + (targetDay === 0 ? -6 : 1 - targetDay));

  const thisMonday = getWeekStart(0);
  const diffDays = Math.round((targetMonday.getTime() - thisMonday.getTime()) / (24 * 60 * 60 * 1000));
  return Math.round(diffDays / 7);
}

export const ContentCalendarView: React.FC<ContentCalendarViewProps> = ({
  posts, onCreatePost, onSubmitForReview, onApprovePost, onRequestChanges, onDeleteDraft
}) => {
  const [filterPlatform, setFilterPlatform] = useState<string>("all");
  const [weekOffset, setWeekOffset] = useState(0);
  const [detectedEvents, setDetectedEvents] = useState<DetectedEvent[]>([]);
  const [detectedStatus, setDetectedStatus] = useState<'idle' | 'loading' | 'ready' | 'not_connected' | 'error'>('idle');
  const [addedEventIds, setAddedEventIds] = useState<Set<string>>(new Set());
  const [addingEventId, setAddingEventId] = useState<string | null>(null);
  const [reviewSchedule, setReviewSchedule] = useState<Record<string, { date: string; time: string }>>({});

  const draftPosts = posts.filter(p => p.status === 'draft');
  const pendingReviewPosts = posts.filter(p => p.status === 'pending_review');
  const scheduleFor = (id: string) => reviewSchedule[id] || { date: toISODate(new Date()), time: '18:00' };
  const setScheduleFor = (id: string, patch: Partial<{ date: string; time: string }>) =>
    setReviewSchedule(prev => ({ ...prev, [id]: { ...scheduleFor(id), ...patch } }));

  const filteredPosts = filterPlatform === "all"
    ? posts
    : posts.filter(p => p.platforms.includes(filterPlatform as PlatformType));

  const weekStart = getWeekStart(weekOffset);
  const todayISO = toISODate(new Date());
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return {
      iso: toISODate(d),
      day: d.toLocaleDateString(undefined, { weekday: 'short' }),
      date: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      today: toISODate(d) === todayISO,
    };
  });
  const weekEnd = days[6];

  const loadDetectedEvents = async () => {
    const token = localStorage.getItem('pinkku_token');
    if (!token) return;
    setDetectedStatus('loading');
    try {
      const res = await fetch('/api/calendar/detected-events', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (res.status === 404) {
        setDetectedStatus('not_connected');
        return;
      }
      if (!res.ok) {
        setDetectedStatus('error');
        return;
      }
      setDetectedEvents(data.events || []);
      setDetectedStatus('ready');
    } catch {
      setDetectedStatus('error');
    }
  };

  useEffect(() => {
    loadDetectedEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addEventToCalendar = async (event: DetectedEvent) => {
    const token = localStorage.getItem('pinkku_token');
    setAddingEventId(event.id);
    try {
      const res = await fetch('/api/calendar/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: event.title,
          date: event.date,
          time: event.time || undefined,
          description: `From email: ${event.sourceSubject}`,
        }),
      });
      if (res.ok) {
        setAddedEventIds(prev => new Set(prev).add(event.id));
      }
    } catch {
      // Silently ignore — the button just stays clickable to retry.
    } finally {
      setAddingEventId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Calendar className="w-6 h-6 text-[#FF2D85]" />
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Cross-Platform Social Calendar
            </h1>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Synchronized schedule across Facebook, TikTok, Instagram & Telegram
            {detectedStatus === 'ready' && <> — plus dated events detected in your inbox</>}.
          </p>
        </div>

        <button
          onClick={onCreatePost}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-[#FF2D85] text-white font-extrabold text-xs shadow-md shadow-pink-500/25 hover:opacity-95 transition-all flex items-center gap-2 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>New Post Schedule</span>
        </button>
      </div>

      {/* Pending Review */}
      {pendingReviewPosts.length > 0 && (
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-amber-200/80 shadow-sm space-y-3">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-amber-600" />
            <span className="text-xs font-black text-slate-800">Pending Review ({pendingReviewPosts.length})</span>
            <span className="text-[11px] text-slate-400 font-medium">— check AI-generated content before it goes out</span>
          </div>
          <div className="space-y-3">
            {pendingReviewPosts.map(post => {
              const sched = scheduleFor(post.id);
              return (
                <div key={post.id} className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200/70 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        {post.platforms.map(p => <PlatformLogo key={p} platform={p} className="w-3.5 h-3.5" />)}
                      </div>
                      <p className="text-xs font-black text-slate-900">{post.title}</p>
                      {post.myanmarContent && <p className="text-[11px] text-slate-600 font-medium mt-1 line-clamp-2">{post.myanmarContent}</p>}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="date"
                      value={sched.date}
                      onChange={e => setScheduleFor(post.id, { date: e.target.value })}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11px] font-bold text-slate-800"
                    />
                    <input
                      type="time"
                      value={sched.time}
                      onChange={e => setScheduleFor(post.id, { time: e.target.value })}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11px] font-bold text-slate-800"
                    />
                    <button
                      onClick={() => onApprovePost(post.id, sched.date, sched.time)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1.5"
                    >
                      <Check className="w-3.5 h-3.5" /> Approve &amp; Schedule
                    </button>
                    <button
                      onClick={() => onRequestChanges(post.id)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 text-[11px] font-bold flex items-center gap-1.5"
                    >
                      <Undo2 className="w-3.5 h-3.5" /> Send Back to Draft
                    </button>
                    <button
                      onClick={() => onDeleteDraft(post.id)}
                      className="p-1.5 rounded-lg border border-slate-200 hover:bg-rose-50 hover:border-rose-300 text-slate-400 hover:text-rose-600"
                      title="Delete post"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Drafts */}
      {draftPosts.length > 0 && (
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-sm space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-black text-slate-800">Drafts ({draftPosts.length})</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {draftPosts.map(post => (
              <div key={post.id} className="p-3.5 rounded-2xl bg-slate-50/70 border border-slate-200/70 space-y-2">
                <div className="flex items-center gap-1.5">
                  {post.platforms.map(p => <PlatformLogo key={p} platform={p} className="w-3.5 h-3.5" />)}
                </div>
                <p className="text-xs font-black text-slate-900 line-clamp-1">{post.title}</p>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => onSubmitForReview(post.id)}
                    className="flex-1 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold flex items-center justify-center gap-1"
                  >
                    <ClipboardCheck className="w-3 h-3" /> Submit for Review
                  </button>
                  <button
                    onClick={() => onDeleteDraft(post.id)}
                    className="p-1.5 rounded-lg border border-slate-200 hover:bg-rose-50 hover:border-rose-300 text-slate-400 hover:text-rose-600"
                    title="Delete draft"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {detectedStatus === 'not_connected' && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-3.5 flex items-center gap-2 text-xs font-bold text-indigo-700">
          <Mail className="w-4 h-4 shrink-0" />
          <span>Connect Gmail in the Connections tab to also see dated events (deadlines, meetings) detected in your inbox here.</span>
        </div>
      )}

      {detectedStatus === 'error' && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3.5 flex items-center justify-between gap-3 text-xs font-bold text-rose-700">
          <span>Couldn't load dated events from your inbox — usually a brief connection hiccup.</span>
          <button
            onClick={loadDetectedEvents}
            className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* Week Navigator & Filters */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <button onClick={() => setWeekOffset(w => w - 1)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-black text-slate-800">
              {days[0].date} – {weekEnd.date}, {weekStart.getFullYear()}
            </span>
            <button onClick={() => setWeekOffset(w => w + 1)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          {weekOffset !== 0 && (
            <button
              onClick={() => setWeekOffset(0)}
              className="text-[11px] font-bold text-[#FF2D85] hover:underline"
            >
              Today
            </button>
          )}
          <input
            type="date"
            value={days[0].iso}
            onChange={(e) => e.target.value && setWeekOffset(weekOffsetForDate(e.target.value))}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11px] font-bold text-slate-600"
            title="Jump to date"
          />
        </div>

        {/* Channel Filter Pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {['all', 'facebook', 'instagram', 'tiktok', 'telegram'].map((plat) => (
            <button
              key={plat}
              onClick={() => setFilterPlatform(plat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize transition-all ${
                filterPlatform === plat
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {plat}
            </button>
          ))}
        </div>
      </div>

      {/* 7-Day Grid */}
      <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
        {days.map((d) => {
          const dayPosts = filteredPosts.filter(p => p.scheduledDate === d.iso);
          const dayEvents = detectedEvents
            .filter(e => e.date === d.iso)
            .sort((a, b) => IMPORTANCE_RANK[a.importance] - IMPORTANCE_RANK[b.importance]);

          return (
            <div
              key={d.iso}
              className={`bg-white rounded-2xl p-3.5 border min-h-[220px] flex flex-col justify-between ${
                d.today ? 'border-[#FF2D85] ring-2 ring-pink-500/20 bg-pink-50/20' : 'border-slate-200/80'
              }`}
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className={`text-xs font-black ${d.today ? 'text-[#FF2D85]' : 'text-slate-700'}`}>
                  {d.day}
                </span>
                <span className={`text-[11px] font-bold ${d.today ? 'text-[#FF2D85]' : 'text-slate-400'}`}>
                  {d.date}
                </span>
              </div>

              {/* Day Items */}
              <div className="space-y-2 py-2 flex-1">
                {dayEvents.map((ev) => {
                  const style = IMPORTANCE_STYLE[ev.importance];
                  const added = addedEventIds.has(ev.id);
                  return (
                    <div
                      key={ev.id}
                      className={`p-2.5 rounded-xl border transition-all space-y-1 ${style.bg} ${style.border}`}
                      title={`From email: ${ev.sourceSubject}`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className={`text-[9px] font-black uppercase flex items-center gap-1 ${style.tag}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                          <Mail className="w-3 h-3" />
                          <span>Email</span>
                        </span>
                        {ev.time && <span className={`text-[9px] font-black ${style.tag}`}>{ev.time}</span>}
                      </div>
                      <p className="text-[11px] font-black text-slate-800 line-clamp-2">{ev.title}</p>
                      {added ? (
                        <span className="flex items-center gap-1 text-[9px] font-black text-emerald-600">
                          <CalendarCheck className="w-3 h-3" />
                          <span>On your calendar</span>
                        </span>
                      ) : (
                        <button
                          onClick={() => addEventToCalendar(ev)}
                          disabled={addingEventId === ev.id}
                          className="flex items-center gap-1 text-[9px] font-black text-slate-500 hover:text-indigo-600 disabled:opacity-50"
                        >
                          <CalendarPlus className="w-3 h-3" />
                          <span>{addingEventId === ev.id ? 'Adding…' : 'Add to Calendar'}</span>
                        </button>
                      )}
                    </div>
                  );
                })}

                {dayPosts.map((post) => (
                  <div
                    key={post.id}
                    className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/70 hover:border-pink-300 transition-all space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        {post.platforms.map(p => (
                          <PlatformLogo key={p} platform={p} className="w-3 h-3" />
                        ))}
                      </div>
                      <span className="text-[9px] font-black text-slate-500">
                        {post.scheduledTime || "12:00"}
                      </span>
                    </div>

                    <p className="text-[11px] font-black text-slate-800 line-clamp-1">
                      {post.title}
                    </p>

                    <span className={`inline-block text-[9px] font-black px-1.5 py-0.2 rounded-md ${
                      post.status === 'published' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                    }`}>
                      {post.status}
                    </span>
                  </div>
                ))}

                {dayPosts.length === 0 && dayEvents.length === 0 && (
                  <p className="text-[10px] text-slate-300 font-medium text-center py-4">Nothing scheduled</p>
                )}
              </div>

              <button
                onClick={onCreatePost}
                className="w-full py-1 text-center rounded-lg hover:bg-slate-100 text-[11px] font-bold text-slate-400 hover:text-slate-700 transition-colors"
              >
                + Schedule
              </button>
            </div>
          );
        })}
      </div>

    </div>
  );
};
