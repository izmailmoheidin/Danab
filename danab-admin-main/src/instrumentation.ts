export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Import scheduler and start it on server boot
    const { startScheduler } = await import('./lib/scheduler');
    startScheduler();
  }
}
