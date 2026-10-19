import { z } from "zod";

import type { Immutable } from "#benchmark/contracts";

const REQUIRED_LIST_MINIMUM_ITEMS = 1;

const LOADING_BENCHMARK_POLICY = {
	defaultRepetitions: 5,
	maximumRepetitions: 50,
	minimumComparisonRepetitions: 5,
	minimumRepetitions: 1,
	schemaVersion: 1,
} as const;

const readingSchema = z.object({
	bytes: z.number().int().nonnegative(),
	ms: z.number().nonnegative(),
	path: z.string(),
	sha256: z.string().nullable(),
});

const endpointTimingSchema = z.object({
	bytes: z.number().int().nonnegative(),
	firstMs: z.number().nonnegative(),
	medianMs: z.number().nonnegative(),
	p95Ms: z.number().nonnegative(),
	path: z.string(),
	samplesMs: z.array(z.number().nonnegative()).min(REQUIRED_LIST_MINIMUM_ITEMS),
	sha256: z.string().nullable(),
});

const freshnessTimingSchema = z.object({
	readyMs: z.number().nonnegative(),
	request: readingSchema,
});

const startupTimingSchema = z.object({
	freshness: freshnessTimingSchema,
	listReadyMs: z.number().nonnegative(),
	ms: z.number().nonnegative(),
	requests: z.array(readingSchema).min(REQUIRED_LIST_MINIMUM_ITEMS),
});

const loadingBenchmarkSchema = z.object({
	base: z.url(),
	endpoints: z.array(endpointTimingSchema).min(REQUIRED_LIST_MINIMUM_ITEMS),
	environment: z.object({
		arch: z.string(),
		bun: z.string(),
		cpu: z.string(),
		platform: z.string(),
	}),
	repetitions: z
		.number()
		.int()
		.min(LOADING_BENCHMARK_POLICY.minimumRepetitions)
		.max(LOADING_BENCHMARK_POLICY.maximumRepetitions),
	startup: z.array(startupTimingSchema).min(REQUIRED_LIST_MINIMUM_ITEMS),
	version: z.literal(LOADING_BENCHMARK_POLICY.schemaVersion),
});

type LoadingBenchmark = Immutable<z.infer<typeof loadingBenchmarkSchema>>;

export { LOADING_BENCHMARK_POLICY, loadingBenchmarkSchema };
export type { LoadingBenchmark };
