; Custom NSIS hooks for the OpenDirector Windows installer.
; - First page: remember user data on uninstall (default per electron-builder
;   `deleteAppDataOnUninstall: false`).
; - Adds "Open data folder" to the uninstaller confirmation context.

!macro customInstall
  ; Register the app for toast notifications and Jump Lists.
  WriteRegStr HKCU "Software\Classes\opendirector" "" "URL:OpenDirector Protocol"
  WriteRegStr HKCU "Software\Classes\opendirector" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\opendirector\shell\open\command" "" '"$INSTDIR\OpenDirector.exe" "%1"'
!macroend

!macro customUnInstall
  ; Projects, credentials and settings live under %APPDATA%\OpenDirector and are
  ; preserved by design. Remove only the protocol registration we added.
  DeleteRegKey HKCU "Software\Classes\opendirector"
!macroend
