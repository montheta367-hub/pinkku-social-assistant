import React, { useState, useEffect, useMemo } from 'react';
import { UserProfile } from '../types';
import { TabType } from '../components/Sidebar';
import {
  CalendarClock, RefreshCw, Sparkles, Plus, ChevronLeft, ChevronRight,
  Mail, Users, Flag, CalendarCheck, CalendarPlus, Pencil, ExternalLink,
  Wand2, Clock, X, AlertTriangle, PlugZap, ClipboardList, Send, Trash2
} from 'lucide-react';

interface AISmartScheduleViewProps {
  user: UserProfile;
  onSelectTab: (tab: TabType) => void;
}

type Importance = 'urgent' | 'important' | 'normal' | 'low';

interface DetectedEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  time: string | null;
  importance: Importance;
  sourceSubject: string;
  manual?: boolean;
}

const IMPORTANCE_STYLE: Record<Importance, { badge: string; dot: string; label: string; text: string }> = {
  urgent: { badge: 'bg-red-100 text-red-700', dot: 'bg-red-500', label: 'Urgent', text: 'text-red-600' },
  important: { badge: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500', label: 'Important', text: 'text-orange-600' },
  normal: { badge: 'bg-blue-100 text-blue-700', dot: 'bg-blue-400', label: 'Meeting', text: 'text-blue-500' },
  low: { badge: 'bg-slate-100 text-slate-500', dot: 'bg-slate-300', label: 'Low Priority', text: 'text-slate-400' },
};
const IMPORTANCE_RANK: Record<Importance, number> = { urgent: 0, important: 1, normal: 2, low: 3 };

function isMeeting(ev: DetectedEvent): boolean {
  return /meeting|call|appointment|sync[- ]?up|catch[- ]?up/i.test(`${ev.title} ${ev.sourceSubject}`);
}
function isDeadline(ev: DetectedEvent): boolean {
  return /deadline|due|submit|submission|report/i.test(`${ev.title} ${ev.sourceSubject}`);
}
function isFromTelegram(ev: DetectedEvent): boolean {
  // Matches both the private-chat format ("Telegram — ...") and the group
  // format ("Telegram Group (...) — ...").
  return ev.sourceSubject?.startsWith('Telegram') ?? false;
}
function eventIcon(ev: DetectedEvent) {
  if (ev.manual) return CalendarClock;
  if (isFromTelegram(ev)) return Send;
  if (isMeeting(ev)) return Users;
  if (isDeadline(ev)) return Flag;
  return Mail;
}
function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function formatDateLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export const AISmartScheduleView: React.FC<AISmartScheduleViewProps> = ({ user, onSelectTab }) => {
  const [status, setStatus] = useState<'loading' | 'not_connected' | 'ready' | 'error'>('loading');
  const [events, setEvents] = useState<DetectedEvent[]>([]);
  const [manualEvents, setManualEvents] = useState<DetectedEvent[]>([]);
  const [addedEventIds, setAddedEventIds] = useState<Set<string>>(new Set());
  const [isSyncing, setIsSyncing] = useState(false);
  const [monthCursor, setMonthCursor] = useState(() => new Date());
  const [showPlan, setShowPlan] = useState(false);
  const [editingEvent, setEditingEvent] = useState<DetectedEvent | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newEvent, setNewEvent] = useState({ title: '', date: toISODate(new Date()), time: '' });

  const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('pinkku_token')}` });

  const loadEvents = async () => {
    setStatus('loading');
    try {
      const res = await fetch('/api/calendar/detected-events', { headers: authHeader() });
      if (res.status === 404) { setStatus('not_connected'); return; }
      if (!res.ok) { setStatus('error'); return; }
      const data = await res.json();
      setEvents(data.events || []);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  };

  // Pinkku's own schedule (separate from Google Calendar) — persisted server-side
  // so manually-added and marked events survive refresh/logout.
  const loadSchedule = async () => {
    try {
      const res = await fetch('/api/schedule/events', { headers: authHeader() });
      if (!res.ok) return;
      const data = await res.json();
      const rows: DetectedEvent[] = data.events || [];
      setManualEvents(rows);
      setAddedEventIds(new Set(rows.map(r => r.id)));
    } catch {
      // schedule persistence is a progressive enhancement — the view still works without it
    }
  };

  useEffect(() => {
    loadEvents();
    loadSchedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSync = async () => {
    setIsSyncing(true);
    await loadEvents();
    setIsSyncing(false);
  };

  const markAdded = async (ev: DetectedEvent) => {
    setAddedEventIds(prev => new Set(prev).add(ev.id));
    setManualEvents(prev => (prev.some(e => e.id === ev.id) ? prev.map(e => (e.id === ev.id ? ev : e)) : [...prev, ev]));
    try {
      await fetch('/api/schedule/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({
          id: ev.id, title: ev.title, date: ev.date, time: ev.time,
          importance: ev.importance, sourceSubject: ev.sourceSubject, manual: !!ev.manual,
        }),
      });
    } catch {
      // stays marked locally for this session even if the sync call fails
    }
  };

  const removeEvent = async (id: string) => {
    setManualEvents(prev => prev.filter(e => e.id !== id));
    setAddedEventIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    try {
      await fetch(`/api/schedule/events/${id}`, { method: 'DELETE', headers: authHeader() });
    } catch {
      // already removed locally; a stale row server-side is harmless
    }
  };

  const saveEditedEvent = () => {
    if (!editingEvent) return;
    markAdded(editingEvent);
    setEditingEvent(null);
  };

  const handleAddManualEvent = () => {
    if (!newEvent.title.trim() || !newEvent.date) return;
    const id = `manual_${Date.now()}`;
    markAdded({ id, title: newEvent.title.trim(), date: newEvent.date, time: newEvent.time || null, importance: 'normal', sourceSubject: '', manual: true });
    setShowAddModal(false);
    setNewEvent({ title: '', date: toISODate(new Date()), time: '' });
  };

  // Fresh Gmail detection is the baseline; persisted/edited rows (manual
  // events, and any snapshot the user edited before adding) override by id.
  const allEvents = useMemo(() => {
    const map = new Map<string, DetectedEvent>();
    events.forEach(e => map.set(e.id, e));
    manualEvents.forEach(e => map.set(e.id, e));
    return Array.from(map.values());
  }, [events, manualEvents]);
  const todayISO = toISODate(new Date());
  const todayEvents = useMemo(
    () => allEvents.filter(e => e.date === todayISO).sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99')),
    [allEvents, todayISO]
  );
  const upcomingEvents = useMemo(
    () => allEvents.filter(e => e.date > todayISO).sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || '')),
    [allEvents, todayISO]
  );
  const urgentCount = events.filter(e => e.importance === 'urgent').length;
  const importantCount = events.filter(e => e.importance === 'important').length;
  const meetingCount = events.filter(isMeeting).length;
  const deadlineCount = events.filter(isDeadline).length;

  const nextMeeting = allEvents.filter(e => isMeeting(e) && e.date >= todayISO).sort((a, b) => a.date.localeCompare(b.date))[0];
  const nextDeadline = allEvents.filter(e => isDeadline(e) && e.date >= todayISO).sort((a, b) => a.date.localeCompare(b.date))[0];

  const plannedOrder = useMemo(
    () => [...todayEvents, ...upcomingEvents.slice(0, 4)].sort((a, b) => IMPORTANCE_RANK[a.importance] - IMPORTANCE_RANK[b.importance]),
    [todayEvents, upcomingEvents]
  );

  // ---- Mini calendar month grid ----
  const year = monthCursor.getFullYear();
  const month = monthCursor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const eventsByDate = useMemo(() => {
    const map = new Map<string, DetectedEvent[]>();
    allEvents.forEach(e => {
      const arr = map.get(e.date) || [];
      arr.push(e);
      map.set(e.date, arr);
    });
    return map;
  }, [allEvents]);
  const calendarCells: (number | null)[] = [
    ...Array.from({ length: startWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const monthLabel = monthCursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const dotsForDay = (day: number): string[] => {
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayEvents = eventsByDate.get(iso) || [];
    const dots: string[] = [];
    if (dayEvents.some(e => e.importance === 'urgent')) dots.push('bg-red-500');
    if (dayEvents.some(e => e.importance === 'important')) dots.push('bg-orange-500');
    if (dayEvents.some(isMeeting)) dots.push('bg-blue-400');
    if (dayEvents.some(e => addedEventIds.has(e.id))) dots.push('bg-emerald-500');
    return dots.slice(0, 3);
  };

  if (status === 'loading') {
    return (
      <div className="max-w-6xl mx-auto py-24 flex flex-col items-center gap-3 text-slate-400">
        <RefreshCw className="w-6 h-6 animate-spin" />
        <p className="text-xs font-bold">Reading your inbox for tasks &amp; deadlines…</p>
      </div>
    );
  }

  if (status === 'not_connected') {
    return (
      <div className="max-w-xl mx-auto py-20 text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
          <PlugZap className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-black text-slate-900">Connect Gmail to build your Smart Schedule</h2>
        <p className="text-xs text-slate-500 font-medium">
          Pinkku reads your inbox, detects meetings and deadlines, and turns them into a daily plan automatically.
        </p>
        <button
          onClick={() => onSelectTab('connections')}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-[#FF2D85] text-white font-extrabold text-xs shadow-md shadow-pink-500/25"
        >
          Go to Connections
        </button>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="max-w-xl mx-auto py-20 text-center space-y-4">
        <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto" />
        <p className="text-sm font-bold text-slate-800">Couldn't reach your inbox to build the schedule.</p>
        <button onClick={loadEvents} className="px-5 py-2.5 rounded-xl bg-slate-900 text-white font-extrabold text-xs">
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto pb-12">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <CalendarClock className="w-6 h-6 text-[#FF2D85]" />
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">AI Smart Schedule</h1>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            AI-powered tasks, meetings, events and deadlines extracted from your business emails.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-500 disabled:opacity-50"
            title="Sync"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="px-4 py-2.5 rounded-xl bg-white hover:bg-pink-50 border border-pink-200 text-slate-700 font-bold text-xs transition-all flex items-center gap-2 shadow-sm disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4 text-[#FF2D85]" />
            <span>{isSyncing ? 'Scanning…' : 'AI Scan Emails'}</span>
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-[#FF2D85] text-white font-extrabold text-xs shadow-md shadow-pink-500/25 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Add Event</span>
          </button>
        </div>
      </div>

      {/* AI Summary Banner */}
      <div className="rounded-3xl bg-gradient-to-br from-pink-50 via-rose-50 to-white border border-pink-100/80 p-6 relative overflow-hidden shadow-sm">
        <div className="absolute right-0 top-0 bottom-0 w-1/2 opacity-40 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-pink-200/60 via-rose-100/40 to-transparent pointer-events-none"></div>
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-5 h-5 text-[#FF2D85] shrink-0" />
            <h2 className="text-sm sm:text-base font-black text-slate-900">
              {events.length > 0
                ? <>AI found <span className="text-[#FF2D85]">{events.length}</span> important item{events.length === 1 ? '' : 's'} from your emails</>
                : <>Your inbox is clear — no AI-detected items right now</>}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-[11px] font-black px-3 py-1.5 rounded-full bg-white/90 border border-red-200 text-red-600 shadow-sm">
              🔴 {urgentCount} Urgent
            </span>
            <span className="flex items-center gap-1.5 text-[11px] font-black px-3 py-1.5 rounded-full bg-white/90 border border-orange-200 text-orange-600 shadow-sm">
              🟠 {importantCount} Important
            </span>
            <span className="flex items-center gap-1.5 text-[11px] font-black px-3 py-1.5 rounded-full bg-white/90 border border-blue-200 text-blue-600 shadow-sm">
              🤝 {meetingCount} Meeting{meetingCount === 1 ? '' : 's'}
            </span>
            <span className="flex items-center gap-1.5 text-[11px] font-black px-3 py-1.5 rounded-full bg-white/90 border border-slate-200 text-slate-600 shadow-sm">
              📌 {deadlineCount} Deadline{deadlineCount === 1 ? '' : 's'}
            </span>
          </div>
        </div>
      </div>

      {/* Three-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

        {/* Left: Mini Calendar */}
        <div className="lg:col-span-3 bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-slate-800">📅 {monthLabel}</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setMonthCursor(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-500"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setMonthCursor(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-500"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <span key={i} className="text-[9px] font-black text-slate-300">{d}</span>
            ))}
            {calendarCells.map((day, i) => {
              if (day === null) return <div key={i} />;
              const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const isToday = iso === todayISO;
              const dots = dotsForDay(day);
              return (
                <div
                  key={i}
                  className={`aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold ${
                    isToday ? 'bg-[#FF2D85] text-white' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span>{day}</span>
                  {dots.length > 0 && (
                    <div className="flex items-center gap-0.5">
                      {dots.map((c, di) => <span key={di} className={`w-1 h-1 rounded-full ${isToday ? 'bg-white' : c}`} />)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="pt-3 border-t border-slate-100 space-y-1.5">
            {[
              { color: 'bg-red-500', label: 'Urgent' },
              { color: 'bg-orange-500', label: 'Important' },
              { color: 'bg-blue-400', label: 'Meeting' },
              { color: 'bg-emerald-500', label: 'Completed' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-2 text-[10px] font-bold text-slate-500">
                <span className={`w-2 h-2 rounded-full ${item.color}`} />
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Center: Today's Timeline */}
        <div className="lg:col-span-6 bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-sm space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900">
              Today · {new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}
            </h3>
            <span className="text-[11px] font-bold text-slate-400">{todayEvents.length} item{todayEvents.length === 1 ? '' : 's'}</span>
          </div>

          {todayEvents.length === 0 ? (
            <div className="py-16 text-center space-y-2">
              <CalendarCheck className="w-8 h-8 text-emerald-400 mx-auto" />
              <p className="text-xs font-bold text-slate-400">Nothing detected for today — you're all caught up.</p>
            </div>
          ) : (
            <div className="relative pl-6 space-y-5">
              <div className="absolute left-[9px] top-2 bottom-2 w-px bg-slate-200" />
              {todayEvents.map((ev) => {
                const style = IMPORTANCE_STYLE[ev.importance];
                const Icon = eventIcon(ev);
                const added = addedEventIds.has(ev.id);
                return (
                  <div key={ev.id} className="relative">
                    <span className={`absolute -left-6 top-1 w-4 h-4 rounded-full border-2 border-white shadow ${style.dot}`} />
                    <div className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200/70 hover:border-pink-300 transition-all space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-xs font-black text-slate-800">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          {ev.time || 'All day'}
                        </span>
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${style.badge}`}>
                          {style.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 text-slate-400 shrink-0" />
                        <p className="text-sm font-black text-slate-900 line-clamp-1">{ev.title}</p>
                      </div>
                      <p className="text-[11px] text-slate-400 font-bold flex items-center gap-1.5">
                        {ev.manual
                          ? <>Added manually</>
                          : isFromTelegram(ev)
                            ? <><Send className="w-3 h-3" /> Detected from Telegram</>
                            : <><Mail className="w-3 h-3" /> Detected from Gmail</>}
                      </p>
                      {added ? (
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-600">
                            <CalendarCheck className="w-3.5 h-3.5" /> Added to your schedule
                          </span>
                          <button
                            onClick={() => removeEvent(ev.id)}
                            title="Not a real event — remove"
                            className="text-[11px] font-bold text-slate-400 hover:text-rose-600 flex items-center gap-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => markAdded(ev)}
                          className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-600 hover:text-indigo-700"
                        >
                          <CalendarPlus className="w-3.5 h-3.5" />
                          Add to Schedule
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: AI Insights */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm space-y-3">
            <h3 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-[#FF2D85]" /> AI Insights
            </h3>

            <div className={`p-3.5 rounded-2xl border space-y-1 ${urgentCount > 0 ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
              <p className={`text-xs font-black flex items-center gap-1.5 ${urgentCount > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                {urgentCount > 0 ? <AlertTriangle className="w-3.5 h-3.5" /> : <CalendarCheck className="w-3.5 h-3.5" />}
                {urgentCount > 0 ? `You have ${urgentCount} urgent task${urgentCount === 1 ? '' : 's'}` : 'No urgent tasks right now'}
              </p>
              {todayEvents.find(e => e.importance === 'urgent') && (
                <p className="text-[11px] text-red-600/80 font-medium">
                  {todayEvents.find(e => e.importance === 'urgent')!.title} is due today.
                </p>
              )}
            </div>

            <div className="p-3.5 rounded-2xl bg-blue-50 border border-blue-200 space-y-1">
              <p className="text-xs font-black text-blue-700 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" /> Upcoming Meeting
              </p>
              <p className="text-[11px] text-blue-600/80 font-medium">
                {nextMeeting ? <>{nextMeeting.title} — {formatDateLabel(nextMeeting.date)}{nextMeeting.time ? ` at ${nextMeeting.time}` : ''}</> : 'No meetings detected yet.'}
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 space-y-1">
              <p className="text-xs font-black text-amber-700 flex items-center gap-1.5">
                <Wand2 className="w-3.5 h-3.5" /> AI Suggestion
              </p>
              <p className="text-[11px] text-amber-700/80 font-medium">
                {nextDeadline
                  ? <>Complete "{nextDeadline.title}" before {nextDeadline.time || 'end of day'} on {formatDateLabel(nextDeadline.date)} to avoid deadline pressure.</>
                  : 'No looming deadlines — good time to get ahead on content.'}
              </p>
            </div>

            <button
              onClick={() => setShowPlan(v => !v)}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-[#FF2D85] text-white font-extrabold text-xs shadow-md shadow-pink-500/25 flex items-center justify-center gap-2"
            >
              <Wand2 className="w-4 h-4" />
              <span>Ask AI to Plan My Day</span>
            </button>

            {showPlan && (
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                {plannedOrder.length === 0 ? (
                  <p className="text-[11px] text-slate-400 font-medium">Nothing to plan yet — your schedule is clear.</p>
                ) : plannedOrder.map((ev, i) => (
                  <div key={ev.id} className="flex items-start gap-2 text-[11px]">
                    <span className="w-4 h-4 rounded-full bg-slate-900 text-white text-[9px] font-black flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                    <span className="text-slate-700 font-bold">
                      {ev.title} <span className="text-slate-400 font-medium">— {formatDateLabel(ev.date)}{ev.time ? ` · ${ev.time}` : ''}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm space-y-3">
            <h3 className="text-xs font-black text-slate-900">Upcoming Events</h3>
            {upcomingEvents.length === 0 ? (
              <p className="text-[11px] text-slate-400 font-medium">Nothing else on the horizon yet.</p>
            ) : upcomingEvents.slice(0, 4).map(ev => (
              <div key={ev.id} className="flex items-center justify-between gap-2 text-[11px] py-1">
                <span className="text-slate-600 font-bold truncate">
                  {formatDateLabel(ev.date)}{ev.time ? ` · ${ev.time}` : ''} — {ev.title}
                </span>
                {ev.importance === 'urgent' && <span className="shrink-0">🔴</span>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* AI Detected from Emails */}
      {events.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-black text-slate-900 flex items-center gap-1.5">
            <ClipboardList className="w-4 h-4 text-[#FF2D85]" /> AI Detected from Emails
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {events
              .map(e => manualEvents.find(m => m.id === e.id) || e)
              .sort((a, b) => IMPORTANCE_RANK[a.importance] - IMPORTANCE_RANK[b.importance] || a.date.localeCompare(b.date))
              .map(ev => {
              const style = IMPORTANCE_STYLE[ev.importance];
              const Icon = eventIcon(ev);
              const added = addedEventIds.has(ev.id);
              return (
                <div key={ev.id} className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-black text-slate-900">
                      <Icon className="w-4 h-4 text-slate-400" />
                      <span className="line-clamp-1">{ev.title}</span>
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-bold flex items-center gap-1.5">
                    📅 {formatDateLabel(ev.date)} {ev.time && <>· ⏰ {ev.time}</>}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${style.badge}`}>{style.label}</span>
                    <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1"><Mail className="w-3 h-3" /> Gmail</span>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => onSelectTab('gmail')}
                      className="flex-1 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 text-[11px] font-bold flex items-center justify-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" /> View Email
                    </button>
                    <button
                      onClick={() => setEditingEvent(ev)}
                      className="flex-1 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 text-[11px] font-bold flex items-center justify-center gap-1"
                    >
                      <Pencil className="w-3 h-3" /> Edit
                    </button>
                  </div>
                  {added && (
                    <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600">
                      <CalendarCheck className="w-3 h-3" /> In your schedule
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* AI Detected from Telegram */}
      {manualEvents.some(isFromTelegram) && (
        <div className="space-y-3">
          <h3 className="text-sm font-black text-slate-900 flex items-center gap-1.5">
            <Send className="w-4 h-4 text-sky-500" /> AI Detected from Telegram
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {manualEvents
              .filter(isFromTelegram)
              .sort((a, b) => IMPORTANCE_RANK[a.importance] - IMPORTANCE_RANK[b.importance] || a.date.localeCompare(b.date))
              .map(ev => {
                const style = IMPORTANCE_STYLE[ev.importance];
                return (
                  <div key={ev.id} className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-xs font-black text-slate-900">
                        <Send className="w-4 h-4 text-slate-400" />
                        <span className="line-clamp-1">{ev.title}</span>
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-bold flex items-center gap-1.5">
                      📅 {formatDateLabel(ev.date)} {ev.time && <>· ⏰ {ev.time}</>}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${style.badge}`}>{style.label}</span>
                      <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1"><Send className="w-3 h-3" /> Telegram</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onSelectTab('messages')}
                        className="flex-1 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 text-[11px] font-bold flex items-center justify-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" /> View in Customer DMs
                      </button>
                      <button
                        onClick={() => removeEvent(ev.id)}
                        title="Not a real event — remove"
                        className="p-1.5 rounded-lg border border-slate-200 hover:bg-rose-50 hover:border-rose-300 text-slate-400 hover:text-rose-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600">
                      <CalendarCheck className="w-3 h-3" /> Already in your schedule
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Edit event modal */}
      {editingEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
          <div className="relative w-full max-w-sm bg-white rounded-3xl p-6 border border-slate-100 shadow-2xl space-y-4">
            <button onClick={() => setEditingEvent(null)} className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-100 text-slate-400">
              <X className="w-4 h-4" />
            </button>
            <h3 className="text-base font-black text-slate-900">Edit &amp; add to schedule</h3>
            <div className="space-y-2.5">
              <input
                value={editingEvent.title}
                onChange={e => setEditingEvent({ ...editingEvent, title: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-pink-500"
                placeholder="Title"
              />
              <div className="flex gap-2">
                <input
                  type="date"
                  value={editingEvent.date}
                  onChange={e => setEditingEvent({ ...editingEvent, date: e.target.value })}
                  className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-pink-500"
                />
                <input
                  type="time"
                  value={editingEvent.time || ''}
                  onChange={e => setEditingEvent({ ...editingEvent, time: e.target.value })}
                  className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-pink-500"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setEditingEvent(null)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50">
                Cancel
              </button>
              <button
                onClick={saveEditedEvent}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-[#FF2D85] text-white font-bold text-xs"
              >
                Save & Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add manual event modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
          <div className="relative w-full max-w-sm bg-white rounded-3xl p-6 border border-slate-100 shadow-2xl space-y-4">
            <button onClick={() => setShowAddModal(false)} className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-100 text-slate-400">
              <X className="w-4 h-4" />
            </button>
            <h3 className="text-base font-black text-slate-900">Add Event</h3>
            <div className="space-y-2.5">
              <input
                value={newEvent.title}
                onChange={e => setNewEvent({ ...newEvent, title: e.target.value })}
                placeholder="Event title"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-pink-500"
              />
              <div className="flex gap-2">
                <input
                  type="date"
                  value={newEvent.date}
                  onChange={e => setNewEvent({ ...newEvent, date: e.target.value })}
                  className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-pink-500"
                />
                <input
                  type="time"
                  value={newEvent.time}
                  onChange={e => setNewEvent({ ...newEvent, time: e.target.value })}
                  className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-pink-500"
                />
              </div>
            </div>
            <button
              onClick={handleAddManualEvent}
              disabled={!newEvent.title.trim()}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-[#FF2D85] text-white font-bold text-xs disabled:opacity-50"
            >
              Add to Schedule
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
