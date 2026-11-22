import { createApp } from '../backend/src/app.js';
import { Store } from '../backend/src/store.js';
import { seedDemoData } from '../backend/src/seed.js';

const store = new Store();
seedDemoData(store);

const app = createApp(store);

export default function handler(req, res) {
  return app(req, res);
}
