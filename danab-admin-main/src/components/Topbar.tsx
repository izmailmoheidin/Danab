"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBars,
  faSearch,
  faBell,
  faCheckCircle,
  faSignOutAlt,
  faSpinner,
  faStore,
  faUsers,
  faExchangeAlt,
  faTimes,
  faCog,
  faQuestionCircle
} from "@fortawesome/free-solid-svg-icons";
import { useAuthStore } from "@/stores/useAuthStore";
import { useDataStore } from "@/stores/useDataStore";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { isAdmin, getUserDisplayRole } from "@/lib/utils/roleUtils";

interface TopbarProps {
  setSidebarOpen: (open: boolean) => void;
}

export default function Topbar({ setSidebarOpen }: TopbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const {
    stations,
    transactions,
    users: contextUsers,
    loading: contextLoading,
  } = useDataStore();
  const t = useLanguageStore((s) => s.t);

  const [notificationOpen, setNotificationOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [seenNotificationIds, setSeenNotificationIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);

  const userIsAdmin = isAdmin(user);
  const stationNameByKey = useMemo(() => {
    const map: Record<string, string> = {};
    stations.forEach((station: any) => {
      if (station?.imei) map[station.imei] = station.name || station.imei;
    });
    return map;
  }, [stations]);

  const notificationRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const seenNotificationsStorageKey = useMemo(
    () => `topbar:seen-notifications:${user?.username || "guest"}`,
    [user?.username],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(seenNotificationsStorageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      setSeenNotificationIds(Array.isArray(parsed) ? parsed : []);
    } catch {
      setSeenNotificationIds([]);
    }
  }, [seenNotificationsStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(seenNotificationsStorageKey, JSON.stringify(seenNotificationIds));
  }, [seenNotificationIds, seenNotificationsStorageKey]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) setNotificationOpen(false);
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) setUserMenuOpen(false);
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) setSearchOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const performSearch = (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    const results: any[] = [];
    const searchTerm = query.toLowerCase();

    stations.forEach((station: any) => {
      if (station.name?.toLowerCase().includes(searchTerm) || station.imei?.toLowerCase().includes(searchTerm)) {
        results.push({ type: "station", id: station.id, title: station.name, subtitle: station.location, icon: faStore, data: station });
      }
    });

    if (userIsAdmin && contextUsers) {
      contextUsers.forEach((u: any) => {
        if (u.username?.toLowerCase().includes(searchTerm) || u.email?.toLowerCase().includes(searchTerm)) {
          results.push({ type: "user", id: u.id, title: u.username, subtitle: u.role, icon: faUsers, data: u });
        }
      });
    }

    setSearchResults(results.slice(0, 10));
  };

  useEffect(() => {
    const timer = setTimeout(() => performSearch(searchQuery), 150);
    return () => clearTimeout(timer);
  }, [searchQuery, stations, contextUsers]);

  const getPageTitle = () => {
    const titles: Record<string, string> = {
      "/dashboard": "Dashboard Overview",
      "/stations": "Station Management",
      "/slots": "Slot Management",
      "/revenue": "Revenue Analytics",
      "/rentals": "Transaction History",
      "/live-batteries": "Live Monitoring",
    };
    return titles[pathname] || "Admin Console";
  };

  const unreadNotificationCount = notifications.filter(n => !seenNotificationIds.includes(n.id)).length;

  return (
    <header className="flex items-center justify-between px-6 py-4 bg-[#0B0F1A]/80 backdrop-blur-xl border-b border-white/5 sticky top-0 z-40">
      <div className="flex items-center gap-4">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 text-gray-400 lg:hidden hover:bg-white/5 rounded-lg transition-colors"
        >
          <FontAwesomeIcon icon={faBars} className="text-xl" />
        </button>
        <div className="hidden lg:block">
          <h2 className="text-xl font-bold text-white tracking-tight">{getPageTitle()}</h2>
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">Monitoring Danab Network</p>
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-6">
        {/* Search Input */}
        <div className="relative hidden md:block" ref={searchRef}>
          <div className="relative">
            <input
              type="text"
              placeholder="Search analytics..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSearchOpen(e.target.value.trim().length > 0);
              }}
              className="w-64 lg:w-96 bg-white/5 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/50 transition-all"
            />
            <FontAwesomeIcon icon={faSearch} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-xs" />
          </div>

          {searchOpen && (
            <div className="absolute right-0 mt-3 w-[400px] bg-[#161B26] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
              <div className="p-4 border-b border-white/5 bg-white/5">
                <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Search Results</span>
              </div>
              <div className="max-h-96 overflow-y-auto divide-y divide-white/5">
                {searchResults.length === 0 ? (
                  <div className="p-8 text-center text-gray-500 text-sm italic">No data found matching your query</div>
                ) : (
                  searchResults.map((res) => (
                    <button
                      key={`${res.type}-${res.id}`}
                      onClick={() => {
                        setSearchOpen(false);
                        setSearchQuery("");
                        router.push(res.type === "station" ? `/station/${res.data.imei}` : "/dashboard");
                      }}
                      className="w-full p-4 flex items-center gap-4 hover:bg-white/5 transition-colors text-left"
                    >
                      <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                        <FontAwesomeIcon icon={res.icon} className="text-[#7C3AED]" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">{res.title}</p>
                        <p className="text-xs text-gray-500">{res.subtitle}</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 md:gap-3">
          {/* Action Icons */}
          <button className="p-2.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-all relative">
            <FontAwesomeIcon icon={faBell} />
            {unreadNotificationCount > 0 && <div className="absolute top-2 right-2 w-2 h-2 bg-[#10B981] rounded-full shadow-[0_0_8px_#10B981]" />}
          </button>
          <button className="p-2.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-all hidden sm:block">
            <FontAwesomeIcon icon={faCog} />
          </button>
          <button className="p-2.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-all hidden sm:block">
            <FontAwesomeIcon icon={faQuestionCircle} />
          </button>

          {/* User Section */}
          <div className="relative ml-2 border-l border-white/10 pl-4 md:pl-6" ref={userMenuRef}>
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-3 group"
            >
              <div className="hidden md:flex flex-col items-end">
                <span className="text-sm font-bold text-white group-hover:text-gray-200 transition-colors">{user?.username || "Admin User"}</span>
                <span className="text-[10px] text-[#7C3AED] font-black uppercase tracking-widest leading-none mt-1">{getUserDisplayRole(user)}</span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#7C3AED] to-[#8B5CF6] p-0.5 shadow-lg group-hover:scale-105 transition-transform">
                <div className="w-full h-full rounded-[10px] bg-[#0B0F1A] flex items-center justify-center text-white font-black">
                  {user?.username?.charAt(0).toUpperCase() || "A"}
                </div>
              </div>
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 mt-3 w-56 bg-[#161B26] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                <div className="p-4 border-b border-white/5 bg-white/5 md:hidden">
                  <p className="text-sm font-bold text-white">{user?.username}</p>
                  <p className="text-[10px] text-[#7C3AED] font-black uppercase">{getUserDisplayRole(user)}</p>
                </div>
                <div className="p-2">
                  <button
                    onClick={() => {
                      logout();
                      router.push("/login");
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-red-400 hover:bg-red-400/10 rounded-xl transition-colors"
                  >
                    <FontAwesomeIcon icon={faSignOutAlt} />
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
