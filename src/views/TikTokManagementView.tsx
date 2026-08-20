import React, { useState, useEffect } from 'react';
import { SocialPost, UserProfile, CustomerMessage } from '../types';
import { TabType } from '../components/Sidebar';
import {
  RefreshCw, AlertCircle, PlugZap, Sparkles, Trash2, X, Copy, Check, Lightbulb, Hash,
  Video, Users, UserPlus, Clock, FileText, CalendarClock, Film, MessageCircle, Send, CheckCircle2
} from 'lucide-react';

interface TikTokManagementViewProps {
  user: UserProfile;
  posts: SocialPost[];
  messages: CustomerMessage[];
  onUpdateMessage: (id: string, replyText: string) => void;
  onSelectTab: (tab: TabType) => void;
  onDisconnected: () => void;
}

interface ContentTips {
  caption: string;
  hashtags: string[];
  tips: string[];
}

type ConnectionStatus = 'loading' | 'DISCONNECTED' | 'CONNECTED' | 'TOKEN_EXPIRED' | 'ERROR';

interface TikTokProfile {
  displayName: string;
  avatarUrl: string | null;
  openId: string | null;
  followerCount?: number | null;
  followingCount?: number | null;
  videoCount?: number | null;
}

function normalizeHashtag(tag: string): string {
  const trimmed = tag.trim();
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export const TikTokManagementView: React.FC<TikTokManagementViewProps> = ({ user, posts, messages, onUpdateMessage, onSelectTab, onDisconnected }) => {
  const [status, setStatus] = useState<ConnectionStatus>('loading');
  const [profile, setProfile] = useState<TikTokProfile | null>(null);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [activeTab, setActiveTab] = useState<'comments' | 'videos' | 'scheduled' | 'drafts'>('comments');
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const tiktokMessages = messages.filter(m => m.platform === 'tiktok');
  const [selectedMsgId, setSelectedMsgId] = useState<string>(tiktokMessages[0]?.id || '');
  const [activeReply, setActiveReply] = useState('');
  const [isGeneratingReply, setIsGeneratingReply] = useState(false);
  const [replySent, setReplySent] = useState(false);
  const selectedMsg = tiktokMessages.find(m => m.id === selectedMsgId) || tiktokMessages[0];

  const handleSelectMessage = (msg: CustomerMessage) => {
    setSelectedMsgId(msg.id);
    setActiveReply(msg.suggestedReplyMyanmar || '');
    setReplySent(false);
  };

  const handleGenerateReply = async () => {
    if (!selectedMsg) return;
    setIsGeneratingReply(true);
    try {
      const res = await fetch('/api/ai/generate-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerMessage: selectedMsg.message,
          customerName: selectedMsg.customerName,
          platform: 'TikTok',
          businessName: user.businessName,
        }),
      });
      const data = await res.json();
      setActiveReply(data.suggestedReplyMyanmar || selectedMsg.suggestedReplyMyanmar || '');
    } catch {
      // Fall back silently to whatever draft is already in the box.
    } finally {
      setIsGeneratingReply(false);
    }
  };

  const handleSendReply = () => {
    if (!activeReply.trim() || !selectedMsg) return;
    onUpdateMessage(selectedMsg.id, activeReply);
    setReplySent(true);
    setTimeout(() => setReplySent(false), 2500);
  };

  const [tipsTopic, setTipsTopic] = useState('');
  const [isGeneratingTips, setIsGeneratingTips] = useState(false);
  const [contentTips, setContentTips] = useState<ContentTips | null>(null);
  const [tipsError, setTipsError] = useState('');
  const [copiedField, setCopiedField] = useState<'caption' | 'hashtags' | null>(null);

  const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('pinkku_token')}` });

  const handleGenerateTips = async () => {
    if (!tipsTopic.trim()) return;
    setIsGeneratingTips(true);
    setTipsError('');
    try {
      const res = await fetch('/api/tiktok/content-tips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ topic: tipsTopic.trim(), businessType: user.businessType }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTipsError(data.error || 'Could not generate suggestions.');
        setIsGeneratingTips(false);
        return;
      }
      setContentTips(data);
      setIsGeneratingTips(false);
    } catch {
      setTipsError('Could not reach the server.');
      setIsGeneratingTips(false);
    }
  };

  const copyToClipboard = (text: string, field: 'caption' | 'hashtags') => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const loadStatus = async () => {
    setStatus('loading');
    try {
      const res = await fetch('/api/tiktok/status', { headers: authHeader() });
      const data = await res.json();
      if (!res.ok) {
        setStatus('ERROR');
        setErrorMsg(data.error || 'Could not load your TikTok connection.');
        return;
      }
      setStatus(data.status);
      setProfile(data.profile || null);
      setLastSynced(data.lastSynced || null);
    } catch {
      setStatus('ERROR');
      setErrorMsg('Could not reach the server.');
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      await fetch('/api/connections/tiktok/disconnect', { method: 'POST', headers: authHeader() });
    } catch {
      // Proceed regardless — local state still resets, matching the rest of the app's pattern.
    }
    setIsDisconnecting(false);
    setShowDisconnectConfirm(false);
    onDisconnected();
    onSelectTab('connections');
  };

  const tiktokPosts = posts.filter(p => p.platforms.includes('tiktok'));
  const scheduledPosts = tiktokPosts.filter(p => p.status === 'scheduled');
  const draftPosts = tiktokPosts.filter(p => p.status === 'draft');

  if (status === 'loading') {
    return (
      <div className="max-w-5xl mx-auto py-24 flex flex-col items-center gap-3 text-slate-400">
        <RefreshCw className="w-6 h-6 animate-spin" />
        <p className="text-xs font-bold">Loading your TikTok connection…</p>
      </div>
    );
  }

  if (status === 'DISCONNECTED') {
    return (
      <div className="max-w-xl mx-auto py-20 text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-slate-900 text-white flex items-center justify-center mx-auto">
          <PlugZap className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-black text-slate-900">TikTok isn't connected yet</h2>
        <p className="text-xs text-slate-500 font-medium">Connect your TikTok account from the Spider Connect Hub to manage it here.</p>
        <button
          onClick={() => onSelectTab('connections')}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-[#FF2D85] text-white font-extrabold text-xs shadow-md shadow-pink-500/25"
        >
          Go to Spider Connect Hub
        </button>
      </div>
    );
  }

  if (status === 'ERROR') {
    return (
      <div className="max-w-xl mx-auto py-20 text-center space-y-4">
        <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
        <p className="text-sm font-bold text-slate-800">{errorMsg || 'Something went wrong reaching TikTok.'}</p>
        <p className="text-xs text-slate-500 font-medium">
          This usually means the connection is stale (missing a permission the app now needs). Disconnect and reconnect to re-authorize it.
        </p>
        <div className="flex items-center justify-center gap-2">
          <button onClick={loadStatus} className="px-5 py-2.5 rounded-xl bg-slate-900 text-white font-extrabold text-xs">
            Try Again
          </button>
          <button
            onClick={() => setShowDisconnectConfirm(true)}
            className="px-5 py-2.5 rounded-xl border border-slate-200 hover:border-rose-300 hover:bg-rose-50 text-slate-600 hover:text-rose-600 font-extrabold text-xs flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            <span>Disconnect & Reconnect TikTok</span>
          </button>
        </div>

        {showDisconnectConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
            <div className="relative w-full max-w-sm bg-white rounded-3xl p-6 border border-slate-100 shadow-2xl space-y-4 text-left">
              <button onClick={() => setShowDisconnectConfirm(false)} className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-100 text-slate-400">
                <X className="w-4 h-4" />
              </button>
              <h3 className="text-base font-black text-slate-900">Disconnect TikTok from Pinkku?</h3>
              <p className="text-xs text-slate-500 font-medium">You'll be taken to the Connections tab to reconnect and grant fresh access.</p>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setShowDisconnectConfirm(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDisconnect}
                  disabled={isDisconnecting}
                  className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs disabled:opacity-50"
                >
                  {isDisconnecting ? 'Disconnecting…' : 'Disconnect'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">

      {status === 'TOKEN_EXPIRED' && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 flex items-center justify-between gap-3 text-xs font-bold text-amber-800">
          <span className="flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0" /> Your TikTok connection needs to be refreshed.</span>
          <button
            onClick={() => onSelectTab('connections')}
            className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white shrink-0"
          >
            Reconnect TikTok
          </button>
        </div>
      )}

      {/* Account Header */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          {profile?.avatarUrl ? (
            <img src={profile.avatarUrl} alt="" className="w-16 h-16 rounded-2xl object-cover border border-slate-200" />
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-slate-900 text-white flex items-center justify-center text-xl font-black">
              {(profile?.displayName || 'TT').slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-lg font-black text-slate-900">{profile?.displayName || 'TikTok Account'}</h1>
            <div className="flex items-center gap-1.5 mt-1">
              <span className={`w-2 h-2 rounded-full ${status === 'CONNECTED' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              <span className="text-xs font-bold text-slate-500">
                {status === 'CONNECTED' ? 'Connected' : 'Needs attention'}
                {lastSynced && <> · Last synced {timeAgo(lastSynced)}</>}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onSelectTab('creator')}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-[#FF2D85] text-white font-extrabold text-xs shadow-md shadow-pink-500/25 flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            <span>Create Post</span>
          </button>
          <button
            onClick={() => setShowDisconnectConfirm(true)}
            className="px-4 py-2.5 rounded-xl border border-slate-200 hover:border-rose-300 hover:bg-rose-50 text-slate-600 hover:text-rose-600 font-bold text-xs flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            <span>Disconnect</span>
          </button>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: Film, label: 'Videos', value: profile?.videoCount, note: 'Requires TikTok Display API access' },
          { icon: Users, label: 'Followers', value: profile?.followerCount, note: 'Requires TikTok Display API access' },
          { icon: UserPlus, label: 'Following', value: profile?.followingCount, note: 'Requires TikTok Display API access' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm space-y-2" title={stat.value == null ? stat.note : undefined}>
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-bold">{stat.label}</span>
              <div className="p-2 rounded-xl bg-slate-100 text-slate-500">
                <stat.icon className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-slate-900">{stat.value ?? 'N/A'}</div>
          </div>
        ))}
        <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold">Last Sync</span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-lg font-black text-slate-900">{lastSynced ? timeAgo(lastSynced) : 'N/A'}</div>
        </div>
      </div>

      {/* AI Content Assistant */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-[#FF2D85]" />
          <h2 className="text-sm font-black text-slate-900">AI Content Assistant</h2>
        </div>
        <p className="text-xs text-slate-500 font-medium -mt-2">
          Describe what you want to post about — get a caption, hashtags, and concrete tips for getting more views.
        </p>

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={tipsTopic}
            onChange={(e) => setTipsTopic(e.target.value)}
            placeholder="e.g. Behind-the-scenes of packing a customer order"
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-xs font-medium text-slate-800 outline-none focus:ring-2 focus:ring-pink-500"
          />
          <button
            onClick={handleGenerateTips}
            disabled={isGeneratingTips || !tipsTopic.trim()}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-[#FF2D85] text-white font-extrabold text-xs shadow-md shadow-pink-500/25 flex items-center justify-center gap-2 disabled:opacity-50 shrink-0"
          >
            {isGeneratingTips ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            <span>{isGeneratingTips ? 'Thinking…' : 'Get AI Suggestions'}</span>
          </button>
        </div>

        {tipsError && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{tipsError}</span>
          </div>
        )}

        {contentTips && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-black text-slate-500 uppercase tracking-wide">Suggested Caption</label>
                  <button
                    onClick={() => copyToClipboard(contentTips.caption, 'caption')}
                    className="text-[11px] font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1"
                  >
                    {copiedField === 'caption' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedField === 'caption' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <p className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800">{contentTips.caption}</p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-black text-slate-500 uppercase tracking-wide flex items-center gap-1">
                    <Hash className="w-3 h-3" /> Hashtags
                  </label>
                  <button
                    onClick={() => copyToClipboard(contentTips.hashtags.map(normalizeHashtag).join(' '), 'hashtags')}
                    className="text-[11px] font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1"
                  >
                    {copiedField === 'hashtags' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedField === 'hashtags' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {contentTips.hashtags.map((tag, i) => (
                    <span key={i} className="px-2.5 py-1 rounded-lg bg-pink-50 text-[#FF2D85] text-xs font-bold">{normalizeHashtag(tag)}</span>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-wide flex items-center gap-1 mb-1">
                <Lightbulb className="w-3 h-3" /> Tips to Get More Views
              </label>
              <ul className="space-y-1.5">
                {contentTips.tips.map((tip, i) => (
                  <li key={i} className="p-2.5 rounded-xl bg-indigo-50/60 border border-indigo-100 text-xs text-slate-700 font-medium">{tip}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Content Tabs */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="flex border-b border-slate-100">
          {([
            { id: 'comments', label: 'Comments & DMs', count: tiktokMessages.filter(m => m.status === 'unread').length || null },
            { id: 'videos', label: 'Recent Videos', count: null },
            { id: 'scheduled', label: 'Scheduled', count: scheduledPosts.length },
            { id: 'drafts', label: 'Drafts', count: draftPosts.length },
          ] as const).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-4 py-3 text-xs font-black transition-all ${
                activeTab === tab.id ? 'text-[#FF2D85] border-b-2 border-[#FF2D85]' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {tab.label}{tab.count !== null ? ` (${tab.count})` : ''}
            </button>
          ))}
        </div>

        <div className="p-6">
          {activeTab === 'comments' && (
            tiktokMessages.length === 0 ? (
              <div className="text-center py-10 space-y-2">
                <MessageCircle className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs font-bold text-slate-500">No TikTok comments or DMs yet</p>
                <p className="text-[11px] text-slate-400 font-medium max-w-sm mx-auto">
                  TikTok doesn't grant third-party apps API access to comments and DMs, so this is a demo inbox — replies here are saved in Pinkku only, not sent to TikTok.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* Message list */}
                <div className="lg:col-span-5 space-y-2 max-h-[520px] overflow-y-auto pr-1">
                  {tiktokMessages.map((msg) => {
                    const isSelected = msg.id === selectedMsg?.id;
                    return (
                      <button
                        key={msg.id}
                        onClick={() => handleSelectMessage(msg)}
                        className={`w-full p-3.5 rounded-2xl text-left border transition-all space-y-2 ${
                          isSelected
                            ? 'bg-slate-100 border-slate-400 ring-1 ring-slate-300'
                            : 'bg-slate-50/50 border-slate-200/70 hover:bg-slate-100/70'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-slate-900">{msg.customerName}</span>
                          <div className="flex items-center gap-1.5">
                            {msg.status === 'unread' ? (
                              <span className="w-2 h-2 rounded-full bg-rose-500" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            )}
                            <span className="text-[10px] font-medium text-slate-400">{msg.timestamp}</span>
                          </div>
                        </div>
                        <p className="text-xs text-slate-600 font-medium line-clamp-2">{msg.message}</p>
                        {msg.orderIntent && (
                          <span className="inline-block text-[10px] font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
                            🛍️ Order / Price Inquiry
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Composer */}
                {selectedMsg && (
                  <div className="lg:col-span-7 space-y-4">
                    <div className="p-4 rounded-2xl bg-slate-100/80 text-slate-800 space-y-1">
                      <span className="text-[10px] font-bold uppercase text-slate-400">{selectedMsg.customerName} commented:</span>
                      <p className="text-xs font-semibold leading-relaxed">"{selectedMsg.message}"</p>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-black text-[#FF2D85]">
                        <Sparkles className="w-4 h-4" />
                        <span>AI Burmese Reply:</span>
                      </div>
                      <button
                        onClick={handleGenerateReply}
                        disabled={isGeneratingReply}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-[11px] font-bold text-slate-600 flex items-center gap-1"
                      >
                        <RefreshCw className={`w-3 h-3 ${isGeneratingReply ? 'animate-spin' : ''}`} />
                        <span>{isGeneratingReply ? 'Thinking…' : 'Regenerate'}</span>
                      </button>
                    </div>

                    <textarea
                      rows={5}
                      value={activeReply}
                      onChange={(e) => setActiveReply(e.target.value)}
                      placeholder="Burmese reply will appear here…"
                      className="w-full p-3.5 rounded-2xl border border-slate-200 text-xs font-medium text-slate-800 bg-slate-50 focus:bg-white leading-relaxed outline-none focus:ring-2 focus:ring-pink-500"
                    />

                    {replySent && (
                      <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-bold flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-600" />
                        <span>✓ Reply saved for {selectedMsg.customerName}!</span>
                      </div>
                    )}

                    <button
                      onClick={handleSendReply}
                      disabled={!activeReply.trim()}
                      className="w-full py-3 px-4 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-40"
                    >
                      <Send className="w-4 h-4" />
                      <span>Save Reply</span>
                    </button>
                  </div>
                )}
              </div>
            )
          )}

          {activeTab === 'videos' && (
            <div className="text-center py-10 space-y-2">
              <Video className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-xs font-bold text-slate-500">Video list isn't available yet</p>
              <p className="text-[11px] text-slate-400 font-medium max-w-sm mx-auto">
                Reading your published TikTok videos requires the Display API's <code className="bg-slate-100 px-1 rounded">video.list</code> scope, which hasn't been added to Pinkku's TikTok app yet.
              </p>
            </div>
          )}

          {activeTab === 'scheduled' && (
            scheduledPosts.length === 0 ? (
              <div className="text-center py-10 space-y-2">
                <CalendarClock className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs font-bold text-slate-500">Nothing scheduled for TikTok yet</p>
                <button onClick={() => onSelectTab('creator')} className="text-xs font-bold text-[#FF2D85] hover:underline">
                  Create a post →
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {scheduledPosts.map(post => (
                  <PostRow key={post.id} post={post} />
                ))}
              </div>
            )
          )}

          {activeTab === 'drafts' && (
            draftPosts.length === 0 ? (
              <div className="text-center py-10 space-y-2">
                <FileText className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs font-bold text-slate-500">No drafts saved for TikTok yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {draftPosts.map(post => (
                  <PostRow key={post.id} post={post} />
                ))}
              </div>
            )
          )}
        </div>
      </div>

      {/* Disconnect confirmation */}
      {showDisconnectConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
          <div className="relative w-full max-w-sm bg-white rounded-3xl p-6 border border-slate-100 shadow-2xl space-y-4">
            <button onClick={() => setShowDisconnectConfirm(false)} className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-100 text-slate-400">
              <X className="w-4 h-4" />
            </button>
            <h3 className="text-base font-black text-slate-900">Disconnect TikTok from Pinkku?</h3>
            <p className="text-xs text-slate-500 font-medium">Pinkku will no longer be able to read your TikTok profile or manage content for this account.</p>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowDisconnectConfirm(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDisconnect}
                disabled={isDisconnecting}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs disabled:opacity-50"
              >
                {isDisconnecting ? 'Disconnecting…' : 'Disconnect'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const PostRow: React.FC<{ post: SocialPost }> = ({ post }) => (
  <div className="p-3.5 rounded-2xl bg-slate-50/70 border border-slate-200/60 flex items-center justify-between gap-3">
    <div className="min-w-0">
      <p className="text-xs font-black text-slate-900 truncate">{post.title}</p>
      <p className="text-[11px] text-slate-500 font-medium line-clamp-1">{post.myanmarContent || post.content}</p>
    </div>
    <span className="text-[10px] text-slate-400 font-bold shrink-0">
      {post.scheduledDate ? `${post.scheduledDate}${post.scheduledTime ? ' @ ' + post.scheduledTime : ''}` : post.createdAt}
    </span>
  </div>
);
