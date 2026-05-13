"use client";

import { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheckCircle,
  faExclamationTriangle,
  faBolt,
  faInfoCircle,
} from "@fortawesome/free-solid-svg-icons";
import { useDataStore } from "@/stores/useDataStore";

interface DashboardNotificationsProps {
  showAll?: boolean;
  onViewAll?: () => void;
}

interface Notification {
  id: string;
  title: string;
  description: string;
  time: string;
  type: "success" | "error" | "warning" | "info";
  icon: any;
  priority: number;
}

export default function DashboardNotifications({
  showAll = false,
  onViewAll,
}: DashboardNotificationsProps) {
  const { transactions, stations, loading, error, refetch } = useDataStore();
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    if (!loading && transactions.length > 0) {
      const stationMap: Record<string, string> = {};
      stations.forEach((s: any) => {
        if (s.imei) stationMap[s.imei] = s.name;
      });

      const generated = generateNotifications(transactions, stationMap);
      setNotifications(generated);
    }
  }, [transactions, stations, loading]);

  const generateNotifications = (txs: any[], stationMap: Record<string, string>): Notification[] => {
    const notifs: Notification[] = [];
    const now = new Date();

    const recentTxs = txs.filter((t: any) => {
      if (!t.timestamp?._seconds) return false;
      const txTime = new Date(t.timestamp._seconds * 1000);
      return (now.getTime() - txTime.getTime()) / (1000 * 60 * 60) <= 2;
    });

    recentTxs.forEach((t: any) => {
      notifs.push({
        id: `recent-${t.id}`,
        title: "New Station Online",
        description: `${stationMap[t.stationCode] || t.stationCode} is now operational.`,
        time: formatTimestamp(t.timestamp),
        type: "success",
        icon: faCheckCircle,
        priority: 2,
      });
    });

    // Add some mock high priority alerts for design matching
    if (notifs.length > 0) {
       notifs.unshift({
          id: "mock-1",
          title: "Critical Overload: Station #04",
          description: "Temperature exceeded 65°C in Slot B-12.",
          time: "2 MINS AGO",
          type: "error",
          icon: faExclamationTriangle,
          priority: 1
       });
    }

    return notifs.sort((a, b) => a.priority - b.priority);
  };

  const formatTimestamp = (timestamp: any) => {
    if (!timestamp?._seconds) return "Just now";
    const date = new Date(timestamp._seconds * 1000);
    const now = new Date();
    const diffMin = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin} MINS AGO`;
    return `${Math.floor(diffMin / 60)} HOURS AGO`;
  };

  const visible = showAll ? notifications : notifications.slice(0, 5);

  return (
    <div className="bg-[#161B26] border border-white/5 rounded-2xl overflow-hidden shadow-2xl h-full flex flex-col">
      <div className="p-6 border-b border-white/5 flex items-center justify-between">
         <h3 className="text-sm font-black text-white uppercase tracking-widest">Notifications</h3>
         <button onClick={onViewAll} className="text-[10px] font-black text-[#7C3AED] hover:text-[#8B5CF6] uppercase tracking-widest transition-colors">
            View All
         </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
         {loading ? (
            <div className="p-10 flex flex-col items-center justify-center gap-4">
               <div className="w-8 h-8 border-2 border-[#7C3AED] border-t-transparent rounded-full animate-spin" />
               <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Updating feed...</span>
            </div>
         ) : visible.length === 0 ? (
            <div className="p-10 text-center">
               <p className="text-gray-500 text-sm italic">System is quiet. No recent alerts.</p>
            </div>
         ) : (
            <div className="divide-y divide-white/5">
               {visible.map((n) => (
                  <div key={n.id} className="p-5 hover:bg-white/5 transition-colors cursor-pointer group">
                     <div className="flex gap-4">
                        <div className={`w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center transition-transform group-hover:scale-105 ${
                           n.type === 'error' ? 'bg-red-500/10 text-red-500' : 
                           n.type === 'success' ? 'bg-[#10B981]/10 text-[#10B981]' : 
                           'bg-[#7C3AED]/10 text-[#7C3AED]'
                        }`}>
                           <FontAwesomeIcon icon={n.icon} />
                        </div>
                        <div className="flex-1 min-w-0">
                           <div className="flex justify-between items-start mb-1">
                              <h4 className="text-sm font-bold text-white truncate pr-2">{n.title}</h4>
                              <span className="text-[9px] font-black text-gray-600 whitespace-nowrap uppercase tracking-tighter mt-1">{n.time}</span>
                           </div>
                           <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">
                              {n.description}
                           </p>
                        </div>
                     </div>
                  </div>
               ))}
            </div>
         )}
      </div>
    </div>
  );
}
