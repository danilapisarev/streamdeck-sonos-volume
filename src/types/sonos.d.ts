declare module 'sonos' {
	export class Sonos {
		constructor(host: string, port?: number);

		readonly host: string;

		getVolume(): Promise<number>;
		setVolume(volume: number): Promise<void>;
		getMuted(): Promise<boolean>;
		setMuted(muted: boolean): Promise<void>;
		getName(): Promise<string>;

		/** Resolves to 'playing' | 'paused' | 'stopped' | 'transitioning' | 'no_media'. */
		getCurrentState(): Promise<string>;
		play(): Promise<boolean>;
		pause(): Promise<boolean>;
		stop(): Promise<boolean>;
		togglePlayback(): Promise<boolean>;
		/** Skip to the next track in the queue. */
		next(): Promise<boolean>;
		/** Skip to the previous track in the queue. */
		previous(): Promise<boolean>;
	}

	/** Promise-based SSDP discovery of Sonos devices on the local network. */
	export class AsyncDeviceDiscovery {
		/** Resolve with the first speaker that answers. Rejects on timeout. */
		discover(options?: { timeout?: number }): Promise<Sonos>;
		/** Resolve with every speaker that answers within the timeout window. */
		discoverMultiple(options?: { timeout?: number }): Promise<Sonos[]>;
	}
}
