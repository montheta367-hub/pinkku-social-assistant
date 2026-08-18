import React, { useState } from 'react';
import { UserProfile } from '../types';
import { Settings, User, Building, Mail, ShieldCheck, Key, LogOut, Check, Sparkles } from 'lucide-react';

interface SettingsViewProps {
  user: UserProfile;
  onUpdateUser: (updated: UserProfile) => void;
  onOpenUpgrade: () => void;
  onOpenApiKey: () => void;
  onLogout: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  user,
  onUpdateUser,
  onOpenUpgrade,
  onOpenApiKey,
  onLogout
}) => {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [businessName, setBusinessName] = useState(user.businessName);
  const [businessType, setBusinessType] = useState(user.businessType);
  const [saved, setSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateUser({
      ...user,
      name,
      email,
      businessName,
      businessType
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      
      {/* Header */}
      <div className="flex items-center gap-2">
        <Settings className="w-6 h-6 text-[#FF2D85]" />
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">
          Workspace Settings & Profile
        </h1>
      </div>

      {saved && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs font-bold flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600" />
          <span>✓ Profile & Workspace details saved successfully!</span>
        </div>
      )}

      {/* Account Profile Card */}
      <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/80 shadow-sm space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-pink-500 to-[#FF2D85] text-white font-black text-base flex items-center justify-center shadow-md shadow-pink-500/20">
              {user.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900">{user.name}</h2>
              <p className="text-xs text-slate-500 font-medium">{user.email}</p>
            </div>
          </div>

          <span className="text-xs font-black px-3 py-1 rounded-full bg-pink-100 text-[#FF2D85] border border-pink-200 uppercase">
            {user.tier || 'Pro'} Plan
          </span>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Your Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-pink-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Email / Google Account</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-pink-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Business / Brand Name</label>
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-pink-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Business Industry</label>
              <input
                type="text"
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value)}
                className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-pink-500"
              />
            </div>
          </div>

          <div className="pt-3 flex justify-end">
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs shadow-sm transition-all"
            >
              Save Profile Changes
            </button>
          </div>
        </form>
      </div>

      {/* Integration & Subscription actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        
        <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm space-y-3">
          <div className="flex items-center gap-2 text-slate-900 font-black text-sm">
            <Key className="w-4 h-4 text-amber-500" />
            <span>AI Model & API Config</span>
          </div>
          <p className="text-xs text-slate-500 font-medium">
            Configure custom Google Gemini API Key for zero quota limits.
          </p>
          <button
            onClick={onOpenApiKey}
            className="w-full py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 font-bold text-xs text-slate-700 transition-all"
          >
            Configure API Key
          </button>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm space-y-3">
          <div className="flex items-center gap-2 text-slate-900 font-black text-sm">
            <Sparkles className="w-4 h-4 text-[#FF2D85]" />
            <span>Subscription & Billing</span>
          </div>
          <p className="text-xs text-slate-500 font-medium">
            Upgrade with KPay / Wave Money for full automated customer replies.
          </p>
          <button
            onClick={onOpenUpgrade}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-[#FF2D85] text-white font-extrabold text-xs shadow-sm transition-all"
          >
            Manage Subscription
          </button>
        </div>

      </div>

    </div>
  );
};
