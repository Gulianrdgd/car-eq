// Audio, mic and localStorage are browser-only; render on the client.
export const ssr = false;
// Prerender empty shells so static hosts can serve /results etc. directly.
export const prerender = true;
