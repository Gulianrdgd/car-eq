import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-static';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { sveltekit } from '@sveltejs/kit/vite';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => ({
	plugins: [
		// `yarn dev:phone`: https on the LAN, so a phone can open the page and use the mic
		mode === 'phone' && basicSsl(),
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// static SPA: each route gets an empty prerendered shell; 404.html catches the rest (GitHub Pages)
			adapter: adapter({ fallback: '404.html' }),
			// GitHub Pages project sites live under /<repo>; CI sets BASE_PATH
			paths: { base: (loadEnv(mode, '.', '').BASE_PATH ?? '') as '' | `/${string}` }
		})
	],
	test: {
		include: ['src/**/*.test.ts']
	}
}));
