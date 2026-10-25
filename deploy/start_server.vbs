' Chay POS server an cua so (khong hien cua so den, khong mo browser).
' Task Scheduler goi file nay khi bat may.
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
Set sh = CreateObject("WScript.Shell")
' POS_PRODUCTION=1: tat uvicorn reload watcher + khong tu mo browser
Set env = sh.Environment("PROCESS")
env("POS_PRODUCTION") = "1"
sh.CurrentDirectory = root
' 0 = an cua so, False = khong doi ket thuc
If fso.FileExists(root & "\POS_Mastercare.exe") Then
    sh.Run """" & root & "\POS_Mastercare.exe""", 0, False
Else
    sh.Run """" & root & "\.venv\Scripts\python.exe"" main.py", 0, False
End If
