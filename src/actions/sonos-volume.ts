import {
	action,
	DidReceiveSettingsEvent,
	KeyAction,
	KeyDownEvent,
	SendToPluginEvent,
	SingletonAction,
	WillAppearEvent,
	WillDisappearEvent,
} from '@elgato/streamdeck';
import streamDeck from '@elgato/streamdeck';
import { AsyncDeviceDiscovery, Sonos } from 'sonos';

// Mirror of @elgato/utils' `JsonValue` — the SDK types `onSendToPlugin` against
// it, but the package isn't resolvable under this tsconfig's module resolution.
type JsonValue = boolean | number | string | null | undefined | JsonValue[] | { [key: string]: JsonValue };

import { playbackIconDataUri, volumeIconDataUri } from '../icon';

/**
 * Settings shared by the Volume Up and Volume Down actions.
 */
export type SonosVolumeSettings = {
	/** IP address of the Sonos speaker on the local network. */
	speakerIp?: string;
	/** How many percent each button press changes the volume by. */
	volumeStep?: number;
	/** Which edge the volume bar is drawn on. Defaults to `'left'`. */
	barSide?: 'left' | 'right';
	/** Whether this key shows the volume percentage number. Defaults to `true`. */
	showPercent?: boolean;
};

/**
 * Settings for the Play/Pause action.
 */
export type SonosPlayPauseSettings = {
	/** IP address of the Sonos speaker on the local network. */
	speakerIp?: string;
};

const DEFAULT_VOLUME_STEP = 2;
const POLL_INTERVAL_MS = 3000;

// A second press on a Play/Pause key within this window is treated as a
// double-press (skip to next track) instead of a play/pause toggle.
const DOUBLE_PRESS_MS = 300;

const logger = streamDeck.logger.createScope('SonosVolume');

// --- Shared Sonos connections, cached per speaker IP -----------------------
// The Volume Up and Volume Down actions reuse a single Sonos client per
// speaker instead of reconnecting on every key press or poll.

const connections = new Map<string, Sonos>();

function getConnection(speakerIp: string): Sonos {
	let sonos = connections.get(speakerIp);
	if (!sonos) {
		sonos = new Sonos(speakerIp);
		connections.set(speakerIp, sonos);
	}
	return sonos;
}

function dropConnection(speakerIp: string): void {
	connections.delete(speakerIp);
}

function clamp(value: number): number {
	return Math.max(0, Math.min(100, value));
}

// --- Speaker discovery (SSDP) ----------------------------------------------
// When a key has no speaker IP configured yet, the Property Inspector asks the
// plugin to scan the local network. SSDP can only run from the Node side (the
// PI runs in a browser sandbox), so the plugin discovers speakers here and
// sends the list back. Results are cached briefly so opening several keys — or
// re-opening the same settings panel — doesn't re-scan the network every time.

export type DiscoveredSpeaker = { host: string; name: string };

const DISCOVER_TIMEOUT_MS = 5000;
const DISCOVER_CACHE_TTL_MS = 30000;

let discoverCache: { at: number; speakers: DiscoveredSpeaker[] } | null = null;
let discoverInFlight: Promise<DiscoveredSpeaker[]> | null = null;

async function discoverSpeakers(force = false): Promise<DiscoveredSpeaker[]> {
	if (!force && discoverCache && Date.now() - discoverCache.at < DISCOVER_CACHE_TTL_MS) {
		return discoverCache.speakers;
	}
	// Collapse concurrent requests (e.g. two keys opening at once) into one scan.
	if (discoverInFlight) return discoverInFlight;

	discoverInFlight = (async () => {
		try {
			const devices = await new AsyncDeviceDiscovery().discoverMultiple({ timeout: DISCOVER_TIMEOUT_MS });
			const named = await Promise.all(
				devices.map(async (device) => ({
					host: device.host,
					name: await device.getName().catch(() => device.host),
				})),
			);
			// Dedupe by host (a speaker can answer multiple SSDP probes).
			const byHost = new Map<string, DiscoveredSpeaker>();
			for (const speaker of named) {
				if (!byHost.has(speaker.host)) byHost.set(speaker.host, speaker);
			}
			const speakers = [...byHost.values()].sort((a, b) => a.name.localeCompare(b.name));
			discoverCache = { at: Date.now(), speakers };
			logger.debug('Discovered speakers:', speakers.map((s) => `${s.name} (${s.host})`).join(', ') || '(none)');
			return speakers;
		} catch (error) {
			logger.debug('Discovery failed:', error instanceof Error ? error.message : String(error));
			// Fall back to the last known list rather than wiping the dropdown.
			return discoverCache?.speakers ?? [];
		} finally {
			discoverInFlight = null;
		}
	})();

	return discoverInFlight;
}

/**
 * Handle a message from the Property Inspector. Both actions share the same
 * `getDevices` request: scan the network and send the speaker list back to the
 * PI that asked (`sendToPropertyInspector` targets the currently visible one).
 */
async function handleSendToPlugin(payload: JsonValue | null | undefined): Promise<void> {
	const message = payload as { event?: string; force?: boolean } | null | undefined;
	if (message?.event !== 'getDevices') return;

	const speakers = await discoverSpeakers(message.force === true);
	await streamDeck.ui.sendToPropertyInspector({ event: 'devices', devices: speakers });
}

// --- Live key display ------------------------------------------------------
// Every visible Volume Up/Down key is registered as a "tile". A single shared
// poll loop reads each speaker's volume once per interval and redraws all tiles
// pointing at that speaker, so the keys always show the current volume — even
// when it is changed elsewhere (Sonos app, AirPlay source, the other button).

type Tile = {
	action: KeyAction<SonosVolumeSettings>;
	direction: 1 | -1;
	speakerIp?: string;
	barSide: 'left' | 'right';
	showPercent: boolean;
};

/** Playback transport state, as normalised by the `sonos` library. */
export type PlaybackState = 'playing' | 'paused' | 'stopped' | 'transitioning' | 'no_media';

/** A live Play/Pause key tracking one speaker's transport state. */
type PlayTile = {
	action: KeyAction<SonosPlayPauseSettings>;
	speakerIp?: string;
};

const tiles = new Map<string, Tile>();
const playTiles = new Map<string, PlayTile>();
const lastState = new Map<string, { volume?: number; muted?: boolean; playback?: PlaybackState }>();
let pollTimer: ReturnType<typeof setInterval> | null = null;

function hasTiles(): boolean {
	return tiles.size > 0 || playTiles.size > 0;
}

function renderTile(tile: Tile, state: { volume?: number; muted?: boolean; configured: boolean }): void {
	void tile.action
		.setImage(
			volumeIconDataUri({
				direction: tile.direction,
				volume: state.volume,
				muted: state.muted,
				configured: state.configured,
				barSide: tile.barSide,
				showPercent: tile.showPercent,
			}),
		)
		.catch((error) => logger.error('setImage failed:', error));
}

function renderTilesForIp(speakerIp: string, state: { volume?: number; muted?: boolean; configured: boolean }): void {
	for (const tile of tiles.values()) {
		if (tile.speakerIp === speakerIp) {
			renderTile(tile, state);
		}
	}
}

function renderPlayTile(tile: PlayTile, state: { playback?: PlaybackState; configured: boolean }): void {
	void tile.action
		.setImage(playbackIconDataUri({ playing: state.playback === 'playing', configured: state.configured }))
		.catch((error) => logger.error('setImage failed:', error));
}

function renderPlayTilesForIp(speakerIp: string, state: { playback?: PlaybackState; configured: boolean }): void {
	for (const tile of playTiles.values()) {
		if (tile.speakerIp === speakerIp) {
			renderPlayTile(tile, state);
		}
	}
}

function normalisePlayback(raw: string, previous?: PlaybackState): PlaybackState {
	// 'transitioning' is a brief in-between state; keep the previous icon so the
	// key doesn't flicker between play and pause while a track is loading.
	if (raw === 'transitioning') return previous ?? 'transitioning';
	if (raw === 'playing' || raw === 'paused' || raw === 'stopped' || raw === 'no_media') return raw;
	return previous ?? 'stopped';
}

async function refreshIp(speakerIp: string): Promise<void> {
	try {
		const sonos = getConnection(speakerIp);
		const previous = lastState.get(speakerIp);
		const [volume, muted, rawState] = await Promise.all([
			sonos.getVolume(),
			sonos.getMuted(),
			sonos.getCurrentState(),
		]);
		const playback = normalisePlayback(rawState, previous?.playback);
		lastState.set(speakerIp, { volume, muted, playback });
		renderTilesForIp(speakerIp, { volume, muted, configured: true });
		renderPlayTilesForIp(speakerIp, { playback, configured: true });
	} catch (error) {
		logger.debug('Poll failed for', speakerIp, '-', error instanceof Error ? error.message : String(error));
		dropConnection(speakerIp);
		// Keep showing the last known value rather than flashing a placeholder.
		const last = lastState.get(speakerIp);
		renderTilesForIp(speakerIp, last ? { ...last, configured: true } : { configured: true });
		renderPlayTilesForIp(speakerIp, last ? { playback: last.playback, configured: true } : { configured: true });
	}
}

function pollAll(): void {
	const ips = new Set<string>();
	for (const tile of tiles.values()) {
		if (tile.speakerIp) ips.add(tile.speakerIp);
	}
	for (const tile of playTiles.values()) {
		if (tile.speakerIp) ips.add(tile.speakerIp);
	}
	for (const ip of ips) {
		void refreshIp(ip);
	}
}

function startPolling(): void {
	if (pollTimer || !hasTiles()) return;
	pollTimer = setInterval(pollAll, POLL_INTERVAL_MS);
}

function stopPolling(): void {
	if (pollTimer && !hasTiles()) {
		clearInterval(pollTimer);
		pollTimer = null;
	}
}

/**
 * Base class containing the shared logic for adjusting a Sonos speaker's
 * volume. Subclasses only provide the direction of the change (+1 / -1).
 *
 * Works with any Sonos speaker on the local network, including speakers that
 * are currently playing an AirPlay stream — the volume is controlled through
 * the Sonos device API regardless of the audio source.
 */
abstract class SonosVolumeAction extends SingletonAction<SonosVolumeSettings> {
	/** Direction of the volume change: +1 to raise, -1 to lower. */
	protected abstract readonly direction: 1 | -1;

	/**
	 * Register the key as a live tile and draw its current state.
	 */
	override onWillAppear(ev: WillAppearEvent<SonosVolumeSettings>): void {
		if (!ev.action.isKey()) return;

		const keyAction = ev.action as KeyAction<SonosVolumeSettings>;
		const speakerIp = ev.payload.settings.speakerIp;
		const tile: Tile = {
			action: keyAction,
			direction: this.direction,
			speakerIp,
			barSide: ev.payload.settings.barSide ?? 'left',
			showPercent: ev.payload.settings.showPercent ?? true,
		};
		tiles.set(keyAction.id, tile);

		if (speakerIp) {
			// Draw immediately from cache (or a placeholder), then refresh.
			const last = lastState.get(speakerIp);
			renderTile(tile, last ? { ...last, configured: true } : { configured: true });
			void refreshIp(speakerIp);
		} else {
			renderTile(tile, { configured: false });
		}

		startPolling();
	}

	/**
	 * Stop tracking the key when it disappears.
	 */
	override onWillDisappear(ev: WillDisappearEvent<SonosVolumeSettings>): void {
		tiles.delete(ev.action.id);
		stopPolling();
	}

	/**
	 * Redraw and re-sync when the speaker IP (or step) changes in the PI.
	 */
	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<SonosVolumeSettings>): void {
		const tile = tiles.get(ev.action.id);
		if (!tile) return;

		tile.speakerIp = ev.payload.settings.speakerIp;
		tile.barSide = ev.payload.settings.barSide ?? 'left';
		tile.showPercent = ev.payload.settings.showPercent ?? true;
		if (tile.speakerIp) {
			const last = lastState.get(tile.speakerIp);
			renderTile(tile, last ? { ...last, configured: true } : { configured: true });
			void refreshIp(tile.speakerIp);
		} else {
			renderTile(tile, { configured: false });
		}
	}

	/**
	 * Handle requests from the Property Inspector. Currently it asks the plugin
	 * to scan the local network for Sonos speakers (SSDP can only run here, not
	 * in the PI's browser sandbox) and replies with the discovered list.
	 */
	override onSendToPlugin(ev: SendToPluginEvent<JsonValue, SonosVolumeSettings>): Promise<void> {
		return handleSendToPlugin(ev.payload);
	}

	/**
	 * Adjust the speaker's volume when the button is pressed.
	 */
	override async onKeyDown(ev: KeyDownEvent<SonosVolumeSettings>): Promise<void> {
		const keyAction = ev.action as KeyAction<SonosVolumeSettings>;
		const { speakerIp } = ev.payload.settings;
		const volumeStep = ev.payload.settings.volumeStep ?? DEFAULT_VOLUME_STEP;

		if (!speakerIp) {
			logger.warn('No speaker IP configured');
			await keyAction.showAlert();
			return;
		}

		try {
			const sonos = getConnection(speakerIp);

			// Read the current volume so presses always step from the real value,
			// even if it was changed elsewhere (Sonos app, AirPlay source, etc.).
			const currentVolume = await sonos.getVolume();
			const newVolume = clamp(currentVolume + this.direction * volumeStep);

			let muted = lastState.get(speakerIp)?.muted ?? false;

			if (newVolume === currentVolume) {
				logger.debug('Volume already at limit:', currentVolume);
				renderTilesForIp(speakerIp, { volume: currentVolume, muted, configured: true });
				return;
			}

			// Raising the volume on a muted speaker should also unmute it.
			if (this.direction > 0 && (await sonos.getMuted())) {
				await sonos.setMuted(false);
				muted = false;
			}

			await sonos.setVolume(newVolume);
			logger.debug(`Volume changed ${currentVolume} -> ${newVolume}`);

			// Optimistically update every tile for this speaker right away.
			lastState.set(speakerIp, { ...lastState.get(speakerIp), volume: newVolume, muted });
			renderTilesForIp(speakerIp, { volume: newVolume, muted, configured: true });
		} catch (error) {
			logger.error('Failed to change volume:', {
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});
			// Drop the cached connection so the next press reconnects cleanly.
			dropConnection(speakerIp);
			await keyAction.showAlert();
		}
	}
}

/**
 * Increases the Sonos speaker's volume by the configured step.
 */
@action({ UUID: 'com.danila.sonos-volume.up' })
export class SonosVolumeUp extends SonosVolumeAction {
	protected readonly direction = 1 as const;
}

/**
 * Decreases the Sonos speaker's volume by the configured step.
 */
@action({ UUID: 'com.danila.sonos-volume.down' })
export class SonosVolumeDown extends SonosVolumeAction {
	protected readonly direction = -1 as const;
}

/**
 * Toggles play/pause on a Sonos speaker. The key icon reflects the current
 * transport state — a play glyph when the speaker is idle (press to play), a
 * pause glyph when it is playing (press to pause) — and stays in sync via the
 * shared poll loop even when playback is controlled elsewhere.
 */
@action({ UUID: 'com.danila.sonos-volume.playpause' })
export class SonosPlayPause extends SingletonAction<SonosPlayPauseSettings> {
	/**
	 * Pending single-press timers, keyed by key id. A press starts a timer that
	 * fires the play/pause toggle once the double-press window has elapsed; a
	 * second press within the window cancels it and skips to the next track
	 * instead.
	 */
	private readonly pendingPresses = new Map<string, ReturnType<typeof setTimeout>>();

	/**
	 * Register the key as a live play/pause tile and draw its current state.
	 */
	override onWillAppear(ev: WillAppearEvent<SonosPlayPauseSettings>): void {
		if (!ev.action.isKey()) return;

		const keyAction = ev.action as KeyAction<SonosPlayPauseSettings>;
		const speakerIp = ev.payload.settings.speakerIp;
		const tile: PlayTile = { action: keyAction, speakerIp };
		playTiles.set(keyAction.id, tile);

		if (speakerIp) {
			const last = lastState.get(speakerIp);
			renderPlayTile(tile, last ? { playback: last.playback, configured: true } : { configured: true });
			void refreshIp(speakerIp);
		} else {
			renderPlayTile(tile, { configured: false });
		}

		startPolling();
	}

	override onWillDisappear(ev: WillDisappearEvent<SonosPlayPauseSettings>): void {
		playTiles.delete(ev.action.id);
		const pending = this.pendingPresses.get(ev.action.id);
		if (pending) {
			clearTimeout(pending);
			this.pendingPresses.delete(ev.action.id);
		}
		stopPolling();
	}

	/**
	 * Redraw and re-sync when the speaker IP changes in the PI.
	 */
	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<SonosPlayPauseSettings>): void {
		const tile = playTiles.get(ev.action.id);
		if (!tile) return;

		tile.speakerIp = ev.payload.settings.speakerIp;
		if (tile.speakerIp) {
			const last = lastState.get(tile.speakerIp);
			renderPlayTile(tile, last ? { playback: last.playback, configured: true } : { configured: true });
			void refreshIp(tile.speakerIp);
		} else {
			renderPlayTile(tile, { configured: false });
		}
	}

	/**
	 * Respond to the Property Inspector's speaker-discovery request.
	 */
	override onSendToPlugin(ev: SendToPluginEvent<JsonValue, SonosPlayPauseSettings>): Promise<void> {
		return handleSendToPlugin(ev.payload);
	}

	/**
	 * Handle a button press. A single press toggles play/pause; a double press
	 * skips to the next track. Because the two can only be told apart in time,
	 * the toggle is deferred by {@link DOUBLE_PRESS_MS}: if a second press lands
	 * within that window the pending toggle is cancelled and `next()` runs
	 * instead.
	 */
	override async onKeyDown(ev: KeyDownEvent<SonosPlayPauseSettings>): Promise<void> {
		const keyAction = ev.action as KeyAction<SonosPlayPauseSettings>;
		const { speakerIp } = ev.payload.settings;

		if (!speakerIp) {
			logger.warn('No speaker IP configured');
			await keyAction.showAlert();
			return;
		}

		const pending = this.pendingPresses.get(keyAction.id);
		if (pending) {
			// Second press within the window — this is a double-press.
			clearTimeout(pending);
			this.pendingPresses.delete(keyAction.id);
			await this.skipNext(keyAction, speakerIp);
			return;
		}

		// First press — wait briefly to see whether a second one follows.
		const timer = setTimeout(() => {
			this.pendingPresses.delete(keyAction.id);
			void this.togglePlayback(keyAction, speakerIp);
		}, DOUBLE_PRESS_MS);
		this.pendingPresses.set(keyAction.id, timer);
	}

	/**
	 * Toggle playback on the speaker, optimistically updating every tile.
	 */
	private async togglePlayback(keyAction: KeyAction<SonosPlayPauseSettings>, speakerIp: string): Promise<void> {
		try {
			const sonos = getConnection(speakerIp);

			// Toggle from the last known state (treat unknown as "not playing", so
			// a press starts playback). The poll loop corrects the icon shortly
			// after if the real state differed.
			const wasPlaying = lastState.get(speakerIp)?.playback === 'playing';
			if (wasPlaying) {
				await sonos.pause();
			} else {
				await sonos.play();
			}
			const playback: PlaybackState = wasPlaying ? 'paused' : 'playing';
			logger.debug(`Playback toggled -> ${playback}`);

			// Optimistically update every play/pause tile for this speaker.
			lastState.set(speakerIp, { ...lastState.get(speakerIp), playback });
			renderPlayTilesForIp(speakerIp, { playback, configured: true });
		} catch (error) {
			logger.error('Failed to toggle playback:', {
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});
			dropConnection(speakerIp);
			await keyAction.showAlert();
		}
	}

	/**
	 * Skip to the next track in the speaker's queue. A double-press leaves the
	 * speaker playing, so refresh the tiles to pick up the new transport state.
	 */
	private async skipNext(keyAction: KeyAction<SonosPlayPauseSettings>, speakerIp: string): Promise<void> {
		try {
			const sonos = getConnection(speakerIp);
			await sonos.next();
			logger.debug('Skipped to next track');
			await refreshIp(speakerIp);
		} catch (error) {
			logger.error('Failed to skip to next track:', {
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});
			dropConnection(speakerIp);
			await keyAction.showAlert();
		}
	}
}
