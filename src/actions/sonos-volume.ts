import {
	action,
	DidReceiveSettingsEvent,
	KeyAction,
	KeyDownEvent,
	SingletonAction,
	WillAppearEvent,
	WillDisappearEvent,
} from '@elgato/streamdeck';
import streamDeck from '@elgato/streamdeck';
import { Sonos } from 'sonos';

import { volumeIconDataUri } from '../icon';

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
};

const DEFAULT_VOLUME_STEP = 2;
const POLL_INTERVAL_MS = 3000;

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
};

const tiles = new Map<string, Tile>();
const lastState = new Map<string, { volume: number; muted: boolean }>();
let pollTimer: ReturnType<typeof setInterval> | null = null;

function renderTile(tile: Tile, state: { volume?: number; muted?: boolean; configured: boolean }): void {
	void tile.action
		.setImage(
			volumeIconDataUri({
				direction: tile.direction,
				volume: state.volume,
				muted: state.muted,
				configured: state.configured,
				barSide: tile.barSide,
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

async function refreshIp(speakerIp: string): Promise<void> {
	try {
		const sonos = getConnection(speakerIp);
		const [volume, muted] = await Promise.all([sonos.getVolume(), sonos.getMuted()]);
		lastState.set(speakerIp, { volume, muted });
		renderTilesForIp(speakerIp, { volume, muted, configured: true });
	} catch (error) {
		logger.debug('Poll failed for', speakerIp, '-', error instanceof Error ? error.message : String(error));
		dropConnection(speakerIp);
		// Keep showing the last known value rather than flashing "—".
		const last = lastState.get(speakerIp);
		renderTilesForIp(speakerIp, last ? { ...last, configured: true } : { configured: true });
	}
}

function pollAll(): void {
	const ips = new Set<string>();
	for (const tile of tiles.values()) {
		if (tile.speakerIp) ips.add(tile.speakerIp);
	}
	for (const ip of ips) {
		void refreshIp(ip);
	}
}

function startPolling(): void {
	if (pollTimer || tiles.size === 0) return;
	pollTimer = setInterval(pollAll, POLL_INTERVAL_MS);
}

function stopPolling(): void {
	if (pollTimer && tiles.size === 0) {
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
		if (tile.speakerIp) {
			const last = lastState.get(tile.speakerIp);
			renderTile(tile, last ? { ...last, configured: true } : { configured: true });
			void refreshIp(tile.speakerIp);
		} else {
			renderTile(tile, { configured: false });
		}
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
			lastState.set(speakerIp, { volume: newVolume, muted });
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
