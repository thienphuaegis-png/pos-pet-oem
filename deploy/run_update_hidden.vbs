' Chay deploy\CAP_NHAT.bat hoan toan an (0 cua so den, moi tien trinh con ke thua SW_HIDE)
If WScript.Arguments.Count >= 3 Then
    logPath = WScript.Arguments(0)
    batPath = WScript.Arguments(1)
    modeArg = WScript.Arguments(2)
    Set sh = CreateObject("WScript.Shell")
    Set fso = CreateObject("Scripting.FileSystemObject")
    sh.CurrentDirectory = fso.GetParentFolderName(fso.GetParentFolderName(batPath))
    cmd = "cmd.exe /s /d /c """"" & batPath & """ " & modeArg & " > """ & logPath & """ 2>&1"""
    sh.Run cmd, 0, False
End If
