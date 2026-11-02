import { readFile,writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import mysql from 'mysql2/promise';

function splitSql(source: string) {
  let delimiter=';',buffer='';
  const result:string[]=[];
  for(const line of source.split(/\r?\n/)) {
    if(line.trim().startsWith('--'))continue;
    if(line.trim().toUpperCase().startsWith('DELIMITER ')){delimiter=line.trim().slice(10);continue;}
    buffer+=line+'\n';
    while(buffer.includes(delimiter)) {
      const end=buffer.indexOf(delimiter),statement=buffer.slice(0,end).trim();
      if(statement)result.push(statement);
      buffer=buffer.slice(end+delimiter.length);
    }
  }
  return result;
}
async function runSql(statements: string[]) {
  if (process.env.MIGRATION_DATABASE_URL) {
    const connection = await mysql.createConnection(process.env.MIGRATION_DATABASE_URL);
    try { for (const statement of statements) await connection.query(statement); }
    finally { await connection.end(); }
    return;
  }
  // Passwords enter the container through its existing environment, never command arguments.
  const result = spawnSync('docker',['compose','exec','-T','mysql','sh','-c',
    'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --user=root --batch --raw'],
    { input: 'DELIMITER $$\n'+statements.join('$$\n')+'$$\nDELIMITER ;\n',encoding:'utf8',maxBuffer:4*1024*1024 });
  if (result.error || result.status !== 0) {
    const code = result.stderr?.match(/ERROR\s+(\d+)\s+\(([A-Z0-9]+)\)/);
    const detail = code ? 'MySQL error '+code[1]+' ('+code[2]+')' : 'Docker or MySQL could not be reached';
    throw new Error('Migration failed: '+detail+'. Check MySQL service readiness and administrator privileges.');
  }
}
async function main() {
  const original = await readFile('.env','utf8');
  const legacy = process.env.DATABASE_URL ?? process.env.SEED_DATABASE_URL;
  if (!legacy) throw new Error('Load your existing .env using node --env-file=.env.');
  const base = new URL(legacy);
  if (base.pathname !== '/meditrack') throw new Error('This additive update targets the meditrack database only.');
  const additions: Record<string,string> = {};
  const accounts: { role:string;account:string;password:string }[] = [];
  for (const role of ['auth','admin','staff']) {
    const key = 'MYSQL_'+role.toUpperCase()+'_PASSWORD';
    const previous = process.env[role.toUpperCase()+'_DATABASE_URL'];
    const password = process.env[key] || (previous ? decodeURIComponent(new URL(previous).password) : '') || randomBytes(24).toString('hex');
    const account = 'meditrack_'+role;
    const url = new URL(base);
    url.username=account;url.password=password;
    additions[key]=password;
    additions[role.toUpperCase()+'_DATABASE_URL']=url.toString();
    accounts.push({role,account,password});
  }
  const advanced = splitSql(await readFile('database/05-advanced-queries.sql','utf8'));
  // Only install the CTE-backed view here. The following SELECT examples are for demonstration.
  const view = advanced.filter(statement => /^(USE |CREATE OR REPLACE )/i.test(statement));
  const grants = splitSql(await readFile('database/04-rbac.sql','utf8'));
  const users = accounts.flatMap(({role,account,password}) => [
    'CREATE USER IF NOT EXISTS '+mysql.escape(account)+"@'%' IDENTIFIED BY "+mysql.escape(password),
    'ALTER USER '+mysql.escape(account)+"@'%' IDENTIFIED BY "+mysql.escape(password),
    'GRANT '+mysql.escape('meditrack_'+role+'_role')+' TO '+mysql.escape(account)+"@'%'",
    'SET DEFAULT ROLE '+mysql.escape('meditrack_'+role+'_role')+' TO '+mysql.escape(account)+"@'%'"
  ]);
  await runSql([...view,...grants,...users]);
  let content=original;
  for (const [key,value] of Object.entries(additions)) {
    const line=key+'='+value;
    const expression=new RegExp('^'+key+'=.*$','m');
    content=expression.test(content)?content.replace(expression,()=>line):content.trimEnd()+'\n'+line+'\n';
  }
  await writeFile('.env',content,{mode:0o600});
  console.log('Installed CTE view, MySQL roles and three runtime accounts. Updated .env; restart Next.js.');
  console.log('Existing stock, users and invoices were retained. Settings were saved in .env.');
}
main().catch(error=>{console.error(error.code ? 'Migration failed ('+error.code+'). Check service availability and administrator privileges.' : error.message);process.exitCode=1;});
