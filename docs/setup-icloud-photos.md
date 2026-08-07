# iCloud Favourites on the screensaver (automatic)

Goal: your iCloud **Favourites** playing in Hearth's photo screensaver, kept in sync
automatically — the only thing you ever do is tap ♥ on a photo.

Two problems to route around:

- Hearth's slideshow can't display HEIC (the iPhone default format), only JPEG/PNG/etc.
- iCloud for Windows doesn't expose "Favourites" as a folder, so syncing the photo library
  to the PC can't give you favourites-only.

The fix is a small iPhone **Shortcut** that runs on a schedule: it grabs your favourites,
converts them to JPEG, and drops them in an iCloud Drive folder — which iCloud for Windows
mirrors to the kiosk as ordinary files.

## 1. Build the Shortcut (on your iPhone, ~5 minutes)

Shortcuts app → **+** to create a new shortcut, name it `Hearth Photos`:

1. **Find Photos** — add filter: *Favourite* is *true*. Sort by *Creation Date*, latest
   first. Turn **Limit** on, e.g. 200 (keeps the nightly run fast; raise it if you like).
2. **Repeat with Each** (over the photos), and inside the repeat block:
   - **Convert Image** — convert *Repeat Item* to **JPEG** (this handles HEIC).
   - **Set Name** — rename the *Converted Image* to `hearth-` followed by the
     *Repeat Index* magic variable (gives stable names like `hearth-1`, `hearth-2`…).
   - **Save File** — save the *Renamed Item* to **iCloud Drive**, destination folder
     `Shortcuts/Hearth Photos`. Turn **Ask Where to Save** *off* and
     **Overwrite If File Exists** *on* (that's what keeps the folder in sync).

Run it once manually to check: Files app → iCloud Drive → Shortcuts → Hearth Photos should
fill with JPEGs.

Then automate it: Shortcuts → **Automation** tab → **+** → **Time of Day** → e.g. 3:00 AM,
daily → **Run Immediately** (no confirmation) → choose the `Hearth Photos` shortcut.

## 2. iCloud for Windows (on the kiosk PC)

1. Microsoft Store → install **iCloud** (publisher: Apple) → sign in with your Apple ID
   (approve the two-factor prompt on your iPhone).
2. Enable **iCloud Drive**. (Photos sync isn't needed for this — leave it off unless you
   want it for something else.)
3. In File Explorer confirm the folder appears:
   `C:\Users\<you>\iCloudDrive\Shortcuts\Hearth Photos`
4. If right-clicking the folder offers **"Always keep on this device"**, turn it on so the
   slideshow gets real files instead of on-demand placeholders.

## 3. Point Hearth at it

Settings → Screensaver → set the **photos folder** to that path, mode **Photos**.

From then on: ♥ a photo on your phone → the 3 AM shortcut exports it → iCloud Drive syncs
it down → it's on the wall by morning.

## Notes

- iCloud for Windows starts with Windows by default; leave that on.
- Un-favourited photos drop out on the next run as their slots are overwritten. If you ever
  shrink your favourites a lot, a few stale files can linger — just empty the folder once
  and let the shortcut refill it.
- If the slideshow says "No photos found", check the folder in Explorer actually contains
  `.jpg` files (not placeholder icons) and the path in Settings matches exactly.
