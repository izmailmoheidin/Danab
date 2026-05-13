// Somalia timezone offset (UTC+3)
const SOMALIA_OFFSET_HOURS = 3;

export function getDayBoundsUTC3() {
  const now = new Date();
  const somaliaTime = new Date(
    now.getTime() + SOMALIA_OFFSET_HOURS * 60 * 60 * 1000,
  );

  const somaliaYear = somaliaTime.getUTCFullYear();
  const somaliaMonth = somaliaTime.getUTCMonth();
  const somaliaDay = somaliaTime.getUTCDate();

  const startUtc = new Date(
    Date.UTC(somaliaYear, somaliaMonth, somaliaDay) -
      SOMALIA_OFFSET_HOURS * 60 * 60 * 1000,
  );
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);
  const dateStr = `${somaliaYear}-${String(somaliaMonth + 1).padStart(2, "0")}-${String(somaliaDay).padStart(2, "0")}`;

  return { startUtc, endUtc, dateStr };
}

export function getMonthBoundsUTC3() {
  const now = new Date();
  const somaliaTime = new Date(
    now.getTime() + SOMALIA_OFFSET_HOURS * 60 * 60 * 1000,
  );

  const somaliaYear = somaliaTime.getUTCFullYear();
  const somaliaMonth = somaliaTime.getUTCMonth();

  const startUtc = new Date(
    Date.UTC(somaliaYear, somaliaMonth, 1) -
      SOMALIA_OFFSET_HOURS * 60 * 60 * 1000,
  );
  const endUtc = new Date(
    Date.UTC(somaliaYear, somaliaMonth + 1, 1) -
      SOMALIA_OFFSET_HOURS * 60 * 60 * 1000,
  );
  const monthKey = `${somaliaYear}-${String(somaliaMonth + 1).padStart(2, "0")}`;

  return { startUtc, endUtc, monthKey };
}

// Apply revenue cuts: subtract 1% Waafi fee per transaction
// The amount in DB is the gross charge (varies: $0.50, $0.75, $1.00, etc.) — Waafi takes 1%
export function applyRevenueCuts(grossAmount: number): number {
  const waafiFee = grossAmount * 0.01;
  const net = grossAmount - waafiFee;
  return Math.max(0, parseFloat(net.toFixed(4)));
}

export function calculateUniqueRevenue(docs: any[]) {
  let total = 0;
  const uniqueTransactions = new Set<string>();

  docs.forEach((doc: any) => {
    const data = doc.data ? doc.data() : doc;
    const txId = data.transactionId || doc.id || Math.random().toString();

    if (!uniqueTransactions.has(txId)) {
      uniqueTransactions.add(txId);
      let amount = 0;
      if (data.amount !== undefined && data.amount !== null) {
        amount =
          typeof data.amount === "number"
            ? data.amount
            : parseFloat(data.amount);
      }
      if (!isNaN(amount) && amount > 0) {
        total += applyRevenueCuts(amount);
      }
    }
  });

  return {
    total: parseFloat(total.toFixed(2)),
    count: uniqueTransactions.size,
  };
}
