"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faTachometerAlt,
  faStore,
  faBatteryThreeQuarters,
  faChartLine,
  faUsers,
  faMoon,
  faSun,
  faTimes,
  faChartBar,
  faBan,
  faExclamationTriangle,
  faExchangeAlt,
  faBolt,
} from "@fortawesome/free-solid-svg-icons";
import { useAuthStore } from "@/stores/useAuthStore";
import { useDarkModeStore } from "@/stores/useDarkModeStore";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { getUserRole, ROLES } from "@/lib/utils/permissions";

interface SidebarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

export default function Sidebar({ sidebarOpen, setSidebarOpen }: SidebarProps) {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const { dark, toggleDark } = useDarkModeStore();
  const t = useLanguageStore((s) => s.t);

  const userRole = getUserRole(user);

  const getNavigationItems = () => {
    const common = [
      {
        section: "OVERVIEW",
        items: [
          { id: "dashboard", label: t("dashboard"), icon: faTachometerAlt },
        ],
      },
    ];

    if (userRole === ROLES.USER) {
      return [
        ...common,
        {
          section: "OPERATIONS",
          items: [
            { id: "slots", label: t("slots"), icon: faBatteryThreeQuarters },
            { id: "active-rentals", label: t("rentals"), icon: faExchangeAlt },
            { id: "rentals", label: t("transactions"), icon: faExchangeAlt },
          ],
        },
        {
          section: "MANAGEMENT",
          items: [{ id: "blacklist", label: "Blacklist", icon: faBan }],
        },
      ];
    }

    const adminOps = [
      { id: "stations", label: t("stations"), icon: faStore },
      { id: "live-batteries", label: "Live Batteries", icon: faBolt },
      { id: "station-comparison", label: "Station Comparison", icon: faChartBar },
      { id: "slots", label: t("slots"), icon: faBatteryThreeQuarters },
      { id: "active-rentals", label: t("rentals"), icon: faExchangeAlt },
      { id: "rentals", label: t("transactions"), icon: faExchangeAlt },
      { id: "problem-slots", label: "Problem Slots", icon: faExclamationTriangle },
      { id: "revenue", label: t("revenue"), icon: faChartLine },
    ];

    if (userRole === ROLES.MODERATOR) {
      return [
        ...common,
        { section: "OPERATIONS", items: adminOps },
        { section: "MANAGEMENT", items: [{ id: "blacklist", label: "Blacklist", icon: faBan }] },
      ];
    }

    if (userRole === ROLES.ADMIN) {
      return [
        ...common,
        { section: "OPERATIONS", items: adminOps },
        {
          section: "MANAGEMENT",
          items: [
            { id: "users", label: t("users"), icon: faUsers },
            { id: "blacklist", label: "Blacklist", icon: faBan },
          ],
        },
      ];
    }

    return [];
  };

  const navigationItems = getNavigationItems();
  const getPath = (id: string) => `/${id}`;

  return (
    <div
      className={`w-72 bg-[#0B0F1A] border-r border-white/5 transition-all duration-300 fixed lg:static inset-y-0 left-0 z-50 ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
    >
      <div className="flex flex-col h-full">
        {/* Logo Section */}
        <div className="flex items-center justify-between p-6 mb-2">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-black text-[#7C3AED] tracking-tighter">DA</span>
            <div className="bg-[#10B981] p-1 rounded-sm rotate-12 transform shadow-[0_0_10px_rgba(16,185,129,0.3)]">
              <FontAwesomeIcon icon={faBolt} className="text-white text-xs" />
            </div>
            <span className="text-2xl font-black text-[#7C3AED] tracking-tighter">AB</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-2 text-gray-500 rounded-lg lg:hidden hover:bg-white/5 transition-colors"
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>


        <nav className="flex-1 px-4 overflow-y-auto space-y-8 pb-10 custom-scrollbar">
          {navigationItems.map((section) => (
            <div key={section.section}>
              <h2 className="px-4 mb-3 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">
                {section.section}
              </h2>
              <div className="space-y-1">
                {section.items.map((item) => {
                  const active = pathname === getPath(item.id);
                  return (
                    <Link
                      key={item.id}
                      href={getPath(item.id)}
                      prefetch={true}
                      onClick={() => setSidebarOpen(false)}
                      className={`group flex items-center py-3 px-4 rounded-xl transition-all duration-200 relative ${active
                          ? "bg-[#7C3AED]/10 text-white"
                          : "text-gray-500 hover:text-white hover:bg-white/5"
                        }`}
                    >
                      {active && (
                        <div className="absolute left-0 w-1 h-6 bg-[#7C3AED] rounded-r-full shadow-[0_0_10px_#7C3AED]" />
                      )}
                      <FontAwesomeIcon
                        icon={item.icon}
                        className={`mr-4 text-lg transition-colors ${active ? "text-[#7C3AED]" : "group-hover:text-gray-300"}`}
                      />
                      <span className="text-sm font-bold tracking-tight">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer Actions */}
        <div className="p-6 border-t border-white/5 bg-[#0B0F1A]/80 backdrop-blur-sm">
          <button
            onClick={toggleDark}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-all border border-white/5"
          >
            <FontAwesomeIcon icon={dark ? faSun : faMoon} />
            <span className="text-xs font-bold uppercase tracking-widest">{dark ? "Light Mode" : "Dark Mode"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
