import React, { useState, useEffect, useRef } from 'react';
import { X, Mail, Lock, User, Building, ArrowRight, Check, AlertCircle } from 'lucide-react';
import { UserProfile } from '../types';
import pinkkuIcon from '../assets/pinkku-icon.png';

// Minimal shape of the Google Identity Services API we use — loaded via the
// <script src="https://accounts.google.com/gsi/client"> tag in index.html.
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: { client_id: string; callback: (response: { credential?: string }) => void }) => void;
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

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

  const googleButtonRef = useRef<HTMLDivElement>(null);
  const [googleReady, setGoogleReady] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setErrorMessage("");
      setSuccessMsg("");
      setName("");
      setEmail(initialMode === "login" && currentUser.isLoggedIn ? currentUser.email : "");
      setPassword("");
      setBusinessName("");
    }
  }, [isOpen, initialMode, currentUser]);

  // The GSI script tag loads async, so poll briefly until window.google shows up.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    let attempts = 0;
    const tryDetect = () => {
      if (cancelled) return;
      if (window.google?.accounts?.id) {
        setGoogleReady(true);
        return;
      }
      attempts += 1;
      if (attempts < 50) setTimeout(tryDetect, 100);
    };
    tryDetect();
    return () => { cancelled = true; };
  }, [isOpen]);

  // Real "Sign in with Google": renders Google's own button and hands us a
  // signed ID token in the callback — never a plain email we'd have to trust.
  // Always labeled "Sign in" (never "Sign up") because the backend only ever
  // logs an existing account in with it — it never creates a new one.
  useEffect(() => {
    if (!googleReady || !googleButtonRef.current || !window.google) return;
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
    if (!clientId) {
      console.error("VITE_GOOGLE_CLIENT_ID is not set — Google sign-in is disabled.");
      return;
    }
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: handleGoogleCredentialResponse,
    });
    googleButtonRef.current.innerHTML = "";
    window.google.accounts.id.renderButton(googleButtonRef.current, {
      theme: "outline",
      size: "large",
      shape: "pill",
      width: 360,
      text: "signin_with",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleReady]);

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

  // Called by Google's own button with a signed ID token — the backend
  // verifies it against Google before trusting the email inside it.
  async function handleGoogleCredentialResponse(response: { credential?: string }) {
    if (!response.credential) {
      setErrorMessage("Google sign-in did not return a credential.");
      return;
    }
    setIsLoading(true);
    setErrorMessage("");

    try {
      const res = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: response.credential }),
      });

      const data = await res.json();
      setIsLoading(false);

      if (!res.ok || data.error) {
        setErrorMessage(data.error || "Google authentication failed.");
        return;
      }

      setSuccessMsg("✓ Connected with Google Account");

      if (data.token) {
        localStorage.setItem("pinkku_token", data.token);
      }

      const googleUser: UserProfile = {
        ...currentUser,
        ...(data.user || {}),
        isLoggedIn: true,
      };

      setTimeout(() => {
        onLoginSuccess(googleUser, !!data.isNewUser);
        onClose();
        setSuccessMsg("");
      }, 900);
    } catch (err: any) {
      console.error("Google auth error:", err);
      setIsLoading(false);
      setErrorMessage("Could not connect to Google authentication service.");
    }
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

        {/* Real Google Identity Services button — Google renders this itself,
            so there is no way for a client to fake the account it signs in as.
            Existing accounts only; it never creates a new one. */}
        <div className="space-y-1.5">
          <div className="flex justify-center min-h-[44px]">
            <div ref={googleButtonRef} />
            {!googleReady && (
              <div className="w-full py-3 px-4 rounded-2xl border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-400">
                Loading Google Sign-In…
              </div>
            )}
          </div>
          <p className="text-center text-[11px] text-slate-400 font-medium">
            For accounts already registered with this Google email.
          </p>
        </div>

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
