# Home Assistant setup

If you run [Home Assistant](https://www.home-assistant.io/), Hearth can control everything it
manages — lights, switches, scenes, thermostats, media players, locks, covers, fans — by voice.

## 1. Get a long-lived access token

1. Open your Home Assistant UI and click your **user profile** (bottom-left avatar).
2. Go to the **Security** tab → scroll to **Long-lived access tokens** → **Create token**.
3. Name it `Hearth` and copy the token now (it's shown only once).

## 2. Configure Hearth

1. Hearth → **Settings → Home Assistant**:
   - **URL**: how the kiosk PC reaches HA on your network, e.g.
     `http://homeassistant.local:8123` or `http://192.168.1.50:8123`
     (an `https://…` Nabu Casa cloud URL also works).
   - **Token**: paste the long-lived token.
2. Tap **Test connection** — you should see "✓ API running."

## 3. Talk to your house

The assistant discovers entities live, so new devices just work:

- "Turn off all the bedroom lights"
- "Set the thermostat to 68"
- "Is the front door locked?" → "Lock it"
- "Run the movie night scene"
- "Set the kitchen lights to 30 percent and make them warm white"

Under the hood it lists entities (`home_devices`) and calls services (`home_control`) — the same
API the HA dashboard uses, so anything HA can do, you can ask for.

## Tips

- Give devices friendly names in HA ("Kitchen ceiling", "Living room lamp") — that's what the
  assistant matches against.
- The kiosk PC must be able to reach the HA URL (same LAN or VPN/cloud URL).
