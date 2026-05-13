import { normalizeBatteryId } from "./batteryId";

export type ActiveRentalRow = {
  id: string;
  waafiConfirmedPhoneNumber?: string;
  battery_id?: string;
  requestedPhoneNumber?: string;
  phoneNumber?: string;
  timestamp?: any;
  imei?: string;
  amount?: number;
  unlockStatus?: string | null;
  doc?: any;
  [key: string]: any;
};

export function getRentalTimestampMillis(value: any): number {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?._seconds === "number") return value._seconds * 1000;
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  if (value instanceof Date) return value.getTime();

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function getSortableRentalId(value: any): string {
  return String(value?.id || "");
}

function normalizePhoneDigits(value: any): string {
  return String(value || "").replace(/\D/g, "");
}

export function getTrustedRentalPhone(value: any): string {
  return String(
    value?.requestedPhoneNumber ||
    value?.waafiConfirmedPhoneNumber ||
      value?.phoneNumber ||
      "",
  );
}

export function hasRentalPhoneMismatch(value: any): boolean {
  const requestedPhone = normalizePhoneDigits(value?.requestedPhoneNumber);
  const waafiConfirmedPhone = normalizePhoneDigits(
    value?.waafiConfirmedPhoneNumber,
  );

  return Boolean(
    requestedPhone &&
      waafiConfirmedPhone &&
      requestedPhone !== waafiConfirmedPhone,
  );
}

export function compareRentalPriorityDesc(a: any, b: any): number {
  const timestampDiff =
    getRentalTimestampMillis(b?.timestamp) - getRentalTimestampMillis(a?.timestamp);

  if (timestampDiff !== 0) {
    return timestampDiff;
  }

  return getSortableRentalId(b).localeCompare(getSortableRentalId(a));
}

export function groupActiveRentalsByBattery<T extends { battery_id?: string }>(
  rentals: T[],
) {
  const groups = new Map<
    string,
    {
      batteryId: string;
      primary: T;
      rentals: T[];
      duplicates: T[];
    }
  >();

  for (const rental of [...rentals].sort(compareRentalPriorityDesc)) {
    const batteryId = normalizeBatteryId(rental?.battery_id);
    if (!batteryId) continue;

    const existing = groups.get(batteryId);
    if (!existing) {
      groups.set(batteryId, {
        batteryId,
        primary: rental,
        rentals: [rental],
        duplicates: [],
      });
      continue;
    }

    existing.rentals.push(rental);
    existing.duplicates.push(rental);
  }

  return Array.from(groups.values());
}

export function dedupeActiveRentalsByBattery<T extends { battery_id?: string }>(
  rentals: T[],
) {
  const groups = groupActiveRentalsByBattery(rentals);
  const latestByBattery = new Map<string, T>();
  const duplicates: T[] = [];

  for (const group of groups) {
    latestByBattery.set(group.batteryId, group.primary);
    duplicates.push(...group.duplicates);
  }

  return {
    latestByBattery,
    winners: Array.from(latestByBattery.values()),
    duplicates,
  };
}
