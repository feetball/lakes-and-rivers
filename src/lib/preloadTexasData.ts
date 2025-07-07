
const { cacheTexasStations, cacheTexasWaterways } = require('./redis');


async function preloadTexasData() {
  // Preload all Texas USGS stations
  await cacheTexasStations();
  // Preload all Texas waterways
  await cacheTexasWaterways();
}

// If run directly (node preloadTexasData.js), execute preload
if (require.main === module) {
  preloadTexasData().then(() => {
    console.log('Texas data preloaded into Redis.');
    process.exit(0);
  }).catch((err) => {
    console.error('Preload failed:', err);
    process.exit(1);
  });
}
