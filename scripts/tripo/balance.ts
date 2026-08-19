import { balance } from './lib.ts';

const b = await balance();
console.log(`Tripo credits — available: ${b.balance}, frozen: ${b.frozen}`);
