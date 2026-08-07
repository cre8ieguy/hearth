import { execFile } from 'child_process'

/**
 * Display power control for presence detection (Windows only, no-op in dev
 * on the Mac). Uses the classic WM_SYSCOMMAND/SC_MONITORPOWER broadcast via
 * PowerShell — no native modules, per the project rule.
 */

let isOff = false

const PS_TEMPLATE =
  `$u=Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h,uint m,IntPtr w,IntPtr l);' -Name U -PassThru; ` +
  `$u::SendMessage([IntPtr]0xFFFF,0x0112,[IntPtr]0xF170,[IntPtr]PARAM)`

export function setDisplayPower(on: boolean): void {
  if (process.platform !== 'win32') return
  if (on === !isOff) return // already in that state; don't spawn for nothing
  isOff = !on
  const script = PS_TEMPLATE.replace('PARAM', on ? '-1' : '2')
  execFile(
    'powershell.exe',
    ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', script],
    (err) => {
      if (err) console.error('screenpower: powershell failed', err)
    },
  )
}
