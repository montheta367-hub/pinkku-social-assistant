import React, { useState, useEffect } from 'react';
import { X, Mail, Lock, User, Building, ArrowRight, Check, AlertCircle } from 'lucide-react';
import { UserProfile } from '../types';
import pinkkuIcon from '../assets/pinkku-icon.png';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: UserProfile, isNewUser: boolean) => void;
  initialMode?: 'login' | 'register';
  currentUser: UserProfile;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
  initialMode = 'login',
  currentUser
}) => {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState("E-commerce & Cosmetics");

  const [isLoading, setIsLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const [showGoogleChooser, setShowGoogleChooser] = useState(false);
  const [customGoogleEmail, setCustomGoogleEmail] = useState("");

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setErrorMessage("");
      setSuccessMsg("");
      setShowGoogleChooser(false);
      setCustomGoogleEmail("");
      setName("");
      setEmail(initialMode === "login" && currentUser.isLoggedIn ? currentUser.email : "");
      setPassword("");
      setBusinessName("");
    }
  }, [isOpen, initialMode, currentUser]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage("");

    const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
    const payload = mode === "login" 
      ? { email, password }
      : { name, email, password, businessName, businessType };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        setErrorMessage(data.error || "Authentication failed.");
        setIsLoading(false);
        return;
      }

      setIsLoading(false);

      const isNewUser = mode === "register" && !!data.isNewUser;
      if (isNewUser) {
        setSuccessMsg(
          data.emailSent
            ? `Business account created! We've sent a confirmation to ${email} — you're connected with Pinkku 🌸`
            : "Business account created & connected to your email!"
        );
      } else {
        setSuccessMsg("Successfully signed in!");
      }

      if (data.token) {
        localStorage.setItem("pinkku_token", data.token);
      }

      const cleanEmailPrefix = email.trim().split("@")[0] || "User";
      const defaultUserDisplayName = cleanEmailPrefix.charAt(0).toUpperCase() + cleanEmailPrefix.slice(1);

      const updatedUser: UserProfile = {
        ...currentUser,
        ...(data.user || {}),
        name: data.user?.name || (mode === "register" && name ? name : defaultUserDisplayName),
        email: data.user?.email || email || currentUser.email,
        businessName: data.user?.businessName || (mode === "register" && businessName ? businessName : `${defaultUserDisplayName}'s Workspace`),
        businessType: data.user?.businessType || businessType || currentUser.businessType,
        isLoggedIn: true,
      };

      setTimeout(() => {
        onLoginSuccess(updatedUser, isNewUser);
        onClose();
        setSuccessMsg("");
      }, 900);
    } catch (err: any) {
      console.error("Auth submit error:", err);
      setErrorMessage("Could not connect to backend server. Please try again.");
      setIsLoading(false);
    }
  };

  const performGoogleLogin = async (targetEmail: string) => {
    setIsLoading(true);
    setErrorMessage("");

    const cleanEmail = targetEmail.trim().toLowerCase();
    const cleanEmailPrefix = cleanEmail.split("@")[0] || "User";
    const defaultGoogleName = cleanEmailPrefix.charAt(0).toUpperCase() + cleanEmailPrefix.slice(1).replace(".", " ");

    try {
      const res = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          googleEmail: cleanEmail,
          googleName: (name && mode === "register") ? name : defaultGoogleName,
          googleAvatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(defaultGoogleName)}&background=4285F4&color=fff`,
          businessName: (businessName && mode === "register") ? businessName : `${defaultGoogleName}'s Workspace`
        })
      });

      const data = await res.json();
      setIsLoading(false);

      if (!res.ok || data.error) {
        setErrorMessage(data.error || "Google authentication failed.");
        return;
      }

      setSuccessMsg(
        data.isNewUser && data.emailSent
          ? `✓ Connected with Google (${cleanEmail}) — confirmation email sent!`
          : `✓ Connected with Google Account (${cleanEmail})`
      );

      if (data.token) {
        localStorage.setItem("pinkku_token", data.token);
      }

      const googleUser: UserProfile = {
        ...currentUser,
        ...(data.user || {}),
        name: data.user?.name || defaultGoogleName,
        email: data.user?.email || cleanEmail,
        businessName: data.user?.businessName || `${defaultGoogleName}'s Workspace`,
        isLoggedIn: true,
      };

      setTimeout(() => {
        onLoginSuccess(googleUser, !!data.isNewUser);
        setShowGoogleChooser(false);
        onClose();
        setSuccessMsg("");
      }, 900);
    } catch (err: any) {
      console.error("Google auth error:", err);
      setIsLoading(false);
      setErrorMessage("Could not connect to Google authentication service.");
    }
  };

  const handleGoogleAuth = () => {
    if (email.trim()) {
      performGoogleLogin(email.trim());
    } else {
      setShowGoogleChooser(true);
    }
  };

  // Render Google Account Chooser UI
  if (showGoogleChooser) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/65 backdrop-blur-md p-4 animate-in fade-in">
        <div className="relative w-full max-w-sm bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 shadow-2xl space-y-5 text-slate-800">
          <button
            onClick={() => setShowGoogleChooser(false)}
            className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="text-center space-y-2 pt-1">
            <svg className="w-8 h-8 mx-auto" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            <h3 className="text-lg font-black text-slate-900 tracking-tight">Sign in with Google</h3>
            <p className="text-xs text-slate-500 font-medium">Choose an account to continue to <span className="font-extrabold text-[#FF2D85]">Pinkku</span></p>
          </div>

          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs font-bold flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          <div className="space-y-2.5 pt-1">
            <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-2">
              <label className="block text-[11px] font-extrabold text-slate-700">Continue with your Google email:</label>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={customGoogleEmail}
                  onChange={(e) => setCustomGoogleEmail(e.target.value)}
                  placeholder="your-account@gmail.com"
                  className="flex-1 px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={() => {
                    if (customGoogleEmail.trim()) {
                      performGoogleLogin(customGoogleEmail.trim());
                    }
                  }}
                  disabled={isLoading || !customGoogleEmail.trim()}
                  className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all disabled:opacity-40"
                >
                  Sign in
                </button>
              </div>
            </div>
          </div>

          <div className="pt-2 flex justify-between items-center text-[11px] text-slate-400 border-t border-slate-100">
            <button
              onClick={() => setShowGoogleChooser(false)}
              className="text-slate-500 font-bold hover:text-slate-800 transition-colors"
            >
              ← Back to login
            </button>
            <span className="font-medium text-slate-400">Google OAuth 2.0</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-in fade-in">
      <div className="relative w-full max-w-md bg-white rounded-3xl p-6 sm:p-8 border border-slate-100 shadow-2xl space-y-6">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center space-y-1">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl overflow-hidden shadow-lg shadow-pink-500/25 mb-2">
            <img src={pinkkuIcon} alt="Pinkku" className="w-full h-full object-cover" />
          </div>
          <h3 className="text-2xl font-black text-slate-900 tracking-tight">
            {mode === 'login' ? 'Welcome to Pinkku' : 'Register Your Business'}
          </h3>
          <p className="text-xs text-slate-500 font-medium">
            {mode === 'login' 
              ? 'Connect your Facebook, Instagram, TikTok & Telegram hub'
              : 'Empower your Myanmar business with 24/7 AI assistance'}
          </p>
        </div>

        {/* Google One-Click Login Button */}
        <button
          onClick={handleGoogleAuth}
          disabled={isLoading}
          className="w-full py-3 px-4 rounded-2xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 flex items-center justify-center gap-3 text-xs font-bold text-slate-700 transition-all shadow-sm group"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
          </svg>
          <span>Continue with Google</span>
        </button>

        <div className="relative flex items-center justify-center">
          <div className="border-t border-slate-100 w-full"></div>
          <span className="bg-white px-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">or with email</span>
          <div className="border-t border-slate-100 w-full"></div>
        </div>

        {errorMessage && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs font-bold flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Your Name</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Aye Mon"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-pink-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Business Name</label>
                <div className="relative">
                  <Building className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="e.g. Pinkku Boutique Yangon"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-pink-500"
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-pink-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Password</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-pink-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-pink-500 to-[#FF2D85] text-white font-extrabold text-xs shadow-md shadow-pink-500/20 hover:opacity-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <span>{mode === 'login' ? 'Sign In to Workspace' : 'Create Business Account'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="text-center pt-2">
          {mode === 'login' ? (
            <p className="text-xs text-slate-500 font-medium">
              Don't have a business account yet?{' '}
              <button
                onClick={() => { setMode('register'); setErrorMessage(""); }}
                className="text-[#FF2D85] font-extrabold hover:underline"
              >
                Register Now
              </button>
            </p>
          ) : (
            <p className="text-xs text-slate-500 font-medium">
              Already have an account?{' '}
              <button
                onClick={() => { setMode('login'); setErrorMessage(""); }}
                className="text-[#FF2D85] font-extrabold hover:underline"
              >
                Log In
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
