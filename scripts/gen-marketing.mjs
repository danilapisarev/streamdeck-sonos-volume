// Generates marketing assets for the Elgato Marketplace listing into ./marketing
//   - product-icon.png      1024x1024 product/store icon
//   - preview-stacked.png   the vertical Up/Down pair (left bar)
//   - preview-rightbar.png  the pair with the bar on the right
// Run with: npm run marketing

import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import url from 'node:url';

import { volumeIconSvg } from '../src/icon.ts';

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
		<text x="120" y="300" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="86" font-weight="700" fill="#ffffff">${title}</text>
		<text x="122" y="372" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="40" font-weight="400" fill="#9aa0ad">${subtitle}</text>
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

console.log('Generating marketing assets ->', outDir);
writeFileSync(path.join(outDir, 'product-icon.png'), svgToPng(productIconSvg(), 1024));
console.log('  ✓ product-icon.png 1024x1024');
writeFileSync(
	path.join(outDir, 'preview-stacked.png'),
	previewPng('left', 64, 64, 'Sonos Volume', 'Up / Down keys with a live volume bar'),
);
console.log('  ✓ preview-stacked.png 1600x1000');
writeFileSync(
	path.join(outDir, 'preview-rightbar.png'),
	previewPng('right', 30, 30, 'Bar on either side', 'Show the volume bar on the left or the right'),
);
console.log('  ✓ preview-rightbar.png 1600x1000');
console.log('Done.');
