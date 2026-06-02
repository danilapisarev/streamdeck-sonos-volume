# Changelog

All notable changes to **Volume for AirPlay Sonos** are documented here.

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
