import React from 'react';
import { X, Check, Sparkles, Zap, ShieldCheck } from 'lucide-react';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpgrade: (plan: string) => void;
}

export const UpgradeModal: React.FC<UpgradeModalProps> = ({ isOpen, onClose, onUpgrade }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-in fade-in">
      <div className="relative w-full max-w-2xl bg-white rounded-3xl p-6 sm:p-8 border border-slate-100 shadow-2xl space-y-6">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-pink-100 text-[#FF2D85] text-xs font-black">
            <Sparkles className="w-3.5 h-3.5" />
            <span>PINKKU PRO PLANS FOR MYANMAR</span>
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Scale Your Online Store with 24/7 AI Automation</h2>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Unlimited AI generated posts in Burmese, auto-order reply on Facebook Messenger, TikTok DM & Telegram bots.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          {/* Pro Monthly */}
          <div className="rounded-2xl border-2 border-pink-500 bg-pink-50/30 p-5 space-y-4 relative flex flex-col justify-between">
            <div className="absolute -top-3 right-4 bg-[#FF2D85] text-white text-[10px] font-black px-3 py-0.5 rounded-full uppercase tracking-wider shadow-sm">
              Most Popular
            </div>
            <div className="space-y-2">
              <h3 className="font-black text-slate-900 text-base flex items-center gap-2">
                <span>Pinkku Pro</span>
                <Zap className="w-4 h-4 text-amber-500 fill-amber-500" />
              </h3>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black text-slate-900">15,000</span>
                <span className="text-xs font-bold text-slate-500">MMK / month</span>
              </div>
              <ul className="space-y-2 pt-2 text-xs text-slate-700 font-medium">
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Postings — draft & review workflow, then approve and schedule</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Automated replies</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Performance tracking</span>
                </li>
              </ul>
            </div>
            <button
              onClick={() => { onUpgrade("pro"); onClose(); }}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-[#FF2D85] text-white font-extrabold text-xs shadow-md shadow-pink-500/20 hover:opacity-95 transition-all"
            >
              Upgrade with KPay / WavePay
            </button>
          </div>

          {/* Business Yearly */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 flex flex-col justify-between">
            <div className="space-y-2">
              <h3 className="font-black text-slate-900 text-base flex items-center gap-2">
                <span>Pinkku Enterprise</span>
                <ShieldCheck className="w-4 h-4 text-blue-600" />
              </h3>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black text-slate-900">Custom Pricing</span>
              </div>
              <ul className="space-y-2 pt-2 text-xs text-slate-700 font-medium">
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Everything in Pro Plan</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Multi-staff account management (up to 10 staff)</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Dedicated Myanmar Account Manager</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Custom AI fine-tuning for your brand tone</span>
                </li>
              </ul>
            </div>
            <button
              onClick={() => { onUpgrade("enterprise"); onClose(); }}
              className="w-full py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-800 font-extrabold text-xs transition-all"
            >
              Contact Sales Team
            </button>
          </div>
        </div>

        <p className="text-center text-[11px] text-slate-400 font-medium">
          Instant activation via KBZPay, CB Pay, AYA Pay & Wave Money. 7-day money back guarantee.
        </p>
      </div>
    </div>
  );
};
