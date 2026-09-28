# Quet mang noi bo tim may chu POS PET OEM.
# In ra http://<ip>:8999 neu thay, exit 0. Khong thay thi exit 1.
# Dung PowerShell (khong Python) vi may con khong can cai Python.
$ErrorActionPreference = "SilentlyContinue"
$port = 8999

# Lay IP LAN THAT: theo route mac dinh (0.0.0.0/0), khong phai card dau tien.
# Quan trong: may co WSL/Docker/Hyper-V/VMware co nhieu card ao (172.x, 192.168.56.x).
# Lay card dau tien se quet SAI subnet -> khong bao gio thay may chu.
$local = $null
try {
    $idx = (Get-NetRoute -DestinationPrefix "0.0.0.0/0" |
            Sort-Object RouteMetric, ifMetric |
            Select-Object -First 1).InterfaceIndex
    if ($idx) {
        $local = Get-NetIPAddress -AddressFamily IPv4 -InterfaceIndex $idx |
                 Where-Object { $_.IPAddress -notlike "127.*" } |
                 Select-Object -First 1 -ExpandProperty IPAddress
    }
} catch {}

# Du phong: UDP socket tro ra ngoai - OS tu chon interface mac dinh.
# Khong gui packet nao (UDP khong handshake).
if (-not $local) {
    try {
        $s = New-Object System.Net.Sockets.Socket('InterNetwork', 'Dgram', 'Udp')
        $s.Connect("8.8.8.8", 80)
        $local = $s.LocalEndPoint.Address.IPAddressToString
        $s.Close()
    } catch {}
}

if (-not $local) {
    [Console]::Error.WriteLine("Khong tim thay card mang. Kiem tra ket noi WiFi/LAN.")
    exit 1
}

$prefix = ($local -split '\.')[0..2] -join '.'
[Console]::Error.WriteLine("Dang quet $prefix.1-254 ...")

# Quet song song bang runspace pool: nhanh hon Start-Job rat nhieu
# (254 Start-Job tao 254 process PowerShell -> treo may yeu).
$pool = [RunspaceFactory]::CreateRunspacePool(1, 64)
$pool.Open()
$tasks = @()

foreach ($i in 1..254) {
    $ip = "$prefix.$i"
    $ps = [PowerShell]::Create()
    $ps.RunspacePool = $pool
    [void]$ps.AddScript({
        param($ip, $port)
        try {
            # TCP check truoc: nhanh hon, bo qua 250 IP chet trong ~1s
            $tcp = New-Object System.Net.Sockets.TcpClient
            $ok = $tcp.ConnectAsync($ip, $port).Wait(400)
            $tcp.Close()
            if (-not $ok) { return $null }

            $r = Invoke-RestMethod -Uri "http://${ip}:${port}/api/ping" -TimeoutSec 3
            if ($r.app -eq "pos-offline-petcare") { return $ip }
        } catch {}
        return $null
    }).AddArgument($ip).AddArgument($port)

    $tasks += [pscustomobject]@{ PS = $ps; Handle = $ps.BeginInvoke() }
}

$found = $null
foreach ($t in $tasks) {
    if (-not $found) {
        $res = $t.PS.EndInvoke($t.Handle)
        if ($res -and $res[0]) { $found = $res[0] }
    }
    $t.PS.Dispose()
}
$pool.Close()
$pool.Dispose()

if ($found) {
    # Chi dong nay ra stdout -> .bat doc bang for /f
    Write-Output "http://${found}:${port}"
    exit 0
} else {
    [Console]::Error.WriteLine("Khong tim thay may chu POS trong mang.")
    [Console]::Error.WriteLine("Kiem tra: may chu da bat chua? Hai may cung mot WiFi/LAN khong?")
    exit 1
}
