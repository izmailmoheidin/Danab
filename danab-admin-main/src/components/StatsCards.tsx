"use client";

import { useState, useEffect, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowUp,
  faUsers,
  faCalendarDay,
  faMoneyBillWave,
  faCalendar,
  faSyncAlt,
  faArrowDown,
  faNetworkWired,
  faShieldAlt
} from "@fortawesome/free-solid-svg-icons";
import { API_ENDPOINTS, apiService } from "@/lib/api";
import BrandSpinner from "@/components/BrandSpinner";

const AUTO_REFRESH_MS = 10 * 60 * 1000;
const SOMALIA_OFFSET_MS = 3 * 60 * 60 * 1000;

function getCurrentSomaliaDateKey(now = new Date()) {
  const somaliaNow = new Date(now.getTime() + SOMALIA_OFFSET_MS);
  return `${somaliaNow.getUTCFullYear()}-${String(somaliaNow.getUTCMonth() + 1).padStart(2, "0")}-${String(somaliaNow.getUTCDate()).padStart(2, "0")}`;
}

function getMsUntilNextSomaliaMidnight(now = new Date()) {
  const somaliaNow = new Date(now.getTime() + SOMALIA_OFFSET_MS);
  const nextMidnightUtcMs =
    Date.UTC(
      somaliaNow.getUTCFullYear(),
      somaliaNow.getUTCMonth(),
      somaliaNow.getUTCDate() + 1,
      0,
      0,
      1,
      0,
    ) - SOMALIA_OFFSET_MS;

  return Math.max(1_000, nextMidnightUtcMs - now.getTime());
}

export default function StatsCards() {
  const [monthlyData, setMonthlyData] = useState({ month: "", totalCustomersThisMonth: 0, stations: 0 });
  const [dailyData, setDailyData] = useState({ date: "", totalCustomersToday: 0, stations: 0 });
  const [revenueData, setRevenueData] = useState({ totalRevenueMonthly: 0, totalRentalsThisMonth: 0, month: "" });
  const [dailyRevenueData, setDailyRevenueData] = useState({ totalRevenueToday: 0, totalRentalsToday: 0, date: "" });
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    setRefreshing(true);
    try {
      const summaryRes = await apiService.getDashboardSummary();
      const summary = summaryRes.data || {};
      const daily = summary.daily || {};
      const monthly = summary.monthly || {};

      setRevenueData({ totalRevenueMonthly: monthly.totalRevenueMonthly || 0, totalRentalsThisMonth: monthly.totalRentalsThisMonth || 0, month: monthly.month || "" });
      setDailyRevenueData({ totalRevenueToday: daily.totalRevenueToday || 0, totalRentalsToday: daily.totalRentalsToday || 0, date: daily.date || "" });
      setMonthlyData({ month: monthly.month || "", totalCustomersThisMonth: monthly.totalCustomersThisMonth || 0, stations: monthly.stations || 0 });
      setDailyData({ date: daily.date || "", totalCustomersToday: daily.totalCustomersToday || 0, stations: daily.stations || 0 });
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [fetchData]);

  const stats = [
    {
      title: "TOTAL REVENUE",
      value: `$${revenueData.totalRevenueMonthly.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      subtitle: `Revenue for ${revenueData.month || "Current Month"}`,
      change: "+12.4%",
      isPositive: true,
      progress: 85,
      color: "purple",
      icon: faMoneyBillWave,
    },
    {
      title: "TOTAL CUSTOMERS",
      value: monthlyData.totalCustomersThisMonth.toLocaleString(),
      subtitle: `Customers for ${monthlyData.month || "Current Month"}`,
      change: "+5.2%",
      isPositive: true,
      progress: 78,
      color: "green",
      icon: faUsers,
    },
    {
      title: "ACTIVE SESSIONS",
      value: dailyRevenueData.totalRentalsToday.toString(),
      subtitle: "Current active rental sessions",
      change: "-2.1%",
      isPositive: false,
      progress: 60,
      color: "purple",
      icon: faNetworkWired,
    },
    {
      title: "NETWORK UPTIME",
      value: "99.98%",
      subtitle: "Average uptime across all nodes",
      change: "HEALTHY",
      isPositive: true,
      progress: 99,
      color: "green",
      icon: faShieldAlt,
    },
  ];

  const getColorClasses = (color: string) => {
    return color === "purple" ? "bg-[#7C3AED]" : "bg-[#10B981]";
  };

  return (
    <>
      <div className="col-span-1 md:col-span-2 lg:col-span-4 flex items-center justify-between mb-2">
         <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${refreshing ? "bg-yellow-500 animate-pulse" : "bg-[#10B981]"}`} />
            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
               {lastUpdated ? `System Synced: ${lastUpdated.toLocaleTimeString()}` : "Syncing System..."}
            </span>
         </div>
         <button 
           onClick={() => fetchData()}
           disabled={refreshing}
           className="text-[10px] font-black text-[#7C3AED] hover:text-[#8B5CF6] uppercase tracking-widest transition-colors flex items-center gap-2"
         >
           {refreshing ? <BrandSpinner size="sm" /> : <FontAwesomeIcon icon={faSyncAlt} />}
           Force Refresh
         </button>
      </div>

      {stats.map((stat, index) => (
        <div
          key={index}
          className="bg-[#161B26] border border-white/5 rounded-2xl p-6 flex flex-col justify-between hover:bg-[#1C2331] hover:border-white/10 transition-all duration-300 group"
        >
          <div className="flex items-start justify-between mb-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${stat.color === 'purple' ? 'bg-[#7C3AED]/10 text-[#7C3AED]' : 'bg-[#10B981]/10 text-[#10B981]'}`}>
              <FontAwesomeIcon icon={stat.icon} className="text-xl" />
            </div>
            <div className="flex items-center gap-1.5">
               <FontAwesomeIcon 
                 icon={stat.isPositive ? faArrowUp : faArrowDown} 
                 className={`text-[10px] ${stat.isPositive ? 'text-[#10B981]' : 'text-red-400'}`} 
               />
               <span className={`text-[11px] font-black tracking-tight ${stat.isPositive ? 'text-[#10B981]' : 'text-red-400'}`}>
                 {stat.change}
               </span>
            </div>
          </div>

          <div>
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.15em] mb-1">{stat.title}</p>
            <h3 className="text-3xl font-black text-white tracking-tighter group-hover:scale-[1.02] transition-transform origin-left">
              {stat.value}
            </h3>
            <p className="text-xs text-gray-500 mt-1 font-medium">{stat.subtitle}</p>
          </div>

          <div className="mt-6">
             <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full ${getColorClasses(stat.color)} shadow-[0_0_8px_currentcolor] transition-all duration-1000`} 
                  style={{ width: `${stat.progress}%` }}
                />
             </div>
          </div>
        </div>
      ))}
    </>
  );
}
