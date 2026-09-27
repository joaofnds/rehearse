import { QueryClient } from "@tanstack/react-query";
import { RecordNotFoundError } from "#client/record-not-found";

const MAX_ATTEMPTS = 3;

/**
 * The client the app runs on, built here rather than inline so a test can
 * exercise the policy that ships instead of a permissive one of its own.
 *
 * A record that is not there is an answer, not a fault. Retrying it holds the
 * screen on neither the loading nor the empty branch for the length of the
 * backoff, which reads as a blank page. Everything else keeps its retries,
 * where a second attempt can still win.
 */
export function createQueryClient(): QueryClient {
	return new QueryClient({
		defaultOptions: {
			queries: {
				retry: (failureCount, error) =>
					!(error instanceof RecordNotFoundError) &&
					failureCount < MAX_ATTEMPTS,
			},
		},
	});
}
