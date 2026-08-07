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

The shortcut is **incremental**: it checks which photos are already exported and only
converts/uploads new favourites. The first run uploads everything once; after that a
nightly run costs a few MB at most (usually nothing).

Shortcuts app → **+** to create a new shortcut, name it `Hearth Photos`:

1. **Get Contents of Folder** — iCloud Drive → `Shortcuts/Hearth Photos`
   (create the folder in the Files app first).
2. **Get Details of Files** — get **Name** of *Contents of Folder*.
3. **Combine Text** — combine *Names* with *New Lines*. (This text is the "already
   exported" list; grab it as the magic variable in step 5.)
4. **Find Photos** — filter: *Favourite* is *true*. Sort by *Creation Date*, latest first.
   Limit off (Hearth shows up to 800 photos).
5. **Repeat with Each** (over the photos), and inside the repeat block:
   - **If** — *Combined Text* **does not contain** → *Name* of *Repeat Item*. Inside the If:
     - **Convert Image** — convert *Repeat Item* to **JPEG** (this handles HEIC).
     - **Set Name** — rename the *Converted Image* to: *Name* of *Repeat Item*, then `.jpg`
       (type the `.jpg` after the magic variable).
     - **Save File** — save to **iCloud Drive** → `Shortcuts/Hearth Photos`,
       **Ask Where to Save** *off*, **Overwrite If File Exists** *on*.
   - **End If**

Run it once manually to check (plug in and use Wi-Fi for this first big run): Files app →
iCloud Drive → Shortcuts → Hearth Photos should fill with JPEGs. Run it a second time —
it should finish almost instantly, exporting nothing.

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

## Want favourite videos too? (optional)

From Hearth v0.1.11 the slideshow also plays videos (muted, each up to 2 minutes). The
shortcut needs one extra branch, because Convert Image only handles stills. Inside the
"does not contain" If, **above** the Convert Image action, add:

1. **If** — input *Repeat Item* → Get **Media Type** → condition **is** → `Video`. Inside it:
   - **Encode Media** — input *Repeat Item*, Size **1080p** (re-encodes to H.264, which the
     kiosk can always play, and shrinks iPhone HEVC files).
   - **Set Name** — *Encoded Media* to *Name* of *Repeat Item* + `.mp4`.
   - **Save File** — same settings as the photo one (iCloud Drive `Shortcuts/Hearth Photos`,
     don't ask, overwrite on).
2. In its **Otherwise** branch: the existing Convert Image → Set Name `.jpg` → Save File.
3. **End If**.

Mind the size: even re-encoded, a one-minute clip is ~60–120 MB — a handful of favourite
videos can outweigh hundreds of photos in iCloud space and sync time.

## Notes

- iCloud for Windows starts with Windows by default; leave that on.
- Because the sync is incremental (add-only), **un-favouriting a photo does not remove it**
  from the frame. Every few months, if you care, empty the `Hearth Photos` folder in the
  Files app and run the shortcut manually once to rebuild it from current favourites.
- If the slideshow says "No photos found", check the folder in Explorer actually contains
  `.jpg` files (not placeholder icons) and the path in Settings matches exactly.
