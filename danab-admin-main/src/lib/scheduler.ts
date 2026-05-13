// On Vercel serverless, setInterval does NOT work because functions are ephemeral.
// Station stats are now updated via Vercel Cron Job (vercel.json → /api/cron/station-stats)
// which runs every 10 minutes automatically.

export function startScheduler() {
  console.log(
    "⏱️ Station stats: using Vercel Cron Job (every 10 min) — no in-process scheduler needed",
  );
}
