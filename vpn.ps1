param(
  [Parameter(Position=0)]
  [string]$Command = "status",
  [Parameter(Position=1)]
  [ValidateSet("tcp","udp")]
  [string]$Protocol = "tcp"
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ConfigTcp = Join-Path $ScriptDir "client-openvpn-tcp.ovpn"
$ConfigUdp = Join-Path $ScriptDir "client-openvpn-udp.ovpn"
$ConfigLegacy = Join-Path $ScriptDir "client-openvpn.ovpn"
$PidFile = Join-Path $env:TEMP "openvpn-client.pid"
$LogFile = Join-Path $env:TEMP "openvpn-client.log"

function Resolve-OpenVpnBinary {
  if ($env:OPENVPN_BIN -and (Test-Path $env:OPENVPN_BIN)) {
    return $env:OPENVPN_BIN
  }

  $cmd = Get-Command openvpn -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }

  $candidates = @(
    "C:\Program Files\OpenVPN\bin\openvpn.exe",
    "C:\Program Files (x86)\OpenVPN\bin\openvpn.exe"
  )

  foreach ($path in $candidates) {
    if (Test-Path $path) {
      return $path
    }
  }

  throw "openvpn binary not found. Install OpenVPN and ensure openvpn.exe is in PATH."
}

function Get-ConfigPath([string]$Proto) {
  if ($Proto -eq "udp") {
    if (Test-Path $ConfigUdp) { return $ConfigUdp }
  } else {
    if (Test-Path $ConfigTcp) { return $ConfigTcp }
  }

  if (Test-Path $ConfigLegacy) {
    return $ConfigLegacy
  }

  throw "No client profile found for protocol '$Proto'."
}

function Get-PublicIp {
  $endpoints = @(
    "https://checkip.amazonaws.com",
    "https://api.ipify.org",
    "https://ifconfig.me/ip",
    "https://icanhazip.com"
  )

  foreach ($url in $endpoints) {
    try {
      $ip = (Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 5).Content.Trim()
      if ($ip -match '^\d+\.\d+\.\d+\.\d+$') {
        return $ip
      }
    } catch {
      continue
    }
  }

  return "unavailable"
}

function Get-OpenVpnPid {
  if (Test-Path $PidFile) {
    $pidText = (Get-Content $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1).Trim()
    if ($pidText -match '^\d+$') {
      $proc = Get-Process -Id ([int]$pidText) -ErrorAction SilentlyContinue
      if ($proc -and $proc.ProcessName -match "openvpn") {
        return [int]$pidText
      }
    }
  }

  $procFallback = Get-CimInstance Win32_Process -Filter "Name='openvpn.exe'" |
    Where-Object { $_.CommandLine -match "client-openvpn" } |
    Select-Object -First 1

  if ($procFallback) {
    return [int]$procFallback.ProcessId
  }

  return $null
}

function Is-Connected {
  return ($null -ne (Get-OpenVpnPid))
}

function Wait-ForConnect {
  $deadline = (Get-Date).AddSeconds(15)
  while ((Get-Date) -lt $deadline) {
    if (Test-Path $LogFile) {
      $log = Get-Content $LogFile -Tail 40 -ErrorAction SilentlyContinue
      if ($log -match "Initialization Sequence Completed") {
        return $true
      }
      if ($log -match "AUTH_FAILED|TLS Error|Connection refused|SIGTERM|decryption-error") {
        return $false
      }
    }
    Start-Sleep -Seconds 1
  }
  return $false
}

function Show-Status {
  $pid = Get-OpenVpnPid
  if ($pid) {
    Write-Host "VPN connected (pid $pid)" -ForegroundColor Green
    Write-Host "Public IP : $(Get-PublicIp)"
    Write-Host "Log       : $LogFile"
  } else {
    Write-Host "VPN disconnected" -ForegroundColor Yellow
    Write-Host "Public IP : $(Get-PublicIp)"
  }
}

function Connect-Vpn([string]$Proto) {
  if (Is-Connected) {
    Write-Host "Already connected." -ForegroundColor Yellow
    Show-Status
    return
  }

  $openvpn = Resolve-OpenVpnBinary
  $config = Get-ConfigPath $Proto

  $args = @(
    "--config", $config,
    "--writepid", $PidFile,
    "--log", $LogFile
  )

  Start-Process -FilePath $openvpn -ArgumentList $args -WindowStyle Hidden | Out-Null

  if (Wait-ForConnect) {
    Write-Host "Connected." -ForegroundColor Green
    Show-Status
  } else {
    Write-Host "Connection timed out or failed. Last log lines:" -ForegroundColor Red
    if (Test-Path $LogFile) {
      Get-Content $LogFile -Tail 15
    }
    exit 1
  }
}

function Disconnect-Vpn {
  $pid = Get-OpenVpnPid
  if (-not $pid) {
    Write-Host "VPN is not running." -ForegroundColor Yellow
    return
  }

  Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
  Remove-Item $PidFile -ErrorAction SilentlyContinue

  Write-Host "Disconnected." -ForegroundColor Yellow
  Write-Host "Public IP : $(Get-PublicIp)"
}

function Show-Log {
  if (-not (Test-Path $LogFile)) {
    Write-Host "No log file at $LogFile" -ForegroundColor Yellow
    return
  }

  Get-Content $LogFile -Wait
}

function Show-Help {
  Write-Host "Usage: .\vpn.ps1 [connect|disconnect|toggle|status|log|help] [udp|tcp]"
  Write-Host ""
  Write-Host "Examples:"
  Write-Host "  .\vpn.ps1 connect"
  Write-Host "  .\vpn.ps1 connect udp"
  Write-Host "  .\vpn.ps1 disconnect"
}

switch ($Command.ToLowerInvariant()) {
  "connect" { Connect-Vpn $Protocol }
  "on" { Connect-Vpn $Protocol }
  "up" { Connect-Vpn $Protocol }
  "disconnect" { Disconnect-Vpn }
  "down" { Disconnect-Vpn }
  "off" { Disconnect-Vpn }
  "toggle" {
    if (Is-Connected) { Disconnect-Vpn } else { Connect-Vpn $Protocol }
  }
  "status" { Show-Status }
  "s" { Show-Status }
  "log" { Show-Log }
  "l" { Show-Log }
  "help" { Show-Help }
  "-h" { Show-Help }
  "--help" { Show-Help }
  default {
    Show-Help
    exit 1
  }
}
