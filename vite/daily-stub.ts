// The wrapper lazy-imports "@daily-co/daily-js" with a literal specifier, which Vite resolves even behind
// /* @vite-ignore */ and fails when Daily isn't installed. This tester is LiveKit-only, so stub it out.
export default undefined;
