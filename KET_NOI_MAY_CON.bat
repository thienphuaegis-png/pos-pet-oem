@echo off
chcp 65001 >nul
title KET NOI POS PET OEM - MAY CON
setlocal EnableDelayedExpansion

echo ==================================================
echo   KET NOI MAY NAY VOI MAY CHU POS PET OEM
echo ==================================================
echo.
echo Dang tu dong tim may chu trong mang WiFi/LAN...
echo (Mat khoang 3 - 8 giay, xin cho mot chut)
echo.

set "SCAN_PS=%TEMP%\pos_scan_%RANDOM%.ps1"
(
echo $port = 8999
echo $local = $null
echo try {
echo   $idx = ^(Get-NetRoute -DestinationPrefix '0.0.0.0/0' ^| Sort-Object RouteMetric, ifMetric ^| Select-Object -First 1^).InterfaceIndex
echo   if ^($idx^) { $local = Get-NetIPAddress -AddressFamily IPv4 -InterfaceIndex $idx ^| Where-Object { $_.IPAddress -notlike '127.*' } ^| Select-Object -First 1 -ExpandProperty IPAddress }
echo } catch {}
echo if ^(-not $local^) {
echo   try {
echo     $s = New-Object System.Net.Sockets.Socket^('InterNetwork', 'Dgram', 'Udp'^)
echo     $s.Connect^('8.8.8.8', 80^)
echo     $local = $s.LocalEndPoint.Address.IPAddressToString
echo     $s.Close^(^)
echo   } catch {}
echo }
echo if ^(-not $local^) { exit 1 }
echo $prefix = ^($local -split '\.'^)[0..2] -join '.'
echo $pool = [RunspaceFactory]::CreateRunspacePool^(1, 64^)
echo $pool.Open^(^)
echo $tasks = @^(^)
echo foreach ^($i in 1..254^) {
echo   $ip = "$prefix.$i"
echo   $ps = [PowerShell]::Create^(^)
echo   $ps.RunspacePool = $pool
echo   [void]$ps.AddScript^({
echo     param^($ip, $port^)
echo     try {
echo       $tcp = New-Object System.Net.Sockets.TcpClient
echo       $ok = $tcp.ConnectAsync^($ip, $port^).Wait^(350^)
echo       $tcp.Close^(^)
echo       if ^(-not $ok^) { return $null }
echo       $r = Invoke-RestMethod -Uri ^("http://" + $ip + ":" + $port + "/api/ping"^) -TimeoutSec 2
echo       if ^($r.app -eq 'pos-offline-petcare'^) { return ^("http://" + $ip + ":" + $port^) }
echo     } catch {}; return $null
echo   }^)
echo   [void]$ps.AddParameter^('ip', $ip^)
echo   [void]$ps.AddParameter^('port', $port^)
echo   $tasks += [PSCustomObject]@{ Pipe = $ps; Async = $ps.BeginInvoke^(^) }
echo }
echo $found = $null
echo foreach ^($t in $tasks^) {
echo   $res = $t.Pipe.EndInvoke^($t.Async^)
echo   $t.Pipe.Dispose^(^)
echo   if ^($res -and -not $found^) { $found = $res }
echo }
echo $pool.Close^(^)
echo $pool.Dispose^(^)
echo if ^($found^) {
echo   [System.IO.File]::WriteAllText^("$env:TEMP\pos_result.txt", $found.Trim^(^)^)
echo   exit 0
echo }
echo exit 1
) > "%SCAN_PS%"

del "%TEMP%\pos_result.txt" >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCAN_PS%" >nul 2>&1
del "%SCAN_PS%" >nul 2>&1

set "FOUND="
if exist "%TEMP%\pos_result.txt" (
    set /p FOUND=<"%TEMP%\pos_result.txt"
    del "%TEMP%\pos_result.txt" >nul 2>&1
)

if not defined FOUND (
    echo [KHONG TIM THAY MAY CHU TU DONG]
    echo.
    echo Kiem tra:
    echo   1. May chu da bat va POS dang chay chua?
    echo   2. Hai may da ket noi CUNG mot mang WiFi chua?
    echo.
    set /p "MANUAL=Nhap tay dia chi IP may chu (vd 192.168.1.50): "
    if "!MANUAL!"=="" (
        echo Da thoat.
        pause & exit /b 1
    )
    set "FOUND=http://!MANUAL!:8999"
)

echo.
echo Tim thay may chu: !FOUND!
echo.
echo Dang tao icon POS tren Desktop...

powershell -NoProfile -Command ^
  "$w = New-Object -ComObject WScript.Shell;" ^
  "$d = [Environment]::GetFolderPath('Desktop');" ^
  "$s = $w.CreateShortcut((Join-Path $d 'POS PET OEM.lnk'));" ^
  "$s.TargetPath = '!FOUND!'; $s.Save()"

echo.
echo ==================================================
echo   KET NOI THANH CONG!
echo.
echo   Da tao icon 'POS PET OEM' ngoai Desktop.
echo   Lan sau chi can bam dup icon do la ban hang duoc.
echo ==================================================
echo.
echo Dang mo POS tren trinh duyet...
start "" "!FOUND!"
pause
