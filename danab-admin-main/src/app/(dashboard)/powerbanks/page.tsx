'use client';

import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faBatteryFull, faBatteryHalf, faBatteryQuarter, faBatteryEmpty } from '@fortawesome/free-solid-svg-icons';
import { apiService } from '@/lib/api';
import { useLanguageStore } from '@/stores/useLanguageStore';

export default function PowerbanksPage() {
  const t = useLanguageStore((s) => s.t);
  const [stations, setStations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const fetchStations = async () => {
      try {
        const res = await apiService.getStations();
        setStations(res.data.stations || res.data || []);
      } catch (err: any) {
        setError(err.message || 'Failed to fetch stations');
      } finally {
        setLoading(false);
      }
    };
    fetchStations();
  }, []);

  const allPowerbanks: any[] = [];
  stations.forEach((station: any) => {
    if (station.slots) {
      station.slots.forEach((slot: any) => {
        if (slot.battery_id) {
          allPowerbanks.push({
            ...slot,
            stationName: station.name,
            stationImei: station.imei,
          });
        }
      });
    }
  });

  const filtered = allPowerbanks.filter((pb: any) => {
    const q = searchQuery.toLowerCase();
    return pb.battery_id?.toString().includes(q) || pb.stationName?.toLowerCase().includes(q);
  });

  const getBatteryIcon = (level: number | undefined) => {
    if (level === undefined) return faBatteryEmpty;
    if (level > 75) return faBatteryFull;
    if (level > 50) return faBatteryHalf;
    if (level > 25) return faBatteryQuarter;
    return faBatteryEmpty;
  };

  const getBatteryColor = (level: number | undefined) => {
    if (level === undefined) return 'text-gray-400';
    if (level > 75) return 'text-green-500';
    if (level > 50) return 'text-yellow-500';
    if (level > 25) return 'text-orange-500';
    return 'text-red-500';
  };

  if (loading) {
    return (
      <div className="p-4">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
          <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="mb-6">
        <h2 className="text-2xl font-bold dark:text-white">{t('powerbanks')}</h2>
        <p className="text-gray-500 dark:text-gray-400">View all power banks across stations</p>
      </div>

      {error && <div className="mb-4 p-3 text-red-700 bg-red-100 rounded-lg dark:bg-red-900 dark:text-red-200">{error}</div>}

      <div className="mb-4 relative">
        <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-3 text-gray-400" />
        <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search power banks..."
          className="w-full pl-10 pr-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.map((pb: any, index: number) => (
          <div key={`${pb.battery_id}-${index}`} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="font-semibold dark:text-white">Battery #{pb.battery_id}</span>
              <FontAwesomeIcon icon={getBatteryIcon(pb.batteryLevel)} className={`text-xl ${getBatteryColor(pb.batteryLevel)}`} />
            </div>
            <div className="space-y-1 text-sm">
              <p className="text-gray-600 dark:text-gray-400">Station: {pb.stationName}</p>
              <p className="text-gray-600 dark:text-gray-400">Slot: {pb.slotNumber || 'N/A'}</p>
              {pb.batteryLevel !== undefined && (
                <div className="mt-2">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-500 dark:text-gray-400">Battery Level</span>
                    <span className={getBatteryColor(pb.batteryLevel)}>{pb.batteryLevel}%</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div className={`h-2 rounded-full ${pb.batteryLevel > 50 ? 'bg-green-500' : pb.batteryLevel > 25 ? 'bg-yellow-500' : 'bg-red-500'}`}
                      style={{ width: `${pb.batteryLevel}%` }}></div>
                  </div>
                </div>
              )}
              <p className="mt-2">
                <span className={`px-2 py-0.5 text-xs rounded-full ${pb.status?.toLowerCase() === 'available' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : pb.status?.toLowerCase() === 'rented' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'}`}>
                  {pb.status || 'Unknown'}
                </span>
              </p>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && !loading && (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">No power banks found</div>
      )}
    </div>
  );
}
