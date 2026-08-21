import React from 'react';
import {
  Sparkles,
  ArrowRight,
  Wand2,
  Calendar as CalendarIcon,
  MessageCircle,
  Mail as MailIcon,
  Link2,
  Bot,
  ShieldCheck,
} from 'lucide-react';
import { PlatformLogo } from '../components/PlatformLogo';
import { PinkkuWebDiagram } from '../components/PinkkuWebDiagram';
import pinkkuIcon from '../assets/pinkku-icon.png';

interface LandingPageProps {
  onGetStarted: () => void;
  onLogin: () => void;
}

// live: true for channels you can actually connect today. Facebook & Instagram
// are on the roadmap but not live yet, so they're marked "Coming Soon" here
// instead of implying every channel is available right now.
const PLATFORMS = [
  { id: 'gmail', live: true },
  { id: 'tiktok', live: true },
  { id: 'telegram', live: true },
  { id: 'facebook', live: false },
  { id: 'instagram', live: false },
];

export const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted, onLogin }) => {
  return (
    <div className="min-h-screen bg-pink-50 text-slate-900">

      {/* ================= NAV ================= */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-pink-50/80 border-b border-pink-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={pinkkuIcon} alt="Pinkku" className="h-14 w-auto object-contain shrink-0 animate-spider-swing" />
            <span className="text-xl font-black text-slate-900 tracking-tight">Pinkku</span>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-xs font-bold text-slate-600">
            <a href="#solution" className="hover:text-slate-900 transition-colors">Product</a>
            <a href="#how" className="hover:text-slate-900 transition-colors">How it works</a>
            <a href="#preview" className="hover:text-slate-900 transition-colors">Dashboard</a>
            <a href="#features" className="hover:text-slate-900 transition-colors">Features</a>
          </nav>

          <div className="flex items-center gap-3">
            <button
              onClick={onLogin}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 hover:text-slate-900 transition-colors"
            >
              Log In
            </button>
            <button
              onClick={onGetStarted}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-[#FF2D85] text-white font-extrabold text-xs shadow-md shadow-pink-500/25 hover:opacity-95 transition-all flex items-center gap-2"
            >
              <span>Get Started</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* ================= HERO ================= */}
      <section className="relative overflow-hidden bg-gradient-to-b from-pink-50/70 via-white to-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-14 pb-6 text-center space-y-7 relative z-10">
          <h1 className="text-4xl sm:text-6xl font-black text-slate-900 tracking-tight max-w-4xl mx-auto leading-[1.12]">
            All your business channels.
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-[#FF2D85]">
              One smart assistant.
            </span>
          </h1>

          <p className="text-base sm:text-lg text-slate-600 font-medium max-w-2xl mx-auto leading-relaxed">
            Connect Facebook, Instagram, TikTok, Telegram & Gmail, create content with AI, automate customer
            replies, and see exactly what needs your attention today.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 pt-1">
            <button
              onClick={onGetStarted}
              className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-gradient-to-r from-pink-500 to-[#FF2D85] text-white font-black text-sm shadow-xl shadow-pink-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3"
            >
              <span>Get Started Free</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <a
              href="#how"
              className="w-full sm:w-auto px-6 py-4 rounded-2xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-sm shadow-sm transition-all flex items-center justify-center gap-2"
            >
              <span>See How It Works</span>
            </a>
          </div>
        </div>
      </section>

      {/* ================= PROBLEM ================= */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-20">
        <div className="text-center max-w-xl mx-auto space-y-3 mb-14">
          <span className="text-[11px] font-black uppercase tracking-widest text-[#FF2D85]">The problem</span>
          <h2 className="text-2xl sm:text-4xl font-black text-slate-900">Stop switching between apps.</h2>
          <p className="text-sm sm:text-base text-slate-500 font-medium">
            Every day, business owners jump between five apps just to keep up — and most of that time is spent
            repeating the same small tasks.
          </p>
        </div>

        <div className="relative max-w-3xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-4 mb-12">
          {[
            { p: 'facebook', title: 'Facebook', text: '12 new comments waiting', rotate: '-rotate-1' },
            { p: 'instagram', title: 'Instagram', text: 'DM: "ဈေးနှုန်း ပြောပြပါ"', rotate: 'rotate-1' },
            { p: 'tiktok', title: 'TikTok', text: 'Video reached 8.2K views', rotate: 'rotate-1' },
            { p: 'telegram', title: 'Telegram', text: 'New order inquiry', rotate: '-rotate-1' },
            { p: 'gmail', title: 'Gmail', text: '🔴 Payment failed — action required', rotate: '-rotate-1', urgent: true },
            { p: 'facebook', title: 'Facebook', text: 'Post scheduled for 6PM', rotate: 'rotate-1' },
          ].map((c, i) => (
            <div
              key={i}
              className={`bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 flex items-start gap-3 transform ${c.rotate} hover:rotate-0 transition-transform`}
            >
              <div className="w-9 h-9 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center flex-shrink-0">
                <PlatformLogo platform={c.p} className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-black text-slate-900">{c.title}</p>
                <p className={`text-xs font-medium mt-0.5 ${c.urgent ? 'text-red-600 font-bold' : 'text-slate-500'}`}>
                  {c.text}
                </p>
              </div>
            </div>
          ))}
        </div>

        <p className="text-center font-black text-lg sm:text-xl text-slate-900 max-w-xl mx-auto">
          <span className="line-through decoration-pink-400 decoration-2 text-slate-400">
            Too many apps. Too many messages.
          </span>{' '}
          Too much repetitive work.
        </p>
      </section>

      {/* ================= SOLUTION ================= */}
      <section id="solution" className="bg-gradient-to-b from-white via-pink-50/60 to-white py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center space-y-3 mb-8">
          <span className="text-[11px] font-black uppercase tracking-widest text-[#FF2D85]">The solution</span>
          <h2 className="text-2xl sm:text-4xl font-black text-slate-900">Meet Pinkku. 🕷️</h2>
          <p className="text-sm sm:text-base text-slate-500 font-medium max-w-xl mx-auto">
            Pinkku brings your social media and important business communication into one intelligent
            workspace — organized around a single, central hub.
          </p>
        </div>
        <div className="max-w-sm mx-auto px-6">
          <PinkkuWebDiagram variant="mini" className="w-full h-auto" />
        </div>
      </section>

      {/* ================= HOW IT WORKS ================= */}
      <section id="how" className="max-w-6xl mx-auto px-4 sm:px-6 py-20">
        <div className="text-center max-w-xl mx-auto space-y-3 mb-14">
          <span className="text-[11px] font-black uppercase tracking-widest text-[#FF2D85]">How it works</span>
          <h2 className="text-2xl sm:text-4xl font-black text-slate-900">Four steps to a calmer workday.</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
          {[
            { n: '01', title: 'Connect', icon: Link2, color: 'text-blue-600 bg-blue-100', cardBg: 'bg-blue-50/60 border-blue-100 hover:border-blue-200', text: "Link your social media and Gmail to Pinkku's central workspace in a few clicks." },
            { n: '02', title: 'Create', icon: Wand2, color: 'text-[#FF2D85] bg-pink-100', cardBg: 'bg-pink-50/60 border-pink-100 hover:border-pink-200', text: 'Generate Myanmar & English captions, hashtags, and content ideas with AI.' },
            { n: '03', title: 'Automate', icon: Bot, color: 'text-emerald-600 bg-emerald-100', cardBg: 'bg-emerald-50/60 border-emerald-100 hover:border-emerald-200', text: 'Draft customer replies and handle repetitive tasks — you approve every send.' },
            { n: '04', title: 'Understand', icon: ShieldCheck, color: 'text-amber-600 bg-amber-100', cardBg: 'bg-amber-50/60 border-amber-100 hover:border-amber-200', text: 'AI flags urgent messages and surfaces the insights that actually matter.' },
          ].map((s) => (
            <div key={s.n} className={`rounded-3xl p-6 border shadow-sm hover:shadow-md transition-all ${s.cardBg}`}>
              <span className="text-[11px] font-black text-[#FF2D85] tracking-widest">{s.n}</span>
              <div className={`w-11 h-11 rounded-xl ${s.color} flex items-center justify-center my-3`}>
                <s.icon className="w-5 h-5" />
              </div>
              <h3 className="text-base font-black text-slate-900 mb-1.5">{s.title}</h3>
              <p className="text-xs text-slate-500 font-medium leading-relaxed">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ================= PRODUCT PREVIEW ================= */}
      <section id="preview" className="bg-pink-50/70 py-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-xl mx-auto space-y-3 mb-12">
            <span className="text-[11px] font-black uppercase tracking-widest text-[#FF2D85]">Inside Pinkku</span>
            <h2 className="text-2xl sm:text-4xl font-black text-slate-900">Your channels, at a glance.</h2>
            <p className="text-sm sm:text-base text-slate-500 font-medium">
              A single dashboard shows every connection status — no more digging through five different apps.
            </p>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/50 overflow-hidden">
            <div className="flex items-center gap-1.5 px-5 py-3 bg-slate-50 border-b border-slate-200">
              <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            </div>
            <div className="p-6 sm:p-8">
              <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
                <div>
                  <h3 className="text-sm font-black text-slate-900">Connected Channels</h3>
                  <p className="text-xs text-slate-400 font-medium">Gmail, TikTok &amp; Telegram ready today — more channels added regularly</p>
                </div>
                <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded-full bg-pink-100 text-[#FF2D85]">Demo Preview</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {PLATFORMS.map((p) => (
                  <div key={p.id} className="rounded-2xl p-4 border border-slate-200 bg-white flex flex-col justify-between gap-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                          <PlatformLogo platform={p.id} className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-xs font-black text-slate-900 capitalize">{p.id}</p>
                          <p className="text-[10px] text-slate-400 font-bold">{p.live ? '0 followers' : 'On the roadmap'}</p>
                        </div>
                      </div>
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${p.live ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                        {p.live ? 'LIVE' : 'COMING SOON'}
                      </span>
                    </div>
                    <button
                      disabled={!p.live}
                      className={`w-full py-2 rounded-xl text-xs font-bold transition-all ${p.live ? 'bg-gradient-to-r from-pink-500 to-[#FF2D85] text-white' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                    >
                      {p.live ? '+ Connect' : 'Coming Soon'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================= FEATURES ================= */}
      <section id="features" className="max-w-6xl mx-auto px-4 sm:px-6 py-20">
        <div className="text-center space-y-2 mb-12">
          <span className="text-[11px] font-black uppercase tracking-widest text-[#FF2D85]">Core features</span>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900">Everything the busy owner actually needs</h2>
          <p className="text-xs sm:text-sm text-slate-500 font-medium">No bloated enterprise tools — just the essentials, done well.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { icon: Wand2, bg: 'bg-pink-100 text-[#FF2D85]', title: 'AI Content Creator', text: 'Generate Myanmar & English captions, hashtags, and posting-time suggestions instantly.' },
            { icon: CalendarIcon, bg: 'bg-blue-100 text-blue-600', title: 'Content Calendar', text: 'Plan, schedule, and track posts across platforms with clear statuses.' },
            { icon: MessageCircle, bg: 'bg-emerald-100 text-emerald-600', title: 'AI Customer Reply', text: 'Answer customer questions instantly using your product & FAQ knowledge base.' },
            { icon: MailIcon, bg: 'bg-orange-100 text-orange-600', title: 'Gmail Priority Detection', text: 'AI flags urgent, customer, and business emails so nothing gets buried.' },
          ].map((f) => (
            <div key={f.title} className="bg-white rounded-3xl p-7 border border-slate-200/80 shadow-sm space-y-4 hover:shadow-md transition-shadow">
              <div className={`w-12 h-12 rounded-2xl ${f.bg} flex items-center justify-center`}>
                <f.icon className="w-5 h-5" />
              </div>
              <h3 className="text-base font-black text-slate-900">{f.title}</h3>
              <p className="text-xs text-slate-500 font-medium leading-relaxed">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ================= CTA BAND ================= */}
      <section className="mx-4 sm:mx-6 mb-20">
        <div className="max-w-6xl mx-auto rounded-[2.5rem] bg-gradient-to-br from-pink-500 via-[#FF2D85] to-fuchsia-600 px-8 py-16 sm:py-20 text-center relative overflow-hidden">
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '22px 22px' }} />
          <div className="relative z-10 space-y-6">
            <span className="text-[11px] font-black uppercase tracking-widest text-pink-100">
              Create Once · Connect Everywhere · Grow Smarter
            </span>
            <h2 className="text-2xl sm:text-4xl font-black text-white max-w-2xl mx-auto leading-tight">
              Bring every channel into one calm workspace.
            </h2>
            <p className="text-sm sm:text-base text-pink-50 font-medium max-w-md mx-auto">
              Free to start. No credit card required. Connect your first channel in under two minutes.
            </p>
            <button
              onClick={onGetStarted}
              className="px-8 py-4 rounded-2xl bg-white text-[#FF2D85] font-black text-sm shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all inline-flex items-center gap-2"
            >
              <span>Get Started Free</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* ================= FOOTER ================= */}
      <footer className="border-t border-slate-200 bg-white py-10 px-4">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div>
            <div className="flex items-center gap-2 justify-center sm:justify-start">
              <img src={pinkkuIcon} alt="" className="w-6 h-6 rounded-full object-cover" />
              <span className="font-black text-slate-900">Pinkku</span>
            </div>
            <p className="text-xs text-slate-400 font-medium mt-1">ပင့်ကူ — connecting every thread of your business.</p>
          </div>
          <p className="text-xs text-slate-500 font-medium">© 2026 Pinkku Social Assistant. Made for Myanmar businesses.</p>
        </div>
      </footer>

    </div>
  );
};
