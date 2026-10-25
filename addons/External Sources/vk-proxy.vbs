' Скрытый запуск vk-proxy.cjs через Next Music.exe в режиме Node (без окна)
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
exe = shell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Programs\next-music\Next Music.exe"
If fso.FileExists(exe) Then
  shell.Environment("PROCESS")("ELECTRON_RUN_AS_NODE") = "1"
  shell.Run """" & exe & """ """ & dir & "\vk-proxy.cjs""", 0, False
End If
