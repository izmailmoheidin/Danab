"use client";

import { useMemo } from "react";
import { useDataStore } from "@/stores/useDataStore";

interface TransactionsProps {
  showAll?: boolean;
  onViewAll?: () => void;
}

export default function Transactions({
  showAll = false,
  onViewAll,
}: TransactionsProps) {
  const { transactions, stations, loading, error } = useDataStore();

  const stationNameByKey = useMemo(() => {
    const map: Record<string, string> = {};
    stations.forEach((station: any) => {
      if (station?.imei) map[station.imei] = station.name || station.imei;
      if (station?.id) map[station.id] = station.name || station.id;
      if (station?.name) map[station.name] = station.name;
    });
    return map;
  }, [stations]);

  const getStationName = (stationCode: string) => {
    if (!stationCode) return "";
    return stationNameByKey[stationCode] || "";
  };

  const formatTimestamp = (timestamp: any) => {
    if (!timestamp || !timestamp._seconds) return "Unknown time";
    const date = new Date(timestamp._seconds * 1000);
    const now = new Date();
    const diffInHours = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60),
    );
    if (diffInHours < 1) {
      const diffInMinutes = Math.floor(
        (now.getTime() - date.getTime()) / (1000 * 60),
      );
      return `${diffInMinutes} minutes ago`;
    } else if (diffInHours < 24) {
      return `${diffInHours} hours ago`;
    } else {
      return `${Math.floor(diffInHours / 24)} days ago`;
    }
  };

  const getStatusClasses = (status: string) => {
    const statusMap: Record<string, string> = {
      rented: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      returned:
        "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      overdue: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
      completed:
        "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    };
    return (
      statusMap[status] ||
      "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
    );
  };

  const formatAmount = (amount: number) => `$${amount.toFixed(2)}`;

  const formatPhoneNumber = (phone: string) => {
    if (!phone) return "N/A";
    const cleaned = phone.replace(/\D/g, "");
    if (cleaned.length === 9) return `+(252) ${cleaned}`;
    return phone;
  };

  const visibleTransactions = useMemo(
    () => (showAll ? transactions : transactions.slice(0, 3)),
    [showAll, transactions],
  );

  if (loading) {
    return (
      <div className="transition-colors duration-300 bg-white rounded-lg shadow dark:bg-gray-800">
        <div className="p-4 border-b dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold dark:text-white">
              Recent Transactions
            </h3>
          </div>
        </div>
        <div className="p-8 text-center">
          <div className="w-8 h-8 mx-auto border-b-2 border-blue-600 rounded-full animate-spin"></div>
          <p className="mt-2 text-gray-500 dark:text-gray-400">
            Loading transactions...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="transition-colors duration-300 bg-white rounded-lg shadow dark:bg-gray-800">
        <div className="p-4 border-b dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold dark:text-white">
              Recent Transactions
            </h3>
          </div>
        </div>
        <div className="p-8 text-center">
          <div className="mb-2 text-red-500 dark:text-red-400">
            &#9888;&#65039;
          </div>
          <p className="text-red-600 dark:text-red-400">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 text-sm font-medium text-blue-600 dark:text-blue-400"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="transition-colors duration-300 bg-white rounded-lg shadow dark:bg-gray-800">
      <div className="p-4 border-b dark:border-gray-700">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold dark:text-white">
            Recent Transactions
          </h3>
          {!showAll && transactions.length > 3 && (
            <button
              className="text-sm font-medium text-blue-600 dark:text-blue-400"
              onClick={onViewAll}
            >
              View All
            </button>
          )}
        </div>
      </div>
      <div className="divide-y dark:divide-gray-700">
        {visibleTransactions.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            No transactions found
          </div>
        ) : (
          visibleTransactions.map((transaction: any) => (
            <div
              key={transaction.id}
              className="p-4 transition-colors duration-200 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium dark:text-white">
                    ID: {transaction.id}
                  </p>
                  <div className="flex items-center mt-1">
                    <span
                      className={`${getStatusClasses(transaction.status)} text-xs font-medium px-2 py-0.5 rounded-full`}
                    >
                      {transaction.status}
                    </span>
                    <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                      {formatTimestamp(transaction.timestamp)}
                    </span>
                  </div>
                </div>
                <span className="font-bold dark:text-white">
                  {formatAmount(transaction.amount)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-3">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Customer
                  </p>
                  <p className="font-medium dark:text-white">
                    {formatPhoneNumber(transaction.phoneNumber)}
                  </p>
                  <p className="text-sm dark:text-gray-300">
                    Power Bank {transaction.battery_id}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Station
                  </p>
                  <p className="font-medium dark:text-white">
                    {getStationName(transaction.stationName) ||
                      transaction.stationName ||
                      "Unknown Station"}
                  </p>
                  <p className="text-sm">
                    Slot:{" "}
                    <span className="text-blue-600 dark:text-blue-400">
                      {transaction.slot_id}
                    </span>
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
