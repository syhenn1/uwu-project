import { getMasterLogRows } from './lib/masterSheet';
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

getMasterLogRows().then(rows => {
  console.log("FIRST ROW DUMP:");
  console.log(rows[0]);
});
