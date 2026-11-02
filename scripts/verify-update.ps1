param([switch]$Screenshots)
$ErrorActionPreference='Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
function Invoke-Check([string]$Name,[scriptblock]$Action) {
  Write-Host "Checking: $Name"
  & $Action
  if ($LASTEXITCODE -ne 0) { throw "$Name failed" }
}
Invoke-Check 'TypeScript' { npm.cmd run typecheck }
Invoke-Check 'Unit and role-isolation tests' { npm.cmd test }
Invoke-Check 'Real MySQL role enforcement' { node --env-file=.env --import tsx --test tests/rbac.integration.test.ts }
Invoke-Check 'Real embedding and vector RUD' { node --env-file=.env --import tsx scripts/verify-vector.ts }
Invoke-Check 'Production build' { npm.cmd run build }
if($Screenshots) {
  # Keep npm run dev running in a second terminal before selecting this option.
  Invoke-Check 'Live screenshots' { node --env-file=.env --import tsx scripts/capture-screenshots.ts }
}
Write-Host 'All selected checks passed.'
