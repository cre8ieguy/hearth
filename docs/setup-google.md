# Google Calendar setup

Hearth reads your agenda and adds events using the Google Calendar API with your own (free)
OAuth client. One-time setup, ~5 minutes.

## 1. Create the OAuth client

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create a project
   (e.g. `hearth`).
2. **APIs & Services → Library** → search **Google Calendar API** → **Enable**.
3. **APIs & Services → OAuth consent screen**:
   - User type: **External** → Create.
   - App name `Hearth`, your email for the required fields → Save through the steps (no scopes
     need adding here; defaults are fine).
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Desktop app**, name `Hearth`.
   - Copy the **Client ID** and **Client Secret**. (Desktop apps use a loopback redirect
     automatically — no redirect URI needs registering.)

## 2. Publish the app (important!)

On the **OAuth consent screen** page, click **Publish app** to move it from *Testing* to
*In production*.

> Why: in *Testing* mode, Google expires your sign-in after **7 days**, so Hearth would ask you to
> reconnect weekly. In production it stays signed in. You'll see an "unverified app" warning during
> the one-time consent — that's expected for a personal app: click **Advanced → Go to Hearth
> (unsafe)**. It's your own OAuth client accessing your own calendar.

(If you stay in Testing mode instead, add your Google account under **Test users**.)

## 3. Connect in Hearth

1. Hearth → **Settings → Google Calendar** → paste Client ID + Secret.
2. Tap **Connect**, approve in the browser (choose the Google account whose calendars you want).
3. Green pill = done. The Agenda view and voice commands now work, across **all** calendars on the
   account ("add it to the family calendar" works by name).
