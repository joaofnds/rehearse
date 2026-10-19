const inputPatterns: ReadonlySet<string> = new Set([
	"cases/*/fixture/**",
	".benchmark-runs",
	"**/.benchmark-runs",
	"backlog/**",
	"docs/recovered/**",
	"docs/design-handoff/**",
]);

export { inputPatterns as default };
