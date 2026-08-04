; Hearth NSIS customizations (wired via electron-builder.yml -> nsis.include).
;
; Kill any running Hearth instance before installing or uninstalling so stale
; file locks can never fail an update ("Failed to uninstall old application
; files" / "Hearth cannot be closed"). The app is a kiosk that auto-starts at
; login, so a live instance at install time is the normal case, not an error.

!macro customInit
  nsExec::Exec 'taskkill /F /IM Hearth.exe /T'
  Sleep 500
!macroend

!macro customUnInit
  nsExec::Exec 'taskkill /F /IM Hearth.exe /T'
  Sleep 500
!macroend
