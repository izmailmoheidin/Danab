"use client";

import { useState } from "react";
import StatsCards from "@/components/StatsCards";
import Transactions from "@/components/Transactions";
import DashboardNotifications from "@/components/DashboardNotifications";
import ProtectedRoute from "@/components/ProtectedRoute";
import { ROLES } from "@/lib/utils/permissions";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCalendarAlt, faDownload } from "@fortawesome/free-solid-svg-icons";

export default function DashboardPage() {
  const [showAllNotifications, setShowAllNotifications] = useState(false);
  const [showAllTransactions, setShowAllTransactions] = useState(false);
  const t = useLanguageStore((s) => s.t);

  return (
    <ProtectedRoute minRole={ROLES.MODERATOR}>
      <div className="p-4 md:p-8 flex flex-col gap-8 animate-fadeInUp">
        
        {/* Dashboard Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
           <div>
              <h1 className="text-3xl font-black text-white tracking-tighter">Dashboard Overview</h1>
              <p className="text-gray-500 text-sm font-medium mt-1">Monitoring energy flow and network health across your stations.</p>
           </div>
           <div className="flex items-center gap-3">
              <button className="flex items-center gap-2 px-5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all">
                 <FontAwesomeIcon icon={faCalendarAlt} className="text-[#7C3AED]" />
                 Last 24 Hours
              </button>
              <button className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#7C3AED] to-[#8B5CF6] rounded-xl text-white text-xs font-black uppercase tracking-widest shadow-[0_0_15px_rgba(124,58,237,0.3)] hover:shadow-[0_0_20px_rgba(124,58,237,0.5)] transition-all active:scale-[0.98]">
                 <FontAwesomeIcon icon={faDownload} />
                 Export Report
              </button>
           </div>
        </div>

        {/* Top Metric Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatsCards />
        </div>

        {/* Main Analytics Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Main Chart / Transactions Area */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            <div className="bg-[#161B26] border border-white/5 rounded-2xl p-8 shadow-2xl h-full">
               <div className="flex items-center justify-between mb-8">
                  <div>
                    <h3 className="text-lg font-black text-white uppercase tracking-widest">Today&apos;s Metrics</h3>
                    <p className="text-xs text-gray-500 mt-1">Live energy consumption across all network nodes.</p>
                  </div>
                  <div className="flex items-center gap-6">
                     <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-[#7C3AED] shadow-[0_0_5px_#7C3AED]" />
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Solar Input</span>
                     </div>
                     <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-[#10B981] shadow-[0_0_5px_#10B981]" />
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Grid Load</span>
                     </div>
                  </div>
               </div>
               
               <Transactions
                 showAll={showAllTransactions}
                 onViewAll={() => setShowAllTransactions(true)}
               />
               
               {showAllTransactions && (
                 <button
                   className="mt-6 text-xs font-black text-[#7C3AED] uppercase tracking-widest hover:text-[#8B5CF6] transition-colors"
                   onClick={() => setShowAllTransactions(false)}
                 >
                   {t("show")} {t("less")}
                 </button>
               )}
            </div>
          </div>

          {/* Side Notifications Panel */}
          <div className="h-full">
            <DashboardNotifications
              showAll={showAllNotifications}
              onViewAll={() => setShowAllNotifications(true)}
            />
          </div>
        </div>

        {/* Background Decorative Glows */}
        <div className="fixed top-[20%] right-[-10%] w-[500px] h-[500px] bg-[#7C3AED]/10 rounded-full blur-[150px] pointer-events-none -z-10" />
        <div className="fixed bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-[#10B981]/5 rounded-full blur-[150px] pointer-events-none -z-10" />

      </div>
    </ProtectedRoute>
  );
}
