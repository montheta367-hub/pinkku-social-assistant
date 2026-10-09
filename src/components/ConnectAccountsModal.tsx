import React from 'react';
import { PlatformConnection } from '../types';
import { TabType } from './Sidebar';
import { SpiderConnectionHub } from './SpiderConnectionHub';
import { X, ShieldCheck, Zap, Share2 } from 'lucide-react';

interface ConnectAccountsModalProps {
  isOpen: boolean;
  onClose: () => void;
  connections: PlatformConnection[];
  onToggleConnection: (id: string) => void;
  onRefreshAll: () => void;
  onSelectTab: (tab: TabType) => void;
}

export const ConnectAccountsModal: React.FC<ConnectAccountsModalProps> = ({
  isOpen,
  onClose,
  connections,
  onToggleConnection,
  onRefreshAll,
  onSelectTab,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 overflow-y-auto animate-in fade-in">
      <div className="relative w-full max-w-4xl my-8 sm:my-0">
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 z-10 p-2 rounded-full bg-white shadow-lg border border-slate-200 text-slate-500 hover:text-slate-700 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <SpiderConnectionHub
          connections={connections}
          onToggleConnect={(id) => {
            onToggleConnection(id);
            // Telegram connects via its own in-app modal rather than an OAuth
            // redirect — close this one first so that modal isn't hidden behind it.
            if (id === 'telegram') onClose();
          }}
          onRefreshAll={onRefreshAll}
          managedPlatforms={['gmail', 'tiktok']}
          onManage={(id) => {
            onSelectTab(id as TabType);
            onClose();
          }}
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm space-y-1.5">
            <div className="flex items-center gap-2 text-emerald-600 font-black text-xs">
              <ShieldCheck className="w-4 h-4" />
              <span>Encrypted Tokens</span>
            </div>
            <p className="text-[11px] text-slate-600 font-medium leading-relaxed">
              OAuth tokens for Facebook & Google are encrypted, with zero third-party disclosure.
            </p>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm space-y-1.5">
            <div className="flex items-center gap-2 text-blue-600 font-black text-xs">
              <Zap className="w-4 h-4" />
              <span>Instant Webhooks</span>
            </div>
            <p className="text-[11px] text-slate-600 font-medium leading-relaxed">
              Incoming DMs from Messenger, Telegram and TikTok land in Engage within seconds.
            </p>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm space-y-1.5">
            <div className="flex items-center gap-2 text-pink-600 font-black text-xs">
              <Share2 className="w-4 h-4" />
              <span>Multi-Channel Broadcast</span>
            </div>
            <p className="text-[11px] text-slate-600 font-medium leading-relaxed">
              Publish to every connected platform at once from the Publish tab.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
