"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBolt,
  faEye,
  faEyeSlash,
  faShieldAlt,
  faArrowRight,
  faCheckCircle
} from "@fortawesome/free-solid-svg-icons";
import BrandSpinner from "@/components/BrandSpinner";
import { useAuthStore } from "@/stores/useAuthStore";
import { useUsersStore } from "@/stores/useUsersStore";

const DanabLogo = () => (
  <div className="flex flex-col items-center">
    <div className="flex items-center gap-1">
      <span className="text-5xl font-black text-[#7C3AED] tracking-tighter">DA</span>
      <div className="text-[#10B981] drop-shadow-[0_0_10px_rgba(16,185,129,0.5)]">
        <FontAwesomeIcon icon={faBolt} className="text-4xl" />
      </div>
      <span className="text-5xl font-black text-[#7C3AED] tracking-tighter">AB</span>
    </div>
    <div className="text-[#10B981] text-[10px] font-bold uppercase tracking-[0.3em] mt-[-5px] ml-1">
      Powerbank Rental
    </div>
  </div>
);

export default function LoginPage() {
  const router = useRouter();
  const { user, login } = useAuthStore();
  const {
    loginUser,
    resendLoginOtp,
    verifyLoginOtp,
    loading,
    error,
    success,
    clearMessages,
  } = useUsersStore();

  const [form, setForm] = useState({ username: "", password: "" });
  const [otpForm, setOtpForm] = useState({ otp: "" });
  const [otpStep, setOtpStep] = useState<{
    challengeId: string;
    email: string;
    otpExpiresAt: number;
    resendAvailableAt: number;
  } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    return () => {
      clearMessages();
    };
  }, [clearMessages]);

  useEffect(() => {
    if (user) {
      const userRole = user.role;
      if (userRole === "user") {
        router.replace("/slots");
      } else if (userRole === "moderator" || userRole === "admin") {
        router.replace("/dashboard");
      } else {
        router.replace("/slots");
      }
    }
  }, [user, router]);

  useEffect(() => {
    if (!otpStep) return;

    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, [otpStep]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleOtpChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digitsOnly = e.target.value.replace(/\D/g, "").slice(0, 6);
    setOtpForm({ otp: digitsOnly });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    clearMessages();
    try {
      const result = await loginUser(form);
      if (result.kind === "direct") {
        login(result.user as any, result.token, result.expiresAt as any);
        return;
      }
      setOtpStep(result.challenge);
      setOtpForm({ otp: "" });
    } catch (err) {
      // Error is handled by the store
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpStep || loading) return;
    clearMessages();
    try {
      const result = await verifyLoginOtp({
        challengeId: otpStep.challengeId,
        otp: otpForm.otp,
      });
      login(result.user as any, result.token, result.expiresAt);
    } catch (err) {
      // Error is handled by the store
    }
  };

  const resetLoginFlow = () => {
    setOtpStep(null);
    setOtpForm({ otp: "" });
    clearMessages();
  };

  const handleResendOtp = async () => {
    if (!otpStep || loading || resendSecondsRemaining > 0) return;
    clearMessages();
    try {
      const nextChallenge = await resendLoginOtp({
        challengeId: otpStep.challengeId,
      });
      setOtpStep(nextChallenge);
      setOtpForm({ otp: "" });
      setNow(Date.now());
    } catch (err) {
      // Error is handled by the store
    }
  };

  const resendSecondsRemaining = otpStep
    ? Math.max(0, Math.ceil((otpStep.resendAvailableAt - now) / 1000))
    : 0;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0B0F1A] relative overflow-hidden font-sans">
      {/* Dynamic Background Pattern */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-purple-900/10 via-transparent to-transparent opacity-50" />
        <svg width="100%" height="100%" className="h-full w-full opacity-[0.03]">
          <defs>
            <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
              <path d="M 60 0 L 0 0 0 60" fill="none" stroke="white" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      {/* Logo Section */}
      <div className="relative z-10 mb-10">
        <DanabLogo />
      </div>

      {/* Main Login Card */}
      <div className="relative z-10 w-full max-w-[440px] px-6">
        <div className="bg-[#161B26]/60 backdrop-blur-2xl border border-white/5 rounded-3xl shadow-2xl p-8 sm:p-10">

          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold text-white tracking-tight">Welcome back</h2>
            <p className="text-gray-400 text-sm mt-2">Please enter your credentials to continue.</p>
          </div>

          {success && (
            <div className="mb-6 flex items-center gap-3 text-[#10B981] bg-[#10B981]/10 border border-[#10B981]/20 rounded-xl px-4 py-3 text-sm font-medium">
              <FontAwesomeIcon icon={faCheckCircle} />
              {success}
            </div>
          )}

          {error && (
            <div className="mb-6 flex items-center gap-3 text-red-400 bg-red-400/10 border border-red-400/20 rounded-xl px-4 py-3 text-sm font-medium">
              <FontAwesomeIcon icon={faShieldAlt} />
              {error}
            </div>
          )}

          {!otpStep ? (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] ml-1">
                  Username
                </label>
                <input
                  type="text"
                  name="username"
                  value={form.username}
                  onChange={handleChange}
                  required
                  className="w-full bg-[#0B0F1A]/50 border border-white/5 rounded-xl px-5 py-4 text-white placeholder:text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/50 transition-all"
                  placeholder="Enter username"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] ml-1">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    value={form.password}
                    onChange={handleChange}
                    required
                    className="w-full bg-[#0B0F1A]/50 border border-white/5 rounded-xl px-5 py-4 text-white placeholder:text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/50 transition-all"
                    placeholder="Enter password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-600 hover:text-white transition-colors focus:outline-none"
                  >
                    <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} className="text-sm" />
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="group w-full relative overflow-hidden bg-gradient-to-r from-[#7C3AED] to-[#8B5CF6] text-white py-4 px-6 rounded-xl font-bold shadow-[0_0_20px_rgba(124,58,237,0.2)] hover:shadow-[0_0_30px_rgba(124,58,237,0.4)] transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <div className="relative z-10 flex items-center justify-center gap-2 text-lg">
                    {loading ? (
                      <BrandSpinner size="sm" />
                    ) : (
                      <>
                        <span>Sign In</span>
                        <FontAwesomeIcon icon={faArrowRight} className="text-sm group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </div>
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-6">
              <div className="rounded-xl bg-purple-500/10 border border-purple-500/20 px-4 py-4 text-sm text-purple-200">
                <FontAwesomeIcon icon={faShieldAlt} className="mr-2 text-[#7C3AED]" />
                OTP sent to <strong>{otpStep.email}</strong>
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] ml-1">
                  6-digit Verification Code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  name="otp"
                  value={otpForm.otp}
                  onChange={handleOtpChange}
                  required
                  maxLength={6}
                  className="w-full bg-[#0B0F1A]/50 border border-white/5 rounded-xl px-4 py-4 text-white focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/50 transition-all tracking-[0.6em] text-center text-2xl font-bold"
                  placeholder="000000"
                />
              </div>
              <button
                type="submit"
                disabled={loading || otpForm.otp.length !== 6}
                className="w-full bg-gradient-to-r from-[#7C3AED] to-[#8B5CF6] text-white py-4 px-6 rounded-xl font-bold shadow-[0_0_20px_rgba(124,58,237,0.2)] transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? "Authorizing..." : "Verify Identity"}
              </button>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={loading || resendSecondsRemaining > 0}
                  className="bg-white/5 border border-white/10 text-gray-300 py-3 px-4 rounded-xl text-sm font-bold transition-all hover:bg-white/10 disabled:opacity-40"
                >
                  {resendSecondsRemaining > 0
                    ? `${resendSecondsRemaining}s`
                    : "Resend Code"}
                </button>
                <button
                  type="button"
                  onClick={resetLoginFlow}
                  className="bg-white/5 border border-white/10 text-gray-300 py-3 px-4 rounded-xl text-sm font-bold transition-all hover:bg-white/10"
                >
                  Go Back
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Simplified Footer */}
      <div className="relative z-10 mt-12 text-center text-gray-600 text-[10px] font-bold uppercase tracking-[0.4em]">
        &copy; {new Date().getFullYear()} Danab Power &bull; Enterprise
      </div>
    </div>
  );
}
