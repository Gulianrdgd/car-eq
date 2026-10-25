import { resolve } from '$app/paths';
import type { Next } from './ceq';

/** Where the "Done" button on the apply screen leads. */
export function nextHref(n: Next): string {
	switch (n.kind) {
		case 'passenger':
			return resolve('/prepare') + '?seat=passenger';
		case 'ear':
			return resolve('/ear') + (n.bands.length ? `?bands=${n.bands.join(',')}` : '');
		case 'done':
			return resolve('/done');
		default:
			return resolve('/prepare');
	}
}

export const NEXT_LABELS: Record<Next['kind'], string> = {
	measure: 'Done, measure again',
	passenger: 'Done, measure passenger seat',
	ear: 'Done, tune by ear',
	done: 'Done, finish'
};
