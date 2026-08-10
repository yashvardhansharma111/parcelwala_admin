'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiRequest, setToken, setStoredUser } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function sendOtp() {
    setError('');
    setLoading(true);
    try {
      const num = phone.trim().replace(/\D/g, '');
      const formatted = num.length === 10 ? `+91${num}` : `+${num}`;
      await apiRequest('/auth/send-otp', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber: formatted }),
      });
      setPhone(formatted);
      setStep('otp');
    } catch (e: any) {
      setError(e.message || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    setError('');
    setLoading(true);
    try {
      const res = await apiRequest<{
        user: { id: string; phoneNumber: string; name?: string; role: string };
        accessToken: string;
      }>('/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber: phone, otp: otp.trim() }),
      });

      if (res.user.role !== 'admin') {
        setError('Access denied. Admin accounts only.');
        return;
      }

      setToken(res.accessToken);
      setStoredUser(res.user);
      router.replace('/dashboard');
    } catch (e: any) {
      setError(e.message || 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-8">
        <div className="text-center mb-8">
          <div className="text-3xl font-black text-orange-500 tracking-tight">PARCELWALAH</div>
          <div className="text-sm text-slate-500 mt-1">Admin Panel</div>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
            {error}
          </div>
        )}

        {step === 'phone' ? (
          <>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Phone Number</label>
            <input
              type="tel"
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-orange-400"
              placeholder="9876543210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendOtp()}
            />
            <button
              onClick={sendOtp}
              disabled={loading || !phone.trim()}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold rounded-lg py-2.5 text-sm transition"
            >
              {loading ? 'Sending...' : 'Send OTP'}
            </button>
          </>
        ) : (
          <>
            <div className="text-sm text-slate-600 mb-4">
              OTP sent to <span className="font-semibold">{phone}</span>.{' '}
              <button onClick={() => { setStep('phone'); setOtp(''); }} className="text-orange-500 hover:underline">
                Change
              </button>
            </div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Enter OTP</label>
            <input
              type="text"
              maxLength={6}
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm mb-4 tracking-widest text-center font-mono focus:outline-none focus:ring-2 focus:ring-orange-400"
              placeholder="------"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && verifyOtp()}
            />
            <button
              onClick={verifyOtp}
              disabled={loading || otp.length !== 6}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold rounded-lg py-2.5 text-sm transition"
            >
              {loading ? 'Verifying...' : 'Login'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
