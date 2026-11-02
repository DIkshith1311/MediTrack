import { reindex } from '../lib/vector';
import { withDatabaseRole,closePools } from '../lib/db';
withDatabaseRole('admin',reindex).then(console.log).catch(e=>{console.error(e.message);process.exitCode=1;}).finally(closePools);
