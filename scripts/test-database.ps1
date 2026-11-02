$ErrorActionPreference='Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if (-not (Test-Path '.env')) { throw 'Run setup first.' }
# This creates a separate database; normal pharmacy records are never touched by test fixtures.
docker compose exec -T mysql sh -c 'MYSQL_PWD=$MYSQL_ROOT_PASSWORD mysql -u root -e "CREATE DATABASE IF NOT EXISTS meditrack_test; GRANT ALL ON meditrack_test.* TO meditrack@''%'';"'
if($LASTEXITCODE -ne 0){throw 'Could not create test database'}
$schema=(Get-Content -Raw database/01-schema.sql).Replace('CREATE DATABASE IF NOT EXISTS meditrack;','').Replace('USE meditrack;','USE meditrack_test;')
$rules=(Get-Content -Raw database/02-rules.sql).Replace('USE meditrack;','USE meditrack_test;')
$schema | docker compose exec -T mysql sh -c 'MYSQL_PWD=$MYSQL_ROOT_PASSWORD mysql -u root'
if($LASTEXITCODE -ne 0){throw 'Test schema installation failed; use a fresh meditrack_test database'}
$rules | docker compose exec -T mysql sh -c 'MYSQL_PWD=$MYSQL_ROOT_PASSWORD mysql -u root'
if($LASTEXITCODE -ne 0){throw 'Test rules installation failed'}
# Install the same definer-owned lock helpers used by checkout.
$locks = ((Get-Content -Raw database/04-rbac.sql) -split 'CREATE ROLE IF NOT EXISTS',2)[0].Replace('USE meditrack;','USE meditrack_test;')
$locks | docker compose exec -T mysql sh -c 'MYSQL_PWD=$MYSQL_ROOT_PASSWORD mysql -u root'
if($LASTEXITCODE -ne 0){throw 'Test lock routine installation failed'}
node --env-file=.env -e "process.env.TEST_DATABASE_URL=process.env.DATABASE_URL.replace(/meditrack$/,'meditrack_test');const result=require('child_process').spawnSync('node',['--import','tsx','--test','tests/integration.test.ts'],{stdio:'inherit',env:process.env});process.exit(result.status??1);"
if($LASTEXITCODE -ne 0){throw 'Integration tests failed'}
