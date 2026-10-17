import React, { useState } from 'react';
import { X, Check, Sparkles } from 'lucide-react';
import { PLAN_TIERS } from '../planTiers';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpgrade: (plan: string) => void;
}

export const UpgradeModal: React.FC<UpgradeModalProps> = ({ isOpen, onClose, onUpgrade }) => {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 overflow-y-auto">
      <div className="relative w-full max-w-5xl bg-white rounded-3xl p-6 sm:p-8 border border-slate-100 shadow-2xl space-y-6 my-8">
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

        <div className="flex justify-center">
          <div className="inline-flex items-center gap-1 p-1 rounded-2xl bg-slate-100">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                billingCycle === 'monthly' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle('yearly')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                billingCycle === 'yearly' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <span>Yearly</span>
              <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Save 15%</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {PLAN_TIERS.map((plan) => {
            const price = billingCycle === 'yearly' ? Math.round(plan.priceMonthly * 0.85) : plan.priceMonthly;
            return (
              <div
                key={plan.name}
                className={`rounded-2xl border bg-white flex flex-col ${plan.popular ? 'border-[#FF2D85] ring-2 ring-pink-500/20' : 'border-slate-200'}`}
              >
                {plan.popular && (
                  <div className="py-1.5 text-center text-[10px] font-black uppercase tracking-wider text-white bg-gradient-to-r from-pink-500 to-[#FF2D85] rounded-t-2xl">
                    Most Popular
                  </div>
                )}
                <div className="p-5 flex flex-col flex-1">
                  <h3 className="font-black text-slate-900 text-base">{plan.name}</h3>
                  <p className="text-[11px] text-slate-500 font-medium mt-0.5">{plan.tagline}</p>

                  <div className="flex items-baseline gap-1 mt-3">
                    <span className="text-xl font-black text-slate-900">{price.toLocaleString()}</span>
                    <span className="text-[10px] font-bold text-slate-500">MMK/mo</span>
                  </div>
                  <p className="text-[10px] font-bold text-slate-400 mt-0.5">{plan.users}</p>

                  <ul className="space-y-1.5 pt-3 mt-3 border-t border-slate-100 text-[11px] text-slate-700 font-medium flex-1">
                    {plan.included.map((f) => (
                      <li key={f} className="flex items-center gap-1.5">
                        <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                        <span>{f}</span>
                      </li>
                    ))}
                    {plan.excluded.map((f) => (
                      <li key={f} className="flex items-center gap-1.5 text-slate-400">
                        <X className="w-3 h-3 shrink-0" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={() => { onUpgrade(plan.name.toLowerCase()); onClose(); }}
                    className={`w-full py-2.5 rounded-xl font-extrabold text-xs mt-4 transition-all ${
                      plan.popular
                        ? 'bg-gradient-to-r from-pink-500 to-[#FF2D85] text-white shadow-md shadow-pink-500/20 hover:opacity-95'
                        : 'border border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    Choose {plan.name}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-center text-[11px] text-slate-400 font-medium">
          Instant activation via KBZPay, CB Pay, AYA Pay & Wave Money. 7-day money back guarantee.
        </p>
      </div>
    </div>
  );
};
