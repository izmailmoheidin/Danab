import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/firebase-admin';
import { authenticateRequest } from '@/lib/auth';
import {
  ActiveRentalRow,
  groupActiveRentalsByBattery,
  getRentalTimestampMillis,
  getTrustedRentalPhone,
  hasRentalPhoneMismatch,
} from '@/lib/activeRentals';
import { loadOfficialActiveRentals } from '@/lib/batteryState';
import { normalizeBatteryId } from '@/lib/batteryId';
import { updateSingleStation } from '@/lib/stationStatsJob';

const OVERDUE_HOURS = 5;

function buildLiveStationView(station: any, rentalGroups: any[]) {
  const sourceSlots = Array.isArray(station?.batteries) ? station.batteries : [];
  const slots = sourceSlots.map((slot: any) => {
    const normalizedStatus = String(slot?.status || '').toLowerCase();
    const isVirtualRentalSlot =
      normalizedStatus === 'rented' || normalizedStatus === 'overdue';

    if (!isVirtualRentalSlot) {
      return {
        ...slot,
        rented: false,
        phoneNumber: '',
        rentedAt: null,
        amount: 0,
      };
    }

    return {
      ...slot,
      battery_id: null,
      level: null,
      status: 'Empty',
      rented: false,
      phoneNumber: '',
      rentedAt: null,
      amount: 0,
    };
  });

  let rentedCount = 0;
  let overdueCount = 0;
  const now = Date.now();

  for (const group of [...rentalGroups].sort((a, b) => {
    return (
      getRentalTimestampMillis(b.primary?.timestamp) -
      getRentalTimestampMillis(a.primary?.timestamp)
    );
  })) {
    const rental = group.primary;
    const assignedSlotIndex = slots.findIndex((slot: any) => {
      return (
        String(slot?.status || '').toLowerCase() === 'empty' &&
        !slot?.rented &&
        !slot?.battery_id
      );
    });

    if (assignedSlotIndex === -1) {
      continue;
    }

    const activeRentals = group.rentals.map((entry: any) => ({
      id: entry.id || null,
      requestedPhoneNumber: entry.requestedPhoneNumber || '',
      waafiConfirmedPhoneNumber: entry.waafiConfirmedPhoneNumber || '',
      storedPhoneNumber: entry.phoneNumber || '',
      phoneNumber: getTrustedRentalPhone(entry),
      phoneNumberMismatch: hasRentalPhoneMismatch(entry),
      phoneAuthority: entry.phoneAuthority || null,
      rentedAt: entry.timestamp || null,
      amount: entry.amount || 0,
      imei: entry.imei || null,
      unlockStatus: entry.unlockStatus || null,
    }));
    const overdueSource = activeRentals
      .map((entry: any) => getRentalTimestampMillis(entry.rentedAt))
      .filter((value: number) => value > 0);
    const rentedAtMs =
      overdueSource.length > 0 ? Math.min(...overdueSource) : 0;
    const isOverdue =
      rentedAtMs > 0 && now - rentedAtMs > OVERDUE_HOURS * 60 * 60 * 1000;

    slots[assignedSlotIndex] = {
      ...slots[assignedSlotIndex],
      battery_id: group.batteryId || normalizeBatteryId(rental.battery_id),
      level: null,
      status: isOverdue ? 'Overdue' : 'Rented',
      rented: true,
      requestedPhoneNumber: rental.requestedPhoneNumber || '',
      waafiConfirmedPhoneNumber: rental.waafiConfirmedPhoneNumber || '',
      storedPhoneNumber: rental.phoneNumber || '',
      phoneNumber: getTrustedRentalPhone(rental),
      phoneNumberMismatch: hasRentalPhoneMismatch(rental),
      phoneAuthority: rental.phoneAuthority || null,
      rentedAt: rental.timestamp || null,
      amount: rental.amount || 0,
      rentalId: rental.id || null,
      unlockStatus: rental.unlockStatus || null,
      activeRentals,
      activeRentalCount: activeRentals.length,
      hasDuplicateRentals: activeRentals.length > 1,
    };

    rentedCount++;
    if (isOverdue) {
      overdueCount++;
    }
  }

  const availableCount = slots.filter((slot: any) => {
    return String(slot?.status || '').toLowerCase() === 'online';
  }).length;

  return {
    ...station,
    batteries: slots,
    totalSlots: slots.length,
    availableCount,
    rentedCount,
    overdueCount,
  };
}

export async function GET(req: NextRequest, { params }: { params: { imei: string } }) {
  const auth = authenticateRequest(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { imei } = params;
    const fresh = req.nextUrl.searchParams.get('fresh') === '1';

    const loadStation = async () => {
      const doc = await db.collection('station_stats').doc(imei).get();

      if (!doc.exists) {
        return {
          status: 404,
          body: { error: `No stats found for station ${imei}` },
        };
      }

      const officialActiveRentals: ActiveRentalRow[] =
        await loadOfficialActiveRentals();
      const rentalGroups = groupActiveRentalsByBattery(officialActiveRentals);

      const station = buildLiveStationView(
        doc.data(),
        rentalGroups.filter((group: any) => group.primary?.imei === imei),
      );

      return {
        status: 200,
        body: { station },
      };
    };

    if (fresh) {
      await updateSingleStation(imei);
    }

    const result = await loadStation();

    return NextResponse.json(result.body, {
      status: result.status,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (err: any) {
    console.error(`Get Station Stats Error:`, err.message);
    return NextResponse.json({ error: 'Failed to fetch station stats' }, { status: 500 });
  }
}
