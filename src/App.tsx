import React, { useState, useEffect } from 'react';
import { UserProfile, PlatformConnection, SocialPost, CustomerMessage, AIAgent } from './types';
import { guestUserProfile, initialConnections, initialPosts, initialMessages, initialAIAgents, emptyConnections } from './mockData';
import { Navbar } from './components/Navbar';
import { Sidebar, TabType } from './components/Sidebar';
import { AuthModal } from './components/AuthModal';
import { TelegramConnectModal } from './components/TelegramConnectModal';
import { UpgradeModal } from './components/UpgradeModal';
import { ApiKeyModal } from './components/ApiKeyModal';
import { LandingPage } from './views/LandingPage';
import { DashboardView } from './views/DashboardView';
import { ContentCreatorView } from './views/ContentCreatorView';
import { ContentCalendarView } from './views/ContentCalendarView';
import { CustomerReplyView } from './views/CustomerReplyView';
import { ConnectionsView } from './views/ConnectionsView';
import { GmailAIView } from './views/GmailAIView';
import { TikTokManagementView } from './views/TikTokManagementView';
import { AIAgentsView } from './views/AIAgentsView';
import { AnalyticsView } from './views/AnalyticsView';
import { SettingsView } from './views/SettingsView';

export const App: React.FC = () => {
  const [user, setUser] = useState<UserProfile>(() => {
    const saved = localStorage.getItem("pinkku_user");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return guestUserProfile;
      }
    }
    return guestUserProfile;
  });

  const [currentTab, setCurrentTab] = useState<TabType>('dashboard');
  const [connections, setConnections] = useState<PlatformConnection[]>(
    () => (user.isLoggedIn ? initialConnections : emptyConnections)
  );
  const [posts, setPosts] = useState<SocialPost[]>(() => (user.isLoggedIn ? initialPosts : []));
  const [messages, setMessages] = useState<CustomerMessage[]>(() => (user.isLoggedIn ? initialMessages : []));
  const [agents] = useState<AIAgent[]>(initialAIAgents);

  // Modals
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false);
  const [isApiKeyOpen, setIsApiKeyOpen] = useState(false);
  const [isTelegramConnectOpen, setIsTelegramConnectOpen] = useState(false);

  const [connectNotice, setConnectNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Platforms with a real backend connection (as opposed to the local-only toggle).
  const REAL_PLATFORMS = ['gmail', 'telegram', 'facebook', 'tiktok', 'instagram'];
  // These connect via a plain OAuth redirect (POST /api/oauth/<id>/start -> redirectUrl).
  // Instagram Business accounts connect through the same Facebook Page OAuth flow.
  const OAUTH_REDIRECT_PLATFORMS = ['gmail', 'facebook', 'tiktok', 'instagram'];
  const OAUTH_PROVIDER_BY_PLATFORM: Record<string, string> = { gmail: 'google', instagram: 'facebook' };

  // Pull in real connected channels (currently: Gmail via Google OAuth) whenever
  // the user is logged in, and handle the redirect back from /api/oauth/*/callback.
  useEffect(() => {
    if (!user.isLoggedIn) return;

    const params = new URLSearchParams(window.location.search);
    const connected = params.get('connected');
    const connectError = params.get('connect_error');

    if (connected || connectError) {
      if (connected) {
        setConnectNotice({ type: 'success', message: `${connected.charAt(0).toUpperCase() + connected.slice(1)} connected successfully!` });
      } else if (connectError) {
        const messages: Record<string, string> = {
          access_denied: 'You cancelled the connection request.',
          not_configured: 'That connection is not configured on the server yet.',
          token_exchange_failed: 'The connection request was rejected. Please try again.',
          invalid_state: 'That connection link expired. Please try connecting again.',
          no_pages: 'No Facebook Pages found — you need to be an admin of at least one Page to connect.',
        };
        setConnectNotice({ type: 'error', message: messages[connectError] || 'Could not connect that channel.' });
      }
      window.history.replaceState({}, '', window.location.pathname);
    }

    fetchRealConnections();
  }, [user.isLoggedIn, user.id]);

  const fetchRealConnections = async () => {
    const token = localStorage.getItem('pinkku_token');
    if (!token) return;
    try {
      const res = await fetch('/api/connections', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const data = await res.json();
      const real: { platform: string; accountEmail?: string; accountName?: string }[] = data.connections || [];

      setConnections(prev => prev.map(c => {
        const match = real.find(r => r.platform === c.id);
        if (match) {
          return {
            ...c,
            connected: true,
            accountName: match.accountName || match.accountEmail,
            handle: match.accountEmail,
            lastSynced: 'Just now',
          };
        }
        if (REAL_PLATFORMS.includes(c.id)) {
          return { ...c, connected: false, accountName: undefined, handle: undefined };
        }
        return c;
      }));
    } catch {
      // Real connections are a progressive enhancement — silently ignore if unreachable.
    }
  };

  // User actions
  const handleLoginSuccess = (updatedUser: UserProfile, isNewUser: boolean) => {
    setUser(updatedUser);
    localStorage.setItem("pinkku_user", JSON.stringify(updatedUser));
    setCurrentTab('dashboard');

    if (isNewUser) {
      // Brand-new accounts start with a clean, unconnected workspace —
      // no demo followers, posts, or messages.
      setConnections(emptyConnections);
      setPosts([]);
      setMessages([]);
    } else if (updatedUser.email === 'amonthet5@gmail.com') {
      // Preserve the seeded demo account's sample data for showcasing the product.
      setConnections(initialConnections);
      setPosts(initialPosts);
      setMessages(initialMessages);
    }
  };

  const handleLogout = () => {
    const token = localStorage.getItem('pinkku_token');
    if (token) {
      fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    }
    localStorage.removeItem("pinkku_token");
    localStorage.removeItem("pinkku_user");
    setUser(guestUserProfile);
    setCurrentTab('dashboard');
  };

  const handleToggleConnection = async (id: string) => {
    if (OAUTH_REDIRECT_PLATFORMS.includes(id)) {
      const conn = connections.find(c => c.id === id);
      const token = localStorage.getItem('pinkku_token');
      const oauthProvider = OAUTH_PROVIDER_BY_PLATFORM[id] || id;

      if (conn?.connected) {
        setConnections(prev => prev.map(c => c.id === id ? { ...c, connected: false, accountName: undefined, handle: undefined } : c));
        try {
          await fetch(`/api/connections/${id}/disconnect`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
        } catch {
          // Already reflected optimistically; a stale server-side row is harmless.
        }
        return;
      }

      try {
        const res = await fetch(`/api/oauth/${oauthProvider}/start`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (!res.ok || data.error) {
          setConnectNotice({ type: 'error', message: data.error || 'Could not start that connection.' });
          return;
        }
        window.location.href = data.redirectUrl;
      } catch {
        setConnectNotice({ type: 'error', message: 'Could not reach the server to start that connection.' });
      }
      return;
    }

    if (id === 'telegram') {
      const telegramConn = connections.find(c => c.id === 'telegram');
      if (telegramConn?.connected) {
        const token = localStorage.getItem('pinkku_token');
        setConnections(prev => prev.map(c => c.id === 'telegram' ? { ...c, connected: false, accountName: undefined, handle: undefined } : c));
        try {
          await fetch('/api/connections/telegram/disconnect', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
        } catch {
          // Already reflected optimistically; a stale server-side row is harmless.
        }
        return;
      }
      setIsTelegramConnectOpen(true);
      return;
    }

    // Other platforms don't have a real OAuth integration yet — local toggle only.
    setConnections(prev => prev.map(c => {
      if (c.id === id) {
        return { ...c, connected: !c.connected, lastSynced: 'Just now' };
      }
      return c;
    }));
  };

  const handleRefreshConnections = () => {
    setConnections(prev => prev.map(c => ({ ...c, lastSynced: 'Just now' })));
  };

  const handleSavePost = (newPost: SocialPost) => {
    setPosts(prev => [newPost, ...prev]);
  };

  const handleUpdateMessage = (id: string, replyText: string) => {
    setMessages(prev => prev.map(m => {
      if (m.id === id) {
        return {
          ...m,
          status: 'replied',
          suggestedReplyMyanmar: replyText
        };
      }
      return m;
    }));
  };

  const unreadMessagesCount = messages.filter(m => m.status === 'unread').length;

  if (!user.isLoggedIn) {
    return (
      <>
        <LandingPage
          onGetStarted={() => {
            setAuthMode('register');
            setIsAuthOpen(true);
          }}
          onLogin={() => {
            setAuthMode('login');
            setIsAuthOpen(true);
          }}
        />
        <AuthModal
          isOpen={isAuthOpen}
          onClose={() => setIsAuthOpen(false)}
          onLoginSuccess={handleLoginSuccess}
          initialMode={authMode}
          currentUser={user}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Navbar */}
      <Navbar
        user={user}
        onOpenAuth={(mode = 'login') => {
          setAuthMode(mode);
          setIsAuthOpen(true);
        }}
        onLogout={handleLogout}
        onOpenUpgrade={() => setIsUpgradeOpen(true)}
        onOpenApiKey={() => setIsApiKeyOpen(true)}
      />

      {connectNotice && (
        <div className={`px-4 sm:px-6 py-2.5 text-xs font-bold flex items-center justify-between gap-3 ${
          connectNotice.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-b border-emerald-200' : 'bg-rose-50 text-rose-800 border-b border-rose-200'
        }`}>
          <span className="max-w-7xl w-full mx-auto flex-1">{connectNotice.message}</span>
          <button
            onClick={() => setConnectNotice(null)}
            className="opacity-60 hover:opacity-100 transition-opacity"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col md:flex-row max-w-7xl w-full mx-auto">
        <Sidebar
          currentTab={currentTab}
          onSelectTab={setCurrentTab}
          unreadMessagesCount={unreadMessagesCount}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          {currentTab === 'dashboard' && (
            <DashboardView
              user={user}
              connections={connections}
              posts={posts}
              messages={messages}
              onSelectTab={setCurrentTab}
              onToggleConnection={handleToggleConnection}
              onRefreshConnections={handleRefreshConnections}
            />
          )}

          {currentTab === 'creator' && (
            <ContentCreatorView
              user={user}
              onSavePost={handleSavePost}
            />
          )}

          {currentTab === 'calendar' && (
            <ContentCalendarView
              posts={posts}
              onCreatePost={() => setCurrentTab('creator')}
            />
          )}

          {currentTab === 'messages' && (
            <CustomerReplyView
              user={user}
              messages={messages}
              onUpdateMessage={handleUpdateMessage}
            />
          )}

          {currentTab === 'connections' && (
            <ConnectionsView
              connections={connections}
              onToggleConnection={handleToggleConnection}
              onRefreshAll={handleRefreshConnections}
              onSelectTab={setCurrentTab}
            />
          )}

          {currentTab === 'gmail' && (
            <GmailAIView user={user} onSelectTab={setCurrentTab} />
          )}

          {currentTab === 'tiktok' && (
            <TikTokManagementView
              user={user}
              posts={posts}
              messages={messages}
              onUpdateMessage={handleUpdateMessage}
              onSelectTab={setCurrentTab}
              onDisconnected={fetchRealConnections}
            />
          )}

          {currentTab === 'agents' && (
            <AIAgentsView agents={agents} />
          )}

          {currentTab === 'analytics' && (
            <AnalyticsView />
          )}

          {currentTab === 'settings' && (
            <SettingsView
              user={user}
              onUpdateUser={(u) => {
                setUser(u);
                localStorage.setItem("pinkku_user", JSON.stringify(u));
              }}
              onOpenUpgrade={() => setIsUpgradeOpen(true)}
              onOpenApiKey={() => setIsApiKeyOpen(true)}
              onLogout={handleLogout}
            />
          )}
        </main>
      </div>

      {/* Modals */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onLoginSuccess={handleLoginSuccess}
        initialMode={authMode}
        currentUser={user}
      />

      <UpgradeModal
        isOpen={isUpgradeOpen}
        onClose={() => setIsUpgradeOpen(false)}
        onUpgrade={(plan) => {
          setUser(prev => ({ ...prev, tier: plan as any }));
        }}
      />

      <ApiKeyModal
        isOpen={isApiKeyOpen}
        onClose={() => setIsApiKeyOpen(false)}
        onSaveKey={(key) => {
          console.log("Custom Gemini Key Saved");
        }}
      />

      <TelegramConnectModal
        isOpen={isTelegramConnectOpen}
        onClose={() => setIsTelegramConnectOpen(false)}
        onConnected={(accountName) => {
          setConnectNotice({ type: 'success', message: `Telegram bot ${accountName} connected successfully!` });
          fetchRealConnections();
        }}
      />
    </div>
  );
};

export default App;
