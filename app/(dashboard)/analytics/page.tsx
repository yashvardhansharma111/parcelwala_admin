'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api';

interface DashboardAnalytics {
  userCount: number; totalBookings: number; todayBookings: number;
  inTransitBookings: number; deliveredBookings: number; cancelledBookings: number;
  dailyRevenue: number; monthlyRevenue: number; totalRevenue: number;
}
interface Customer {
  userId: string; name?: string; phoneNumber: string;
  totalBookings: number; lifetimeSpend: number; complaints: number;
}
interface RevenueDay { date: string; revenue: number; bookings: number; }
interface FailedDelivery {
  bookingId: string; trackingNumber?: string; customerPhone: string;
  customerName: string; status: string; fare?: number; createdAt: string;
}

type Tab = 'overview' | 'customers' | 'failed';

export default function AnalyticsPage() {
  const [tab, setTab] = useState<Tab>('overview');
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);
  const [revenue, setRevenue] = useState<RevenueDay[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [failed, setFailed] = useState<FailedDelivery[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiRequest<DashboardAnalytics>('/analytics/dashboard').catch(() => null),
      apiRequest<RevenueDay[]>('/analytics/revenue?days=14').catch(() => []),
      apiRequest<Customer[]>('/analytics/customers').catch(() => []),
      apiRequest<FailedDelivery[]>('/analytics/failed-deliveries').catch(() => []),
    ]).then(([a, r, c, f]) => {
      if (a) setAnalytics(a);
      setRevenue(Array.isArray(r) ? r : []);
      setCustomers(Array.isArray(c) ? c : []);
      setFailed(Array.isArray(f) ? f : []);
    }).finally(() => setLoading(false));
  }, []);

  const maxRev = revenue.length ? Math.max(...revenue.map(r => r.revenue), 1) : 1;

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-400">Loading...</div>;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-slate-800 mb-6">Analytics</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-slate-100 rounded-xl p-1 w-fit">
        {([['overview','Overview'],['customers','Customers'],['failed','Failed Deliveries']] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === t ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && analytics && (
        <div>
          {/* Metric cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Total Users', value: analytics.userCount, color: 'text-blue-600' },
              { label: 'Total Bookings', value: analytics.totalBookings, color: 'text-slate-700' },
              { label: "Today's Bookings", value: analytics.todayBookings, color: 'text-orange-600' },
              { label: 'In Transit', value: analytics.inTransitBookings, color: 'text-purple-600' },
              { label: 'Delivered', value: analytics.deliveredBookings, color: 'text-green-600' },
              { label: 'Cancelled', value: analytics.cancelledBookings, color: 'text-red-600' },
              { label: 'Daily Revenue', value: `₹${analytics.dailyRevenue?.toLocaleString('en-IN')}`, color: 'text-orange-600' },
              { label: 'Monthly Revenue', value: `₹${analytics.monthlyRevenue?.toLocaleString('en-IN')}`, color: 'text-indigo-600' },
              { label: 'Total Revenue', value: `₹${analytics.totalRevenue?.toLocaleString('en-IN')}`, color: 'text-green-700' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                <div className={`text-xl font-bold ${color}`}>{value}</div>
                <div className="text-xs text-slate-500 mt-1">{label}</div>
              </div>
            ))}
          </div>

          {/* Revenue bar chart */}
          {revenue.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 mb-6">
              <h3 className="font-semibold text-slate-700 mb-4">Revenue — Last 14 Days</h3>
              <div className="flex items-end gap-1 h-40">
                {revenue.slice(-14).map((day) => (
                  <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                    <div className="text-xs text-slate-400 font-medium" style={{ fontSize: 9 }}>
                      ₹{day.revenue > 999 ? `${Math.round(day.revenue/1000)}k` : day.revenue}
                    </div>
                    <div
                      className="w-full bg-orange-400 rounded-t min-h-1"
                      style={{ height: `${Math.max((day.revenue / maxRev) * 120, 4)}px` }}
                      title={`₹${day.revenue} · ${day.bookings} bookings`}
                    />
                    <div className="text-slate-400 whitespace-nowrap" style={{ fontSize: 8 }}>
                      {new Date(day.date).toLocaleDateString('en-IN', { day:'2-digit', month:'short' })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Status breakdown */}
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
            <h3 className="font-semibold text-slate-700 mb-4">Booking Status Breakdown</h3>
            <div className="space-y-3">
              {[
                { label: 'Delivered', value: analytics.deliveredBookings, color: 'bg-green-400' },
                { label: 'In Transit', value: analytics.inTransitBookings, color: 'bg-purple-400' },
                { label: 'Cancelled', value: analytics.cancelledBookings, color: 'bg-red-400' },
              ].map(({ label, value, color }) => {
                const pct = analytics.totalBookings ? Math.round((value / analytics.totalBookings) * 100) : 0;
                return (
                  <div key={label}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-600">{label}</span>
                      <span className="text-slate-500">{value} ({pct}%)</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Customers */}
      {tab === 'customers' && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          {customers.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-slate-400">No customer data</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  {['Customer', 'Phone', 'Bookings', 'Total Spend', 'Complaints'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {customers.map((c) => (
                  <tr key={c.userId} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800">{c.name || 'Unknown'}</td>
                    <td className="px-4 py-3 text-slate-600">{c.phoneNumber}</td>
                    <td className="px-4 py-3 text-slate-700 font-semibold">{c.totalBookings}</td>
                    <td className="px-4 py-3 font-semibold text-green-700">₹{c.lifetimeSpend?.toLocaleString('en-IN') || 0}</td>
                    <td className="px-4 py-3">
                      {c.complaints > 0 ? (
                        <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">{c.complaints}</span>
                      ) : (
                        <span className="text-xs text-slate-400">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Failed Deliveries */}
      {tab === 'failed' && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          {failed.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-slate-400">No failed deliveries</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  {['Tracking #', 'Customer', 'Phone', 'Status', 'Fare', 'Date'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {failed.map((f) => (
                  <tr key={f.bookingId} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{f.trackingNumber || f.bookingId.slice(0, 8)}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{f.customerName}</td>
                    <td className="px-4 py-3 text-slate-600">{f.customerPhone}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">{f.status}</span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-700">{f.fare ? `₹${f.fare}` : '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {f.createdAt ? new Date(f.createdAt).toLocaleDateString('en-IN') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
