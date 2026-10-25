import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { session } from '#lib/eq/session.svelte.js';

/** Resume where the loop left off. */
export function load() {
	if (!session.setupDone) redirect(307, resolve('/setup'));
	redirect(307, resolve(session.measured ? '/results' : '/prepare'));
}
