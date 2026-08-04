; Hearth NSIS customizations (wired via electron-builder.yml -> nsis.include).
;
; Updating a kiosk app that auto-starts at login means the old version is
; usually alive (or its files briefly locked by AV/indexing right after it
; quits). Kill it, then RETRY until the old exe is provably deletable before
; letting the uninstall step run — otherwise NSIS fails with "Failed to
; uninstall old application files".

!macro customInit
  nsExec::Exec 'taskkill /F /IM Hearth.exe /T'
  StrCpy $R9 0
  hearth_wait_unlock:
    ClearErrors
    Delete "$LOCALAPPDATA\Programs\hearth\Hearth.exe"
    IfErrors 0 hearth_unlocked
    IntOp $R9 $R9 + 1
    IntCmp $R9 16 hearth_unlocked
    Sleep 500
    nsExec::Exec 'taskkill /F /IM Hearth.exe /T'
    Goto hearth_wait_unlock
  hearth_unlocked:
!macroend

!macro customUnInit
  nsExec::Exec 'taskkill /F /IM Hearth.exe /T'
  Sleep 500
!macroend
