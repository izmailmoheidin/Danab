'use client';

import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSync, faCheckCircle, faExclamationTriangle, faExclamationCircle, faInfoCircle } from '@fortawesome/free-solid-svg-icons';
import { apiService } from '@/lib/api';
import { useLanguageStore } from '@/stores/useLanguageStore';

export default function NotificationsPage() {
  const t = useLanguageStore((s) => s.t);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const [txRes, stRes] = await Promise.all([
        apiService.getLatestTransactions(),
        apiService.getStations(),
      ]);
      const transactions = txRes.data || [];
      const stations = stRes.data.stations || stRes.data || [];

      const stationMap: Record<string, string> = {};
      stations.forEach((s: any) => { stationMap[s.imei] = s.name; });

      const now = new Date();
      const notifs: any[] = [];

      transactions.slice(0, 20).forEach((tx: any) => {
        const time = tx.timestamp?._seconds ? new Date(tx.timestamp._seconds * 1000) : new Date();
        const diffMin = Math.floor((now.getTime() - time.getTime()) / (1000 * 60));
        const timeStr = diffMin < 60 ? `${diffMin}m ago` : diffMin < 1440 ? `${Math.floor(diffMin / 60)}h ago` : `${Math.floor(diffMin / 1440)}d ago`;

        notifs.push({
          id: tx.id || Math.random().toString(),
          title: 'Transaction',
          description: `$${tx.amount} at ${stationMap[tx.stationCode] || tx.stationCode || 'Unknown'}`,
          time: timeStr,
          type: tx.status === 'completed' ? 'success' : tx.status === 'overdue' ? 'error' : 'info',
        });
      });

      setNotifications(notifs);
    } catch (err: any) {
      setError(err.message || 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchNotifications(); }, []);

  const iconMap: Record<string, any> = {
    success: faCheckCircle,
    warning: faExclamationTriangle,
    error: faExclamationCircle,
    info: faInfoCircle,
  };

  const colorMap: Record<string, string> = {
    success: 'text-green-500 bg-green-100 dark:bg-green-900 dark:text-green-300',
    warning: 'text-yellow-500 bg-yellow-100 dark:bg-yellow-900 dark:text-yellow-300',
    error: 'text-red-500 bg-red-100 dark:bg-red-900 dark:text-red-300',
    info: 'text-blue-500 bg-blue-100 dark:bg-blue-900 dark:text-blue-300',
  };

  const filtered = filter === 'all' ? notifications : notifications.filter((n) => n.type === filter);

  return (
    <div className="p-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold dark:text-white">{t('notifications')}</h2>
          <p className="text-gray-500 dark:text-gray-400">System alerts and activity log</p>
        </div>
        <button onClick={fetchNotifications} disabled={loading} className="mt-4 md:mt-0 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2 disabled:opacity-50">
          <FontAwesomeIcon icon={faSync} spin={loading} /><span>Refresh</span>
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex space-x-2 mb-4 overflow-x-auto">
        {['all', 'success', 'error', 'warning', 'info'].map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize ${filter === f ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
            {f}
          </button>
        ))}
      </div>

      {error && <div className="mb-4 p-3 text-red-700 bg-red-100 rounded-lg dark:bg-red-900 dark:text-red-200">{error}</div>}

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow divide-y dark:divide-gray-700">
        {loading ? (
          <div className="p-8 text-center">
            <FontAwesomeIcon icon={faSync} spin className="text-blue-600 text-2xl" />
            <p className="mt-2 text-gray-500 dark:text-gray-400">Loading notifications...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">No notifications found</div>
        ) : (
          filtered.map((n: any) => (
            <div key={n.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              <div className="flex items-start space-x-3">
                <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${colorMap[n.type] || colorMap.info}`}>
                  <FontAwesomeIcon icon={iconMap[n.type] || iconMap.info} className="text-sm" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium dark:text-white">{n.title}</p>
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{n.description}</p>
                    </div>
                    <span className="ml-2 text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">{n.time}</span>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
