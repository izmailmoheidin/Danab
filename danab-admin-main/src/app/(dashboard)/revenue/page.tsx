"use client";

import { useEffect, useState } from "react";
import { Line, Bar, Pie } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { apiService } from "@/lib/api";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
);

export default function RevenuePage() {
  const [chartData, setChartData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    apiService
      .getAllCharts()
      .then((response) => {
        setChartData(response.data);
        setLoading(false);
      })
      .catch((err: any) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-lg font-semibold dark:text-white">
        Loading...
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-center justify-center h-64 font-semibold text-red-500">
        Error: {error}
      </div>
    );
  }
  if (!chartData) return null;

  const lineData = {
    labels: chartData.dailyRevenue?.labels || [],
    datasets: [
      {
        label: "Daily Revenue ($)",
        data: chartData.dailyRevenue?.data || [],
        borderColor: "#3b82f6",
        backgroundColor: "rgba(59, 130, 246, 0.2)",
        tension: 0.4,
        fill: true,
      },
    ],
  };

  const barData = {
    labels: chartData.weeklyRevenue?.labels || [],
    datasets: [
      {
        label: "Weekly Revenue",
        data: chartData.weeklyRevenue?.data || [],
        backgroundColor: "#6366f1",
        borderRadius: 8,
      },
    ],
  };

  const pieData = {
    labels: ["Daily", "Weekly", "Monthly"],
    datasets: [
      {
        label: "Revenue by Period",
        data: [
          (chartData.dailyRevenue?.data || []).reduce(
            (a: number, b: number) => a + b,
            0,
          ),
          (chartData.weeklyRevenue?.data || []).reduce(
            (a: number, b: number) => a + b,
            0,
          ),
          (chartData.monthlyRevenue?.data || []).reduce(
            (a: number, b: number) => a + b,
            0,
          ),
        ],
        backgroundColor: ["#3b82f6", "#10b981", "#f59e42"],
        borderWidth: 1,
      },
    ],
  };

  const monthlyLineData = {
    labels: chartData.monthlyRevenue?.labels || [],
    datasets: [
      {
        label: "Monthly Revenue ($)",
        data: chartData.monthlyRevenue?.data || [],
        borderColor: "#f59e42",
        backgroundColor: "rgba(245, 158, 66, 0.2)",
        tension: 0.4,
        fill: true,
      },
    ],
  };

  return (
    <div className="p-4">
      <div className="flex flex-col mb-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-2xl font-bold dark:text-white">
            Revenue Analytics
          </h3>
          <p className="text-gray-500 dark:text-gray-400">
            Detailed revenue analysis and reporting
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 mb-6 lg:grid-cols-2">
        <div className="p-6 bg-white rounded-lg shadow dark:bg-gray-800">
          <h3 className="mb-4 text-lg font-semibold dark:text-white">
            Daily Revenue Trend
          </h3>
          <Line
            data={lineData}
            options={{
              responsive: true,
              plugins: { legend: { display: true } },
            }}
            height={120}
          />
        </div>
        <div className="p-6 bg-white rounded-lg shadow dark:bg-gray-800">
          <h3 className="mb-4 text-lg font-semibold dark:text-white">
            Monthly Revenue Trend
          </h3>
          <Line
            data={monthlyLineData}
            options={{
              responsive: true,
              plugins: { legend: { display: true } },
            }}
            height={120}
          />
        </div>
      </div>
      <div className="p-6 mb-6 bg-white rounded-lg shadow dark:bg-gray-800">
        <h3 className="mb-4 text-lg font-semibold dark:text-white">
          Revenue by Period
        </h3>
        <Pie
          data={pieData}
          options={{
            responsive: true,
            plugins: { legend: { position: "bottom" } },
          }}
        />
      </div>
      <div className="p-6 bg-white rounded-lg shadow dark:bg-gray-800">
        <h3 className="mb-4 text-lg font-semibold dark:text-white">
          Weekly Revenue Breakdown
        </h3>
        <Bar
          data={barData}
          options={{
            responsive: true,
            plugins: { legend: { display: false } },
          }}
          height={80}
        />
      </div>
    </div>
  );
}
