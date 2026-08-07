# iCloud photos on the screensaver

Goal: your iCloud **Favourites** playing in Hearth's photo screensaver, staying in sync.

The trick: Hearth's slideshow can't display HEIC (the iPhone default format), so don't point
it at the raw synced library. Instead, put the photos you want in a **shared album** — iCloud
converts shared-album photos to JPEG — and let iCloud for Windows sync that album to a folder.

## 1. Make the album (on your iPhone or Mac)

1. Photos → Albums → **Favourites** → select the photos you want on the wall.
2. Share → **Add to Shared Album** → **New Shared Album**, name it e.g. `Hearth Frame`.
   You don't need to invite anyone.
3. New favourites don't flow in automatically — add them the same way whenever you like.
   (Shared albums hold up to 5,000 photos; Hearth shows up to 800.)

## 2. Install iCloud for Windows (on the kiosk PC)

1. Microsoft Store → search **iCloud** (publisher: Apple) → install. It's free.
2. Sign in with your Apple ID (approve the two-factor prompt on your iPhone).
3. Turn on **Photos** (make sure Shared Albums is enabled if your version shows the option).
   You can leave iCloud Drive, Mail, etc. off.
4. In File Explorer, find the album folder. Depending on the app version it's somewhere like:
   - `C:\Users\<you>\Pictures\iCloud Photos\Shared\Hearth Frame`
   - or an `iCloud Photos` entry in the Explorer sidebar → `Shared` / `Shared Albums`
5. If right-clicking the folder offers **"Always keep on this device"**, turn it on — that
   forces real files instead of on-demand placeholders, which the slideshow needs.

## 3. Point Hearth at it

Settings → Screensaver → set the **photos folder** to that album folder, and mode to
**Photos**. Done — photos added to the album from your phone appear on the wall after
iCloud syncs them down (usually minutes).

## Notes

- iCloud for Windows starts with Windows by default; leave that on so syncing continues
  unattended on the kiosk.
- If the slideshow says "No photos found", check the folder in Explorer actually contains
  `.jpg` files (not placeholder icons), and that the path in Settings matches exactly.
