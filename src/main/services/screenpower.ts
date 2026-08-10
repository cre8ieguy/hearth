import { execFile } from 'child_process'

/**
 * Display power control for presence/night-schedule features (Windows only,
 * no-op in dev on the Mac). No native modules, per the project rule:
 * PowerShell + user32 via Add-Type.
 *
 * Off: WM_SYSCOMMAND/SC_MONITORPOWER broadcast.
 * On:  a 1px synthetic mouse jiggle (SC_MONITORPOWER -1 alone is ignored by
 *      some display stacks — real input wakes everything), plus the -1
 *      broadcast as belt and braces.
 */

let isOff = false

const MEMBERS =
  '[DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h,uint m,IntPtr w,IntPtr l); ' +
  '[DllImport("user32.dll")] public static extern void mouse_event(uint f,uint x,uint y,uint d,UIntPtr e);'

function ps(body: string): string {
  return `$u=Add-Type -MemberDefinition '${MEMBERS}' -Name U -PassThru; ${body}`
}

const PS_OFF = ps('$u::SendMessage([IntPtr]0xFFFF,0x0112,[IntPtr]0xF170,[IntPtr]2)')
const PS_ON = ps(
  '$u::mouse_event(1,1,0,0,[UIntPtr]::Zero); $u::mouse_event(1,[uint32]::MaxValue,0,0,[UIntPtr]::Zero); ' +
    '$u::SendMessage([IntPtr]0xFFFF,0x0112,[IntPtr]0xF170,[IntPtr](-1))',
)

export function setDisplayPower(on: boolean): void {
  if (process.platform !== 'win32') return
  if (on === !isOff) return // already in that state; don't spawn for nothing
  isOff = !on
  execFile(
    'powershell.exe',
    ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', on ? PS_ON : PS_OFF],
    (err) => {
      if (err) console.error('screenpower: powershell failed', err)
    },
  )
}
