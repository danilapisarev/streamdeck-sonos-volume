// Generates marketing assets for the Elgato Marketplace listing into ./marketing
//   - product-icon.png       1024x1024 product/store icon
//   - preview-stacked.png    the vertical Up/Down pair (left bar)
//   - preview-rightbar.png   the pair with the bar on the right
//   - preview-playpause.png  the Play/Pause key in both states
//   - preview-setup.png      the settings panel (speaker auto-discovery)
// Run with: npm run marketing

import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import url from 'node:url';

import { playbackIconSvg, volumeIconSvg } from '../src/icon.ts';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '../marketing');
mkdirSync(outDir, { recursive: true });

const UP = '#3ddc84';
const DOWN = '#ff9f43';

function svgToPng(svg, width) {
	return new Resvg(svg, {
		fitTo: { mode: 'width', value: width },
		background: 'rgba(0,0,0,0)',
		font: { loadSystemFonts: true },
	}).render().asPng();
}

// ---- Product icon (1024) -------------------------------------------------
function productIconSvg() {
	const cx = 632;
	const W = 118;
	const chev = (yTip, yBase, color) =>
		`<path d="M ${cx - W} ${yBase} L ${cx} ${yTip} L ${cx + W} ${yBase}" fill="none" stroke="${color}" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"/>`;
	// Vertical bar on the left, filled ~64% (amber -> green gradient).
	const barX = 168;
	const barW = 92;
	const barTop = 196;
	const barBottom = 828;
	const barH = barBottom - barTop;
	const fillH = Math.round(barH * 0.64);
	const fillY = barBottom - fillH;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
		<defs>
			<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0" stop-color="#2c2c2e"/><stop offset="1" stop-color="#0d0d0e"/>
			</linearGradient>
			<linearGradient id="fill" x1="0" y1="1" x2="0" y2="0">
				<stop offset="0" stop-color="${DOWN}"/><stop offset="1" stop-color="${UP}"/>
			</linearGradient>
		</defs>
		<rect x="32" y="32" width="960" height="960" rx="200" fill="#1c1c1e"/>
		<rect x="32" y="32" width="960" height="960" rx="200" fill="url(#bg)" fill-opacity="0.6"/>
		<rect x="${barX}" y="${barTop}" width="${barW}" height="${barH}" rx="${barW / 2}" fill="#3a3a3d"/>
		<rect x="${barX}" y="${fillY}" width="${barW}" height="${fillH}" rx="${barW / 2}" fill="url(#fill)"/>
		${chev(300, 372, UP)}${chev(372, 444, UP)}
		${chev(724, 652, DOWN)}${chev(652, 580, DOWN)}
	</svg>`;
}

// ---- Preview backdrop with the stacked pair ------------------------------
function previewPng(barSide, upVol, dnVol, title, subtitle) {
	const W = 1600;
	const H = 1000;
	const backdrop = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
		<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#1b1d24"/><stop offset="1" stop-color="#0c0d11"/>
		</linearGradient></defs>
		<rect width="${W}" height="${H}" fill="url(#g)"/>
		<text x="120" y="296" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="64" font-weight="700" fill="#ffffff">${title}</text>
		<text x="120" y="360" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="38" font-weight="400" fill="#9aa0ad">${subtitle}</text>
	</svg>`;
	const base = new Resvg(backdrop, { background: '#0c0d11', font: { loadSystemFonts: true } });
	const baseImg = base.render();
	// Render the two keys and composite by re-embedding as <image> in a wrapper.
	const keySize = 300;
	const upPng = svgToPng(volumeIconSvg({ direction: 1, volume: upVol, barSide, configured: true }), keySize);
	const dnPng = svgToPng(volumeIconSvg({ direction: -1, volume: dnVol, barSide, configured: true }), keySize);
	const upB64 = Buffer.from(upPng).toString('base64');
	const dnB64 = Buffer.from(dnPng).toString('base64');
	const gap = 28;
	const kx = 1060;
	const upY = 320;
	const wrapper = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
		<image href="data:image/png;base64,${baseImg.asPng().toString('base64')}" x="0" y="0" width="${W}" height="${H}"/>
		<image href="data:image/png;base64,${upB64}" x="${kx}" y="${upY}" width="${keySize}" height="${keySize}"/>
		<image href="data:image/png;base64,${dnB64}" x="${kx}" y="${upY + keySize + gap}" width="${keySize}" height="${keySize}"/>
	</svg>`;
	return svgToPng(wrapper, W);
}

// A skip-to-next glyph (⏭) on the same key backdrop as the play/pause keys.
// Drawn here rather than in src/icon.ts because the plugin reuses the
// Play/Pause key for skip (double-press) — there is no dedicated "next" action.
const SKIP_ACCENT = '#5ac8fa'; // blue — distinguishes the double-press action
function skipNextIconSvg(accent = SKIP_ACCENT) {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
		<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="#2c2c2e"/><stop offset="1" stop-color="#161617"/>
		</linearGradient></defs>
		<rect x="4" y="4" width="136" height="136" rx="26" fill="url(#bg)"/>
		<path d="M 37 48 L 65 72 L 37 96 Z" fill="${accent}" stroke="${accent}" stroke-width="6" stroke-linejoin="round"/>
		<path d="M 65 48 L 93 72 L 65 96 Z" fill="${accent}" stroke="${accent}" stroke-width="6" stroke-linejoin="round"/>
		<rect x="95" y="46" width="13" height="52" rx="4" fill="${accent}"/>
	</svg>`;
}

// ---- Play / Pause preview (key shown in all three states) ---------------
function playbackPreviewPng() {
	const W = 1600;
	const H = 1000;
	const FONT = 'Helvetica Neue, Helvetica, Arial, sans-serif';

	const backdrop = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
		<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#1b1d24"/><stop offset="1" stop-color="#0c0d11"/>
		</linearGradient></defs>
		<rect width="${W}" height="${H}" fill="url(#g)"/>
		<text x="${W / 2}" y="236" text-anchor="middle" font-family="${FONT}" font-size="64" font-weight="700" fill="#ffffff">Play / Pause</text>
		<text x="${W / 2}" y="300" text-anchor="middle" font-family="${FONT}" font-size="38" font-weight="400" fill="#9aa0ad">Tap to play or pause — double-tap to skip a track</text>
	</svg>`;
	const baseImg = new Resvg(backdrop, { background: '#0c0d11', font: { loadSystemFonts: true } }).render();

	const keySize = 240;
	const playingB64 = Buffer.from(svgToPng(playbackIconSvg({ playing: true, configured: true }), keySize)).toString('base64');
	const idleB64 = Buffer.from(svgToPng(playbackIconSvg({ playing: false, configured: true }), keySize)).toString('base64');
	const nextB64 = Buffer.from(svgToPng(skipNextIconSvg(), keySize)).toString('base64');

	// Three keys side by side, centred horizontally, each with a caption.
	const gap = 90;
	const total = keySize * 3 + gap * 2;
	const k1x = Math.round((W - total) / 2);
	const k2x = k1x + keySize + gap;
	const k3x = k2x + keySize + gap;
	const ky = 430;
	const capY = ky + keySize + 70;
	const caption = (x, text, color) =>
		`<text x="${x + keySize / 2}" y="${capY}" text-anchor="middle" font-family="${FONT}" font-size="32" font-weight="600" fill="${color}">${text}</text>`;

	const wrapper = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
		<image href="data:image/png;base64,${baseImg.asPng().toString('base64')}" x="0" y="0" width="${W}" height="${H}"/>
		<image href="data:image/png;base64,${playingB64}" x="${k1x}" y="${ky}" width="${keySize}" height="${keySize}"/>
		<image href="data:image/png;base64,${idleB64}" x="${k2x}" y="${ky}" width="${keySize}" height="${keySize}"/>
		<image href="data:image/png;base64,${nextB64}" x="${k3x}" y="${ky}" width="${keySize}" height="${keySize}"/>
		${caption(k1x, 'Playing → tap to pause', '#3ddc84')}
		${caption(k2x, 'Idle → tap to play', '#aeb4c0')}
		${caption(k3x, 'Double-tap → next track', SKIP_ACCENT)}
	</svg>`;
	return svgToPng(wrapper, W);
}

// ---- Setup / settings preview -------------------------------------------
function settingsPreviewPng() {
	const W = 1600;
	const H = 1000;
	const FONT = 'Helvetica Neue, Helvetica, Arial, sans-serif';

	const bullets = [
		["Pick your speaker — found automatically", UP],
		["Volume Up / Down and Play / Pause keys", '#5b6472'],
		["No Sonos app needed — works over your network", '#5b6472'],
	];
	const bulletSvg = bullets
		.map(([t, dot], i) => {
			const y = 372 + i * 72;
			return `<circle cx="138" cy="${y - 11}" r="7" fill="${dot}"/>
				<text x="168" y="${y}" font-family="${FONT}" font-size="32" fill="#aeb4c0">${t}</text>`;
		})
		.join('');

	const cardX = 900;
	const cardY = 200;
	const cardW = 560;
	const cardH = 600;
	const fx = cardX + 40;
	const fw = cardW - 80;

	const field = (y, label, value, { accent = false, select = false } = {}) => {
		const stroke = accent ? UP : '#2a2c33';
		return `<text x="${fx}" y="${y}" font-family="${FONT}" font-size="26" fill="#c5c9d3">${label}</text>
			<rect x="${fx}" y="${y + 16}" width="${fw}" height="60" rx="12" fill="#0d0e12" stroke="${stroke}" stroke-width="${accent ? 2.5 : 1.5}"/>
			<text x="${fx + 24}" y="${y + 55}" font-family="${FONT}" font-size="30" fill="#ffffff">${value}</text>
			${select ? `<text x="${fx + fw - 34}" y="${y + 54}" font-family="${FONT}" font-size="26" fill="#8a8f9a">▾</text>` : ''}`;
	};

	// A small outline "button" (the Rescan network control).
	const button = (y, label) => {
		const bw = 230;
		return `<rect x="${fx}" y="${y}" width="${bw}" height="52" rx="12" fill="#1c1e25" stroke="#3a3d47" stroke-width="1.5"/>
			<text x="${fx + bw / 2}" y="${y + 35}" text-anchor="middle" font-family="${FONT}" font-size="26" fill="#c5c9d3">${label}</text>`;
	};

	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
		<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#1b1d24"/><stop offset="1" stop-color="#0c0d11"/>
		</linearGradient></defs>
		<rect width="${W}" height="${H}" fill="url(#g)"/>
		<text x="120" y="276" font-family="${FONT}" font-size="64" font-weight="700" fill="#ffffff">Quick setup</text>
		${bulletSvg}

		<rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="28" fill="#14151a" stroke="#2a2c33" stroke-width="1.5"/>
		<text x="${fx}" y="${cardY + 64}" font-family="${FONT}" font-size="26" font-weight="600" fill="#8a8f9a">ACTION SETTINGS</text>
		${field(cardY + 130, 'Speaker', 'Living Room  (192.168.1.50)', { accent: true, select: true })}
		<text x="${fx}" y="${cardY + 268}" font-family="${FONT}" font-size="22" fill="${UP}">Auto-discovered on your network</text>
		${button(cardY + 296, 'Rescan network')}
		${field(cardY + 410, 'Speaker IP', '192.168.1.50', {})}
	</svg>`;
	return svgToPng(svg, W);
}

console.log('Generating marketing assets ->', outDir);
writeFileSync(path.join(outDir, 'product-icon.png'), svgToPng(productIconSvg(), 1024));
console.log('  ✓ product-icon.png 1024x1024');
writeFileSync(
	path.join(outDir, 'preview-stacked.png'),
	previewPng('left', 64, 64, 'Volume for AirPlay Sonos', 'Up / Down keys with a live volume bar'),
);
console.log('  ✓ preview-stacked.png 1600x1000');
writeFileSync(
	path.join(outDir, 'preview-rightbar.png'),
	previewPng('right', 30, 30, 'Bar on either side', 'Show the volume bar on the left or the right'),
);
console.log('  ✓ preview-rightbar.png 1600x1000');
writeFileSync(path.join(outDir, 'preview-playpause.png'), playbackPreviewPng());
console.log('  ✓ preview-playpause.png 1600x1000');
writeFileSync(path.join(outDir, 'preview-setup.png'), settingsPreviewPng());
console.log('  ✓ preview-setup.png 1600x1000');
console.log('Done.');
