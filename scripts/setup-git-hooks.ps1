$ErrorActionPreference = "Stop"

if (-not (Test-Path ".git")) {
  Write-Error "Run this script from a git repository root."
  exit 1
}

git config core.hooksPath .githooks
git config commit.template .gitmessage

Write-Host "Configured git hooks path to .githooks"
Write-Host "Configured commit template to .gitmessage"
