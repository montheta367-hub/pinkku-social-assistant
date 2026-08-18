import React, { useState, useEffect } from 'react';
import { UserProfile } from '../types';
import { TabType } from '../components/Sidebar';
import { Mail, Sparkles, Send, RefreshCw, Check, AlertCircle, PlugZap, CalendarPlus, CalendarCheck } from 'lucide-react';

interface GmailAIViewProps {
  user: UserProfile;
  onSelectTab: (tab: TabType) => void;
}

type Importance = 'urgent' | 'important' | 'normal' | 'low';

interface GmailMessage {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  unread: boolean;
  importance?: Importance;
  eventDetected?: boolean;
  eventTitle?: string | null;
  eventDate?: string | null;
  eventTime?: string | null;
}

function parseFrom(from: string): { name: string; email: string } {
  const match = from.match(/^(.*?)\s*<(.+)>$/);
  if (match) {
    return { name: match[1].replace(/"/g, '').trim() || match[2], email: match[2] };
  }
  return { name: from, email: from };
}

const IMPORTANCE_STYLE: Record<Importance, { dot: string; label: string; badge: string; header: string }> = {
  urgent: { dot: 'bg-red-500', label: 'Urgent', badge: 'bg-red-100 text-red-700', header: 'text-red-600' },
  important: { dot: 'bg-orange-500', label: 'Important', badge: 'bg-orange-100 text-orange-700', header: 'text-orange-600' },
  normal: { dot: 'bg-blue-400', label: 'Normal', badge: 'bg-blue-100 text-blue-700', header: 'text-blue-500' },
  low: { dot: 'bg-slate-300', label: 'Low Priority', badge: 'bg-slate-100 text-slate-500', header: 'text-slate-400' },
};

const IMPORTANCE_ORDER: Importance[] = ['urgent', 'important', 'normal', 'low'];
type FilterLevel = 'all' | Importance;

export const GmailAIView: React.FC<GmailAIViewProps> = ({ user, onSelectTab }) => {
  const [status, setStatus] = useState<'loading' | 'not_connected' | 'ready' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [emails, setEmails] = useState<GmailMessage[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<GmailMessage | null>(null);

  const [aiDraft, setAiDraft] = useState('');
  const [isDrafting, setIsDrafting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [filterLevel, setFilterLevel] = useState<FilterLevel>('all');
  const [addedEventIds, setAddedEventIds] = useState<Set<string>>(new Set());
  const [addingEventId, setAddingEventId] = useState<string | null>(null);

  const AUTO_LOAD_CAP = 200;

  const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('pinkku_token')}` });

  const fetchPage = async (pageToken?: string): Promise<{ messages: GmailMessage[]; nextPageToken: string | null } | null> => {
    const url = pageToken ? `/api/gmail/messages?pageToken=${encodeURIComponent(pageToken)}` : '/api/gmail/messages';
    const res = await fetch(url, { headers: authHeader() });
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 404) {
        setStatus('not_connected');
      } else {
        setStatus('error');
        setErrorMsg(data.error || 'Could not load your Gmail inbox.');
      }
      return null;
    }
    return { messages: data.messages || [], nextPageToken: data.nextPageToken || null };
  };

  const loadMessages = async () => {
    setStatus('loading');
    try {
      const first = await fetchPage();
      if (!first) return;

      setEmails(first.messages);
      setSelectedEmail(first.messages[0] || null);
      setStatus('ready');
      analyzeMessages(first.messages);

      // Automatically keep pulling the rest of the inbox in the background,
      // up to a safety cap, instead of making the user click repeatedly.
      let total = first.messages.length;
      let token = first.nextPageToken;
      if (token) setIsLoadingMore(true);
      while (token && total < AUTO_LOAD_CAP) {
        const page = await fetchPage(token);
        if (!page) break;
        setEmails(prev => [...prev, ...page.messages]);
        analyzeMessages(page.messages);
        total += page.messages.length;
        token = page.nextPageToken;
      }
      setNextPageToken(token);
      setIsLoadingMore(false);
    } catch {
      setStatus('error');
      setErrorMsg('Could not reach the server.');
      setIsLoadingMore(false);
    }
  };

  const loadMoreMessages = async () => {
    if (!nextPageToken) return;
    setIsLoadingMore(true);
    const page = await fetchPage(nextPageToken);
    if (!page) {
      setIsLoadingMore(false);
      return;
    }
    setEmails(prev => [...prev, ...page.messages]);
    setNextPageToken(page.nextPageToken);
    setIsLoadingMore(false);
    analyzeMessages(page.messages);
  };

  const analyzeMessages = async (loaded: GmailMessage[]) => {
    if (loaded.length === 0) return;
    setIsAnalyzing(true);
    try {
      const res = await fetch('/api/gmail/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({
          messages: loaded.map(m => ({ id: m.id, subject: m.subject, snippet: m.snippet })),
        }),
      });
      const data = await res.json();
      const byId = new Map((data.results || []).map((r: any) => [r.id, r]));
      setEmails(prev => prev.map(m => {
        const r: any = byId.get(m.id);
        return r ? { ...m, importance: r.importance, eventDetected: r.eventDetected, eventTitle: r.eventTitle, eventDate: r.eventDate, eventTime: r.eventTime } : m;
      }));
      setSelectedEmail(prev => {
        if (!prev) return prev;
        const r: any = byId.get(prev.id);
        return r ? { ...prev, importance: r.importance, eventDetected: r.eventDetected, eventTitle: r.eventTitle, eventDate: r.eventDate, eventTime: r.eventTime } : prev;
      });
    } catch {
      // Importance tagging is a progressive enhancement — inbox still works without it.
    } finally {
      setIsAnalyzing(false);
    }
  };

  const addEventToCalendar = async (email: GmailMessage) => {
    if (!email.eventDate) return;
    setAddingEventId(email.id);
    try {
      const res = await fetch('/api/calendar/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({
          title: email.eventTitle || email.subject,
          date: email.eventDate,
          time: email.eventTime || undefined,
          description: `From email: ${email.subject}\n\n${email.snippet}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Failed to add the event to your calendar.');
        setAddingEventId(null);
        return;
      }
      setAddedEventIds(prev => new Set(prev).add(email.id));
      setAddingEventId(null);
    } catch {
      setErrorMsg('Could not reach the server to add the calendar event.');
      setAddingEventId(null);
    }
  };

  useEffect(() => {
    loadMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedEmail) {
      setAiDraft('');
      return;
    }
    const { name } = parseFrom(selectedEmail.from);
    setIsDrafting(true);
    setSent(false);
    fetch('/api/ai/generate-reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerMessage: selectedEmail.snippet,
        customerName: name,
        platform: 'Gmail',
        businessName: user.businessName,
      }),
    })
      .then(res => res.json())
      .then(data => setAiDraft(data.suggestedReplyEnglish || ''))
      .catch(() => setAiDraft(''))
      .finally(() => setIsDrafting(false));
  }, [selectedEmail?.id]);

  const handleSend = async () => {
    if (!selectedEmail) return;
    setIsSending(true);
    try {
      const { email } = parseFrom(selectedEmail.from);
      const res = await fetch('/api/gmail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({
          to: email,
          subject: selectedEmail.subject.startsWith('Re:') ? selectedEmail.subject : `Re: ${selectedEmail.subject}`,
          body: aiDraft,
          threadId: selectedEmail.threadId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Failed to send the reply.');
        setIsSending(false);
        return;
      }
      setSent(true);
      setIsSending(false);
      setTimeout(() => setSent(false), 4000);
    } catch {
      setErrorMsg('Could not reach the server to send the reply.');
      setIsSending(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="max-w-6xl mx-auto py-24 flex flex-col items-center gap-3 text-slate-400">
        <RefreshCw className="w-6 h-6 animate-spin" />
        <p className="text-xs font-bold">Loading your Gmail inbox…</p>
      </div>
    );
  }

  if (status === 'not_connected') {
    return (
      <div className="max-w-xl mx-auto py-20 text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto">
          <PlugZap className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-black text-slate-900">Connect Gmail to see your inbox here</h2>
        <p className="text-xs text-slate-500 font-medium">
          This view reads your real Gmail messages and drafts AI replies — connect your Google account first from the Connections tab.
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
        <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
        <p className="text-sm font-bold text-slate-800">{errorMsg}</p>
        <button
          onClick={loadMessages}
          className="px-5 py-2.5 rounded-xl bg-slate-900 text-white font-extrabold text-xs"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Mail className="w-6 h-6 text-red-600" />
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Google Business Inbox AI
            </h1>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Reading real inbox for <strong className="text-slate-800">{user.email}</strong>.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadMessages}
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-500"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Gmail Connected</span>
          </span>
        </div>
      </div>

      {/* Importance filter tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {isAnalyzing && (
          <span className="flex items-center gap-1.5 text-[11px] font-bold text-[#FF2D85] mr-1">
            <Sparkles className="w-3 h-3 animate-pulse" />
            <span>AI is triaging your inbox…</span>
          </span>
        )}
        <button
          onClick={() => setFilterLevel('all')}
          className={`px-3 py-1.5 rounded-full text-[11px] font-black transition-all ${
            filterLevel === 'all' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'
          }`}
        >
          All ({emails.length})
        </button>
        {IMPORTANCE_ORDER.map(level => {
          const count = emails.filter(e => (e.importance || 'normal') === level).length;
          const style = IMPORTANCE_STYLE[level];
          const active = filterLevel === level;
          return (
            <button
              key={level}
              onClick={() => setFilterLevel(level)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-black transition-all border ${
                active ? `${style.badge} border-transparent ring-1 ring-offset-1` : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${style.dot}`} />
              <span>{style.label} ({count})</span>
            </button>
          );
        })}
      </div>

      {emails.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 border border-slate-200/80 shadow-sm text-center">
          <p className="text-xs text-slate-500 font-medium">Your inbox is empty — nothing to show here yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* Email list */}
          <div className="lg:col-span-5 bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-sm space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-black text-slate-800">
                Business Mailbox ({filterLevel === 'all' ? emails.length : emails.filter(e => (e.importance || 'normal') === filterLevel).length})
              </span>
              <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1.5">
                {isLoadingMore && <RefreshCw className="w-3 h-3 animate-spin" />}
                <span>{isLoadingMore ? 'Loading your inbox…' : 'Live Gmail Sync'}</span>
              </span>
            </div>

            <div className="space-y-5">
              {filterLevel !== 'all' && emails.filter(e => (e.importance || 'normal') === filterLevel).length === 0 && (
                <p className="text-xs text-slate-400 font-medium text-center py-6">
                  No {IMPORTANCE_STYLE[filterLevel].label.toLowerCase()} emails right now.
                </p>
              )}
              {(filterLevel === 'all' ? IMPORTANCE_ORDER : [filterLevel]).map((level) => {
                const items = emails.filter(e => (e.importance || 'normal') === level);
                if (items.length === 0) return null;
                const style = IMPORTANCE_STYLE[level];
                return (
                  <div key={level} className="space-y-2">
                    {filterLevel === 'all' && (
                      <div className={`flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide ${style.header}`}>
                        <span className={`w-2.5 h-2.5 rounded-full ${style.dot}`} />
                        <span>{style.label}</span>
                        <span className="text-slate-300 font-bold normal-case">({items.length})</span>
                      </div>
                    )}

                    {items.map((item) => {
                      const { name } = parseFrom(item.from);
                      return (
                        <button
                          key={item.id}
                          onClick={() => setSelectedEmail(item)}
                          className={`w-full p-3.5 rounded-2xl text-left border transition-all space-y-1.5 ${
                            selectedEmail?.id === item.id
                              ? 'bg-red-50/60 border-red-200 ring-1 ring-red-300'
                              : 'bg-slate-50/50 border-slate-200/70 hover:bg-slate-100/70'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-black text-slate-900 truncate max-w-[200px]">{name}</span>
                            <span className="text-[10px] text-slate-400 font-medium shrink-0">{item.date}</span>
                          </div>
                          <h4 className="text-xs font-bold text-slate-800 line-clamp-1">{item.subject}</h4>
                          <p className="text-[11px] text-slate-500 font-medium line-clamp-2">{item.snippet}</p>
                          {item.eventDetected && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                              <CalendarPlus className="w-3 h-3" />
                              <span>Event detected</span>
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {nextPageToken && (
              <button
                onClick={loadMoreMessages}
                disabled={isLoadingMore}
                className="w-full py-2.5 rounded-xl border border-dashed border-slate-300 hover:border-red-400 hover:bg-red-50/30 text-slate-600 hover:text-red-600 font-bold text-xs transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingMore ? 'animate-spin' : ''}`} />
                <span>{isLoadingMore ? 'Loading more…' : 'Load More Emails'}</span>
              </button>
            )}
          </div>

          {/* AI Email Composer */}
          {selectedEmail && (
            <div className="lg:col-span-7 bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-5 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="border-b border-slate-100 pb-3 space-y-1.5">
                  <span className={`inline-flex items-center gap-1.5 text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${IMPORTANCE_STYLE[selectedEmail.importance || 'normal'].badge}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${IMPORTANCE_STYLE[selectedEmail.importance || 'normal'].dot}`} />
                    <span>{IMPORTANCE_STYLE[selectedEmail.importance || 'normal'].label}</span>
                  </span>
                  <h3 className="text-base font-black text-slate-900">{selectedEmail.subject}</h3>
                  <p className="text-xs text-slate-500 font-medium">From: <strong>{parseFrom(selectedEmail.from).name}</strong> ({parseFrom(selectedEmail.from).email})</p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-700 leading-relaxed">
                  {selectedEmail.snippet}
                </div>

                {selectedEmail.eventDetected && selectedEmail.eventDate && (
                  <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-200 space-y-2.5">
                    <div className="flex items-center gap-2 text-xs font-black text-indigo-700">
                      <CalendarPlus className="w-4 h-4" />
                      <span>Event detected in this email</span>
                    </div>
                    <p className="text-xs text-slate-700 font-medium">
                      <strong>{selectedEmail.eventTitle || selectedEmail.subject}</strong>
                      {' — '}{selectedEmail.eventDate}{selectedEmail.eventTime ? ` at ${selectedEmail.eventTime}` : ''}
                    </p>
                    {addedEventIds.has(selectedEmail.id) ? (
                      <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                        <CalendarCheck className="w-4 h-4" />
                        <span>Added to your Google Calendar!</span>
                      </div>
                    ) : (
                      <button
                        onClick={() => addEventToCalendar(selectedEmail)}
                        disabled={addingEventId === selectedEmail.id}
                        className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <CalendarPlus className="w-3.5 h-3.5" />
                        <span>{addingEventId === selectedEmail.id ? 'Adding…' : 'Add to Calendar'}</span>
                      </button>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-[#FF2D85] flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>{isDrafting ? 'Drafting reply…' : 'AI Drafted Response'}</span>
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(aiDraft);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                      disabled={!aiDraft}
                      className="text-[11px] font-bold text-slate-600 hover:text-slate-900 flex items-center gap-1 disabled:opacity-40"
                    >
                      {copied ? <Check className="w-3 h-3 text-emerald-600" /> : null}
                      <span>{copied ? "Copied!" : "Copy Text"}</span>
                    </button>
                  </div>

                  <textarea
                    rows={6}
                    value={aiDraft}
                    onChange={(e) => setAiDraft(e.target.value)}
                    placeholder={isDrafting ? 'Generating a suggested reply…' : ''}
                    className="w-full p-3.5 rounded-2xl border border-slate-200 text-xs font-medium text-slate-800 bg-slate-50 focus:bg-white leading-relaxed outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 space-y-2">
                {sent && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-bold flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span>✓ Email sent from your Gmail account!</span>
                  </div>
                )}
                {errorMsg && !sent && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-bold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <button
                  onClick={handleSend}
                  disabled={isSending || !aiDraft.trim()}
                  className="w-full py-3 px-4 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs shadow-md shadow-red-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  <span>{isSending ? 'Sending…' : `Send Reply from ${user.email}`}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
