import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
loadEnv({ path: resolve(process.cwd(), '.env.local') });
const { seedTestData } = await import('./seed.ts');
const r = await seedTestData();
console.log(JSON.stringify(r, null, 2));
