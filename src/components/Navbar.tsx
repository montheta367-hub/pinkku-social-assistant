import React from 'react';
import { UserProfile } from '../types';
import { Sparkles, Key, LogIn, LogOut, Bell, ShieldCheck } from 'lucide-react';
import pinkkuIcon from '../assets/pinkku-icon.png';

interface NavbarProps {
  user: UserProfile;
  onOpenAuth: (mode?: 'login' | 'register') => void;
  onLogout: () => void;
  onOpenUpgrade: () => void;
  onOpenApiKey: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  onOpenAuth,
  onLogout,
  onOpenUpgrade,
  onOpenApiKey
}) => {
  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-6 py-3">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        
        {/* Brand Logo */}
        <div className="flex items-center gap-3">
          <img src={pinkkuIcon} alt="Pinkku" className="h-14 w-auto object-contain shrink-0 animate-spider-swing" />
          <span className="text-xl font-black text-slate-900 tracking-tight">Pinkku</span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          
          {/* Custom API Key Button */}
          <button
            onClick={onOpenApiKey}
            title="Configure Gemini API Key"
            className="p-2 sm:px-3 sm:py-1.5 rounded-xl border border-slate-200 hover:border-amber-400 hover:bg-amber-50 text-slate-600 hover:text-amber-700 text-xs font-bold transition-all flex items-center gap-1.5"
          >
            <Key className="w-3.5 h-3.5 text-amber-500" />
            <span className="hidden sm:inline">API Key</span>
          </button>

          {/* Upgrade / Pro Badge */}
          <button
            onClick={onOpenUpgrade}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-pink-500 to-[#FF2D85] text-white font-extrabold text-xs shadow-md shadow-pink-500/20 hover:opacity-95 transition-all flex items-center gap-1.5 animate-pulse"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Upgrade Pro</span>
            <span className="sm:hidden">Pro</span>
          </button>

          {/* User Status / Login */}
          {user.isLoggedIn ? (
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-slate-900 text-white font-black text-xs flex items-center justify-center shadow-sm">
                  {user.name ? user.name.slice(0, 2).toUpperCase() : 'AM'}
                </div>
                <div className="text-left hidden md:block">
                  <div className="text-xs font-black text-slate-800 flex items-center gap-1">
                    <span>{user.name}</span>
                    <ShieldCheck className="w-3 h-3 text-pink-600" />
                  </div>
                  <div className="text-[10px] text-slate-400 font-medium truncate max-w-[140px]">
                    {user.businessName || user.email}
                  </div>
                </div>
              </div>

              <button
                onClick={onLogout}
                title="Log Out"
                className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => onOpenAuth('login')}
              className="px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs transition-all flex items-center gap-1.5"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Log In</span>
            </button>
          )}

        </div>
      </div>
    </header>
  );
};
