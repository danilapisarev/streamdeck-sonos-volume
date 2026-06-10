# Changelog

All notable changes to **Volume for AirPlay Sonos** are documented here.

## 1.0.4

- **Improved: key rendering** — the volume percentage is now centred under the
  direction chevron (the trailing "%" was pulling the digits off-centre), the
  left- and right-bar layouts are exact mirror images of each other, and the
  play glyph on the Play / Pause key is optically centred. The key's default
  image now matches the live icon, so the glyph no longer shifts when the
  plugin starts.
- **Improved: settings panel** — the Property Inspector now renders in the
  system font for better readability, and hint text below the fields is styled
  correctly (fixed a CSS class typo).
- **Marketplace** — expanded the listing description and refreshed the preview
  images.

## 1.0.3

- **New: double-press to skip** — double-pressing the Play / Pause key skips to
  the next track in the queue. A single press still toggles playback (it now
  takes effect a fraction of a second later, the moment the double-press window
  passes).

## 1.0.2

- **New: Play / Pause key** — a button that toggles playback on your speaker and
  shows its state at a glance: a ▶ play glyph when idle and a green ⏸ pause glyph
  while playing. It stays in sync even when playback is changed elsewhere (the
  Sonos app, AirPlay, or another source).
- **New: speaker auto-discovery** — the settings panel now scans your local
  network and lists the Sonos speakers it finds, so you can pick one instead of
  hunting for its IP. A **Rescan** button re-checks the network, and manual IP
  entry still works as a fallback.

## 1.0.1

- **New:** per-key option to hide the volume percentage — show the number on just
  one key of a stacked pair while both keep the chevrons and the fill bar.
- **Compatibility:** updated for Stream Deck 6.9 (Manifest SDK v3).
- **Fix:** resolved a startup crash that left keys showing "—" and made presses
  do nothing.

## 1.0.0

- Two keys — **Volume Up** and **Volume Down** — for Sonos speakers, including
  speakers playing an AirPlay stream.
- Live key display: direction chevrons, current volume %, and a vertical fill bar
  (left or right), kept in sync via a short poll loop.
- Designed for a vertical pair: place Volume Down under Volume Up and the side
  bars form one continuous volume column (lower key 0–50%, upper key 50–100%).
- Configurable volume step (1 / 2 / 5 / 10%, default 2%).
- Raising the volume on a muted speaker unmutes it.
