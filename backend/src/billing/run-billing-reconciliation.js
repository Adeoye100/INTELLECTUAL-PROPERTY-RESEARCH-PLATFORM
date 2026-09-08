import { loadConfigFromEnv } from '../config.js';
import { createSystem } from '../system.js';

async function main() {
  const config = loadConfigFromEnv(process.env);
  if (!config.paystackEnabled) {
    console.log(JSON.stringify({ message: 'PAYSTACK_ENABLED is false. Reconciliation skipped.', processed: 0, reconciled: 0, failed: 0, pending: 0, errors: 0 }));
    process.exit(0);
  }
  const system = await createSystem(config);
  try {
    const stats = await system.billingService.reconcilePendingTransactions({ olderThanMinutes: 5, limit: 50 });
    console.log(JSON.stringify(stats, null, 2));
  } finally {
    await system.close();
  }
}

main().catch((err) => {
  console.error('Billing reconciliation failed:', err.message);
  process.exit(1);
});
