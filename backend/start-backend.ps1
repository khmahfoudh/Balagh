# Lance le backend Balagh MR sur http://localhost:8080 (Swagger : /swagger-ui.html)
# Usage (PowerShell, depuis le dossier backend) :  .\start-backend.ps1
# Prérequis : PostgreSQL démarré, fichier backend\.env rempli (voir .env.example), JDK 21 ou plus.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

# Le projet vise Java 21 : on prend le JDK le plus récent installé dans ~/.jdks (ex. openjdk-25)
$jdk = Get-ChildItem "$env:USERPROFILE\.jdks" -Directory -Filter 'openjdk-*' -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match 'openjdk-(\d+)' -and [int]$Matches[1] -ge 21 } |
    Sort-Object Name -Descending | Select-Object -First 1
if ($jdk) {
    $env:JAVA_HOME = $jdk.FullName
    Write-Host "JDK utilisé : $($jdk.FullName)"
} else {
    Write-Host "Aucun JDK 21+ trouvé dans ~/.jdks : JAVA_HOME actuel = $env:JAVA_HOME"
}

if (-not (Test-Path '.env')) {
    Write-Host "Fichier .env manquant : copiez .env.example en .env et remplissez-le." -ForegroundColor Red
    exit 1
}

# clean : Maven recompile tout. Sinon il peut réutiliser des .class écrits par un éditeur (extension Java de
# VS Code) et le backend plante au démarrage avec « Unresolved compilation problems ».
.\mvnw.cmd clean spring-boot:run
