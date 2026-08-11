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

/** Call when the system resumes: whatever we believed, the display state is
 *  now the OS's doing, and wake commands must not be skipped. */
export function resetAssumedState(): void {
  isOff = false
}

export function setDisplayPower(on: boolean): void {
  if (process.platform !== 'win32') return
  // Dedup OFF only. ON must always be sent: Windows (power plan, standby)
  // can blank the display behind our back, and a skipped wake leaves the
  // screen dark forever — the "doesn't wake up again" bug.
  if (!on && isOff) return
  isOff = !on
  execFile(
    'powershell.exe',
    ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', on ? PS_ON : PS_OFF],
    (err) => {
      if (err) console.error('screenpower: powershell failed', err)
    },
  )
}
