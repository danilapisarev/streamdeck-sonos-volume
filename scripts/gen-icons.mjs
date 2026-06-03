// Generates the static PNG icons referenced by manifest.json from SVG, using
// @resvg/resvg-js (preserves transparency, renders strokes/gradients).
// Run with: npm run icons
//
// - Key default images (States[].Image): the rich rounded-key look (shown until
//   the plugin sets a live image via setImage).
// - Action list / category glyph (Icon / CategoryIcon): a simple white glyph.
//
// The rich runtime icon (with the live volume number) lives in src/icon.ts.
// This file keeps the *default* look in sync; it only draws the no-volume state.

import { Resvg } from '@resvg/resvg-js';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '../com.danila.sonos-volume.sdPlugin/imgs/actions');

const UP_ACCENT = '#3ddc84';
const DOWN_ACCENT = '#ff9f43';

function chevron(cx, yTip, yBase, stroke, width = 8) {
	const w = 22;
	return `<path d="M ${cx - w} ${yBase} L ${cx} ${yTip} L ${cx + w} ${yBase}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

// Rich default key icon: rounded background, chevrons, empty vertical bar on the
// left, dash for the (unknown) volume. Matches the no-volume runtime state.
function keySvg(direction) {
	const accent = direction > 0 ? UP_ACCENT : DOWN_ACCENT;
	const cx = 80; // content centred beside the left bar
	const chevrons =
		direction > 0
			? chevron(cx, 20, 36, accent) + chevron(cx, 34, 50, accent)
			: chevron(cx, 50, 36, accent) + chevron(cx, 36, 22, accent);
	return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
		<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="#2c2c2e"/><stop offset="1" stop-color="#161617"/>
		</linearGradient></defs>
		<rect x="4" y="4" width="136" height="136" rx="26" fill="url(#bg)"/>
		<rect x="12" y="14" width="10" height="116" rx="5" fill="#3a3a3d"/>
		${chevrons}
		<rect x="${cx - 13}" y="90" width="26" height="6" rx="3" fill="#ffffff"/>
	</svg>`;
}

// Simple white glyph for the action list / category (speaker + chevrons).
function glyphSvg(direction) {
	const cx = 72;
	const chevrons =
		direction > 0
			? chevron(cx, 16, 34, '#ffffff', 9) + chevron(cx, 34, 52, '#ffffff', 9)
			: chevron(cx, 52, 34, '#ffffff', 9) + chevron(cx, 34, 16, '#ffffff', 9);
	const speaker = `<path d="M 50,86 L 62,86 L 80,70 L 80,118 L 62,102 L 50,102 Z" fill="#ffffff"/>
		<path d="M 88,80 q 10,14 0,28" fill="none" stroke="#ffffff" stroke-width="6" stroke-linecap="round"/>`;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
		${chevrons}
		${speaker}
	</svg>`;
}

// Rich default key icon for Play/Pause: rounded background with a play glyph,
// matching the idle runtime state (src/icon.ts draws the live play/pause).
function playKeySvg() {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
		<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="#2c2c2e"/><stop offset="1" stop-color="#161617"/>
		</linearGradient></defs>
		<rect x="4" y="4" width="136" height="136" rx="26" fill="url(#bg)"/>
		<path d="M 56 46 L 96 72 L 56 98 Z" fill="#e5e5e7" stroke="#e5e5e7" stroke-width="6" stroke-linejoin="round"/>
	</svg>`;
}

// Simple white play glyph for the action list / category.
function playGlyphSvg() {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
		<path d="M 48 30 L 108 72 L 48 114 Z" fill="#ffffff" stroke="#ffffff" stroke-width="10" stroke-linejoin="round"/>
	</svg>`;
}

function render(svg, outFile, size) {
	const resvg = new Resvg(svg, {
		fitTo: { mode: 'width', value: size },
		background: 'rgba(0,0,0,0)', // keep transparency
	});
	writeFileSync(outFile, resvg.render().asPng());
	console.log('  ✓', path.basename(outFile), `${size}x${size}`);
}

console.log('Generating icons ->', outDir);
for (const [name, dir] of [['volumeup', 1], ['volumedown', -1]]) {
	render(keySvg(dir), path.join(outDir, `${name}_key.png`), 72);
	render(keySvg(dir), path.join(outDir, `${name}_key@2x.png`), 144);
	render(glyphSvg(dir), path.join(outDir, `${name}.png`), 20);
	render(glyphSvg(dir), path.join(outDir, `${name}@2x.png`), 40);
}

// Play/Pause action icons.
render(playKeySvg(), path.join(outDir, 'playpause_key.png'), 72);
render(playKeySvg(), path.join(outDir, 'playpause_key@2x.png'), 144);
render(playGlyphSvg(), path.join(outDir, 'playpause.png'), 20);
render(playGlyphSvg(), path.join(outDir, 'playpause@2x.png'), 40);

console.log('Done.');
