/**
 * Renders the Stream Deck key image for a volume button as an SVG data URI.
 *
 * The image is drawn dynamically so the key can show the speaker's current
 * volume. The layout is designed for the two keys stacked vertically — Volume
 * Down placed directly under Volume Up — so their side bars line up into a
 * single continuous volume column:
 *
 *   - Volume Up   (top)    represents the 50–100% half of the range.
 *   - Volume Down (bottom) represents the 0–50% half of the range.
 *
 * The fill grows from the bottom of the lower key up through the top of the
 * upper key. Each key also shows its direction chevrons and the current volume
 * percentage. The bar sits on the left edge by default, or the right edge when
 * `barSide` is `'right'`.
 *
 * Stream Deck renders SVG natively, so this is set at runtime via
 * `action.setImage(...)`.
 */

export type VolumeIconOptions = {
	/** Direction of the button: +1 (up, top half) or -1 (down, bottom half). */
	direction: 1 | -1;
	/** Current volume 0-100. Omit when unknown / not yet read. */
	volume?: number;
	/** Whether the speaker is muted. */
	muted?: boolean;
	/** Whether a speaker IP has been configured. */
	configured?: boolean;
	/** Which edge the volume bar is drawn on. Defaults to `'left'`. */
	barSide?: 'left' | 'right';
	/** Whether to draw the volume percentage number. Defaults to `true`. */
	showPercent?: boolean;
};

const UP_ACCENT = '#3ddc84'; // green
const DOWN_ACCENT = '#ff9f43'; // amber
const MUTED_ACCENT = '#8a8a8e'; // grey

/**
 * Builds the raw SVG markup for a volume key.
 */
export function volumeIconSvg(opts: VolumeIconOptions): string {
	const {
		direction,
		volume,
		muted = false,
		configured = true,
		barSide = 'left',
		showPercent = true,
	} = opts;

	const hasVolume = configured && typeof volume === 'number' && !Number.isNaN(volume);
	const clamped = hasVolume ? Math.max(0, Math.min(100, Math.round(volume!))) : 0;
	const accent = muted ? MUTED_ACCENT : direction > 0 ? UP_ACCENT : DOWN_ACCENT;

	// --- Vertical volume bar (this key's half of the 0-100 column) ---
	const barW = 10;
	const barMargin = 12;
	const barTop = 14;
	const barBottom = 130;
	const barH = barBottom - barTop;
	const barX = barSide === 'right' ? 144 - barMargin - barW : barMargin;
	const radius = barW / 2;

	// This key covers [lo, hi]; fill is the fraction of that sub-range reached.
	const lo = direction > 0 ? 50 : 0;
	const hi = direction > 0 ? 100 : 50;
	const fraction = hasVolume ? Math.max(0, Math.min(1, (clamped - lo) / (hi - lo))) : 0;
	const fillH = Math.round(barH * fraction);
	const fillY = barBottom - fillH;
	const fillRadius = Math.min(radius, fillH / 2);

	const bar = `
		<rect x="${barX}" y="${barTop}" width="${barW}" height="${barH}" rx="${radius}" fill="#3a3a3d"/>
		${
			fillH > 0
				? `<rect x="${barX}" y="${fillY}" width="${barW}" height="${fillH}" rx="${fillRadius}" fill="${accent}"/>`
				: ''
		}`;

	// Content (chevrons + number) is centred in the area beside the bar.
	const cx = barSide === 'right' ? 68 : 80;

	// --- Direction chevrons (two stacked) ---
	const chevronWidth = 20;
	const chevron = (yTip: number, yBase: number) =>
		`<path d="M ${cx - chevronWidth} ${yBase} L ${cx} ${yTip} L ${cx + chevronWidth} ${yBase}" ` +
		`fill="none" stroke="${accent}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`;
	const chevrons =
		direction > 0 ? chevron(20, 36) + chevron(34, 50) : chevron(50, 36) + chevron(36, 22);

	// --- Center number (current volume, never the step) ---
	// Optional: a key can hide the number, e.g. show it on only one of the pair.
	const numberText = hasVolume ? String(clamped) : '—';
	const numberFontSize = hasVolume ? 46 : 42;
	const center = showPercent
		? `<text x="${cx}" y="98" text-anchor="middle"
			font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
			font-size="${numberFontSize}" font-weight="700" fill="#ffffff">${numberText}${
				hasVolume ? '<tspan font-size="20" font-weight="600" dx="2" dy="-2">%</tspan>' : ''
			}</text>`
		: '';

	// --- Mute badge (small slashed speaker), placed opposite the bar ---
	const badgeX = barSide === 'right' ? 24 : 96;
	const muteBadge = muted
		? `<g transform="translate(${badgeX},58)">
				<path d="M0,4 L6,4 L13,-3 L13,17 L6,10 L0,10 Z" fill="${MUTED_ACCENT}"/>
				<line x1="-2" y1="-4" x2="18" y2="18" stroke="#ff453a" stroke-width="3" stroke-linecap="round"/>
			</g>`
		: '';

	return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
		<defs>
			<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0" stop-color="#2c2c2e"/>
				<stop offset="1" stop-color="#161617"/>
			</linearGradient>
		</defs>
		<rect x="4" y="4" width="136" height="136" rx="26" fill="url(#bg)"/>
		${bar}
		${chevrons}
		${center}
		${muteBadge}
	</svg>`.replace(/\n\s*/g, ' ');
}

/**
 * Wraps the SVG markup in a base64 data URI suitable for `action.setImage`.
 */
export function volumeIconDataUri(opts: VolumeIconOptions): string {
	const svg = volumeIconSvg(opts);
	const base64 = Buffer.from(svg, 'utf8').toString('base64');
	return `data:image/svg+xml;base64,${base64}`;
}

// --- Play / Pause key ------------------------------------------------------
// The button shows the action a press will perform: a ▶ play glyph when the
// speaker is not playing (press → play), or a ⏸ pause glyph when it is
// (press → pause). A green tint marks the actively-playing state.

const PLAYING_ACCENT = '#3ddc84'; // green — speaker is playing
const IDLE_ACCENT = '#e5e5e7'; // near-white — idle / will play on press
const UNCONFIGURED_ACCENT = '#8a8a8e'; // grey — no speaker set yet

export type PlaybackIconOptions = {
	/** Whether the speaker is currently playing. */
	playing?: boolean;
	/** Whether a speaker IP has been configured. */
	configured?: boolean;
};

/**
 * Builds the raw SVG markup for a play/pause key.
 */
export function playbackIconSvg(opts: PlaybackIconOptions): string {
	const { playing = false, configured = true } = opts;
	const accent = !configured ? UNCONFIGURED_ACCENT : playing ? PLAYING_ACCENT : IDLE_ACCENT;

	// Glyphs are centred in the 144×144 key around (72, 72).
	const playing_ = configured && playing;
	const glyph = playing_
		? // Pause: two rounded vertical bars.
			`<rect x="52" y="46" width="14" height="52" rx="4" fill="${accent}"/>
			 <rect x="78" y="46" width="14" height="52" rx="4" fill="${accent}"/>`
		: // Play: right-pointing triangle with softly rounded corners.
			`<path d="M 56 46 L 96 72 L 56 98 Z" fill="${accent}"
				stroke="${accent}" stroke-width="6" stroke-linejoin="round"/>`;

	return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
		<defs>
			<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0" stop-color="#2c2c2e"/>
				<stop offset="1" stop-color="#161617"/>
			</linearGradient>
		</defs>
		<rect x="4" y="4" width="136" height="136" rx="26" fill="url(#bg)"/>
		${glyph}
	</svg>`.replace(/\n\s*/g, ' ');
}

/**
 * Wraps the play/pause SVG markup in a base64 data URI for `action.setImage`.
 */
export function playbackIconDataUri(opts: PlaybackIconOptions): string {
	const svg = playbackIconSvg(opts);
	const base64 = Buffer.from(svg, 'utf8').toString('base64');
	return `data:image/svg+xml;base64,${base64}`;
}
