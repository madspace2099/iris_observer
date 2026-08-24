/*
 * A stand-in for Next's `server-only` marker.
 *
 * The real package exists to make a build fail when a server module is pulled
 * into a client bundle. Under Vitest there is no client bundle and the package
 * does not resolve, so the modules that carry the marker — the AI provider,
 * tools and agent — could not be imported by a test at all.
 *
 * Aliasing it to an empty module lets the tests read those modules while the
 * real marker stays in the source, where the production build still enforces it.
 * A separate test asserts the marker is present in every file that reads a key.
 */
export {};
