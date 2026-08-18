import React from 'react';
import { PlatformConnection } from '../types';
import { SpiderConnectionHub } from '../components/SpiderConnectionHub';
import { TabType } from '../components/Sidebar';
import { Share2, ShieldCheck, Zap, Lock, RefreshCw } from 'lucide-react';

interface ConnectionsViewProps {
  connections: PlatformConnection[];
  onToggleConnection: (id: string) => void;
  onRefreshAll: () => void;
  onSelectTab: (tab: TabType) => void;
}

export const ConnectionsView: React.FC<ConnectionsViewProps> = ({
  connections,
  onToggleConnection,
  onRefreshAll,
  onSelectTab
}) => {
  return (
    <div className="space-y-7 max-w-6xl mx-auto pb-12">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Share2 className="w-6 h-6 text-[#FF2D85]" />
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Cross-Platform Channel Integration
            </h1>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Connect and manage API credentials for Facebook Graph API, TikTok for Business, Telegram Bot and Google Workspace.
          </p>
        </div>
      </div>

      <SpiderConnectionHub
        connections={connections}
        onToggleConnect={onToggleConnection}
        onRefreshAll={onRefreshAll}
        managedPlatforms={['gmail', 'tiktok']}
        onManage={(id) => onSelectTab(id as TabType)}
      />

      {/* Security & Sync Details */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm space-y-2">
          <div className="flex items-center gap-2 text-emerald-600 font-black text-xs">
            <ShieldCheck className="w-4 h-4" />
            <span>Encrypted Tokens</span>
          </div>
          <p className="text-xs text-slate-600 font-medium leading-relaxed">
            All OAuth tokens for Facebook & Google are encrypted and kept safe with zero third-party disclosure.
          </p>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm space-y-2">
          <div className="flex items-center gap-2 text-blue-600 font-black text-xs">
            <Zap className="w-4 h-4" />
            <span>Instant Webhooks</span>
          </div>
          <p className="text-xs text-slate-600 font-medium leading-relaxed">
            Incoming DMs from Facebook Messenger, Telegram and TikTok are delivered within 500ms to your Pinkku Hub.
          </p>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm space-y-2">
          <div className="flex items-center gap-2 text-pink-600 font-black text-xs">
            <Share2 className="w-4 h-4" />
            <span>Multi-Channel Broadcast</span>
          </div>
          <p className="text-xs text-slate-600 font-medium leading-relaxed">
            Publish single or carousel posts to all 4 platforms simultaneously with one single click.
          </p>
        </div>

      </div>

    </div>
  );
};
