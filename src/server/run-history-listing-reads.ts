import {
	replayListing,
	sessionListing,
} from "#server/run-history-attempt-listing";
import confirmationListing from "#server/run-history-confirmation-listing";
import type {
	ListingEnvironment,
	ListingIndexes,
	RowRead,
} from "#server/run-history-listing-contract";
import pipelineListing from "#server/run-history-pipeline-listing";

async function listingReads(
	environment: ListingEnvironment,
	indexes: ListingIndexes,
): Promise<readonly RowRead[]> {
	return [
		...(await pipelineListing(environment, indexes)),
		...(await sessionListing(environment, indexes)),
		...(await replayListing(environment, indexes)),
		...(await confirmationListing(environment, indexes)),
	];
}

export { listingReads as default };
