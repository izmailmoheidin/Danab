"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Line, Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faMoneyBillWave,
  faChartBar,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";
import { apiService } from "@/lib/api";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
);

export default function StationDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const imei = params.imei as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [daily, setDaily] = useState<any>(null);
  const [monthly, setMonthly] = useState<any>(null);
  const [dailyCustomers, setDailyCustomers] = useState<any>(null);
  const [monthlyCustomers, setMonthlyCustomers] = useState<any>(null);
  const [charts, setCharts] = useState<any>(null);
  const [chartsLoading, setChartsLoading] = useState(true);
  const [chartsError, setChartsError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [stationName, setStationName] = useState("");

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      setChartsLoading(true);
      setError("");
      setChartsError("");

      try {
        const [
          stationsRes,
          dailyRes,
          monthlyRes,
          dailyCustRes,
          monthlyCustRes,
          chartsRes,
        ] = await Promise.all([
          apiService.getStations(),
          apiService.getDailyRevenue(imei),
          apiService.getMonthlyRevenue(imei),
          apiService.getDailyCustomers(imei),
          apiService.getMonthlyCustomers(imei),
          apiService.getChartsByImei(imei),
        ]);

        const found = (stationsRes.data.stations || []).find(
          (s: any) => s.imei === imei,
        );
        setStationName(found?.name || "Station Details");
        setDaily(dailyRes.data);
        setMonthly(monthlyRes.data);
        setDailyCustomers(dailyCustRes.data);
        setMonthlyCustomers(monthlyCustRes.data);
        setCharts(chartsRes.data);
        setLastUpdated(new Date().toLocaleString());
      } catch {
        setError("Failed to fetch station data");
        setChartsError("Failed to fetch chart data");
      } finally {
        setLoading(false);
        setChartsLoading(false);
      }
    };
    fetchAll();
  }, [imei]);

  const dailyRevenueLineData = charts?.dailyRevenue
    ? {
        labels: charts.dailyRevenue.labels,
        datasets: [
          {
            label: "Daily Revenue ($)",
            data: charts.dailyRevenue.data,
            borderColor: "#3b82f6",
            backgroundColor: "rgba(59, 130, 246, 0.2)",
            tension: 0.4,
            fill: true,
          },
        ],
      }
    : null;

  const monthlyRevenueLineData = charts?.monthlyRevenue
    ? {
        labels: charts.monthlyRevenue.labels,
        datasets: [
          {
            label: "Monthly Revenue ($)",
            data: charts.monthlyRevenue.data,
            borderColor: "#f59e42",
            backgroundColor: "rgba(245, 158, 66, 0.2)",
            tension: 0.4,
            fill: true,
          },
        ],
      }
    : null;

  const weeklyRevenueBarData = charts?.weeklyRevenue
    ? {
        labels: charts.weeklyRevenue.labels,
        datasets: [
          {
            label: "Weekly Revenue ($)",
            data: charts.weeklyRevenue.data,
            backgroundColor: "#6366f1",
            borderRadius: 8,
          },
        ],
      }
    : null;

  return (
    <div className="min-h-screen pb-16 bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="px-4 py-8 text-center shadow-lg bg-gradient-to-br from-green-400 to-indigo-400 dark:from-gray-900 dark:to-gray-800 rounded-b-2xl">
        <button
          onClick={() => router.push("/stations")}
          className="inline-flex items-center px-4 py-2 mb-4 text-sm font-medium text-blue-800 bg-white rounded-lg shadow hover:bg-blue-100 dark:bg-gray-800 dark:text-blue-200"
        >
          <FontAwesomeIcon icon={faArrowLeft} className="mr-2" /> Back
        </button>
        <h1 className="mb-2 text-3xl font-bold text-white">{stationName}</h1>
        <div className="text-sm text-blue-100 dark:text-blue-300">
          IMEI: <span className="font-mono">{imei}</span>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="max-w-6xl px-4 mx-auto mt-8 mb-8">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            {
              icon: faMoneyBillWave,
              title: "Today's Revenue",
              value: `$${daily?.totalRevenueToday?.toFixed(2) ?? "-"}`,
              subtitle: `${daily?.totalRentalsToday ?? "-"} rentals`,
              color: "from-indigo-500 to-indigo-600",
            },
            {
              icon: faChartBar,
              title: "Monthly Revenue",
              value: `$${monthly?.totalRevenueMonthly?.toFixed(2) ?? "-"}`,
              subtitle: `${monthly?.totalRentalsThisMonth ?? "-"} rentals`,
              color: "from-blue-500 to-blue-600",
            },
            {
              icon: faUsers,
              title: "Today's Customers",
              value: dailyCustomers?.totalCustomersToday ?? "-",
              subtitle: `Date: ${dailyCustomers?.date || "-"}`,
              color: "from-green-500 to-green-600",
            },
            {
              icon: faUsers,
              title: "Monthly Customers",
              value: monthlyCustomers?.totalCustomersThisMonth ?? "-",
              subtitle: `Month: ${monthlyCustomers?.month || "-"}`,
              color: "from-yellow-500 to-yellow-600",
            },
          ].map((card, i) => (
            <div
              key={i}
              className={`flex flex-col items-center p-3 rounded-lg bg-gradient-to-br ${card.color} text-white shadow`}
            >
              <FontAwesomeIcon icon={card.icon} className="mb-1 text-xl" />
              <h4 className="text-xs font-medium">{card.title}</h4>
              <div className="text-xl font-bold">{card.value}</div>
              <p className="text-xs opacity-90">{card.subtitle}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Charts */}
      <div className="max-w-6xl p-8 mx-auto bg-white shadow dark:bg-gray-900 rounded-2xl">
        {chartsLoading ? (
          <div className="py-12 text-lg text-center text-gray-500 dark:text-gray-400">
            Loading charts...
          </div>
        ) : chartsError ? (
          <div className="py-12 text-lg text-center text-red-600 dark:text-red-400">
            {chartsError}
          </div>
        ) : (
          charts && (
            <>
              <div className="grid grid-cols-1 gap-6 mb-6 lg:grid-cols-2">
                <div className="p-4 bg-white rounded-lg shadow dark:bg-gray-800">
                  <h3 className="mb-2 text-sm font-medium dark:text-white">
                    Daily Revenue Trend
                  </h3>
                  {dailyRevenueLineData && (
                    <Line
                      data={dailyRevenueLineData}
                      options={{ responsive: true }}
                      height={100}
                    />
                  )}
                </div>
                <div className="p-4 bg-white rounded-lg shadow dark:bg-gray-800">
                  <h3 className="mb-2 text-sm font-medium dark:text-white">
                    Monthly Revenue Trend
                  </h3>
                  {monthlyRevenueLineData && (
                    <Line
                      data={monthlyRevenueLineData}
                      options={{ responsive: true }}
                      height={100}
                    />
                  )}
                </div>
              </div>
              {weeklyRevenueBarData && (
                <div className="p-4 bg-white rounded-lg shadow dark:bg-gray-800">
                  <h3 className="mb-2 text-sm font-medium dark:text-white">
                    Weekly Revenue Breakdown
                  </h3>
                  <Bar
                    data={weeklyRevenueBarData}
                    options={{ responsive: true }}
                    height={80}
                  />
                </div>
              )}
            </>
          )
        )}
        {lastUpdated && (
          <div className="mt-6 text-xs text-center text-gray-400">
            Last updated: {lastUpdated}
          </div>
        )}
      </div>
    </div>
  );
}
