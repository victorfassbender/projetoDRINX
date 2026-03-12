$port = 8787
$conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1

if ($conn) {
  Stop-Process -Id $conn.OwningProcess -Force
  Write-Host "KILLED_PID=$($conn.OwningProcess)"
} else {
  Write-Host "NO_PROCESS_ON_$port"
}

Write-Host "STARTING_SERVER"
node server.js
