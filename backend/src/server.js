import path from 'node:path';
import { createApp } from './app.js';
import { Store } from './store.js';
import { seedDemoData } from './seed.js';

const port = Number(process.env.PORT) || 3001;
// DATA_FILE=none keeps everything in memory only.
const dataFile = process.env.DATA_FILE ?? path.resolve('data', 'db.json');
const store = new Store({ file: dataFile === 'none' ? undefined : dataFile });

// Demo data: `--seed` flag (cross-platform) or SEED_DEMO=true (used by Docker).
if ((process.argv.includes('--seed') || process.env.SEED_DEMO === 'true') && seedDemoData(store)) {
  console.log('Seeded demo movies and cinemas');
}

const server = createApp(store).listen(port, () => {
  console.log(`Doomsday Ready API listening on http://localhost:${port}/api`);
  console.log(dataFile === 'none' ? 'Storage: in memory' : `Storage: ${dataFile}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
