/**
 * KeyShield Multisig Escrow
 * Main entry point - starts both Bot and API server
 */

require('dotenv').config();

const { startBot } = require('./bot/index');
const { startServer } = require('./api/index');

async function start() {
  console.log('');
  console.log('╔═══════════════════════════════════════════════╗');
  console.log('║   KeyShield Multisig Escrow System            ║');
  console.log('║   Anonymous crypto escrow on TRON             ║');
  console.log('╚═══════════════════════════════════════════════╝');
  console.log('');

  try {
    // Start both services
    await Promise.all([
      startBot(),
      startServer()
    ]);

    console.log('\n✅ All services started successfully!\n');
  } catch (error) {
    console.error('\n❌ Failed to start services:', error);
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

// Start the system
start();
