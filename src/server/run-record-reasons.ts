const INTERRUPTED_REASON = "the run was interrupted before its final judge";

const RUN_FAILED_REASON = "the run failed before its final judge";

const PAUSED_REASON = "the run ended paused before its final judge";

const OPERATOR_STOPPED_REASON =
	"the operator stopped the run before its final judge";

const AWAITING_JUDGMENT_REASON =
	"the run ended while this stage awaited judgment";

const AWAITING_GRADE_REASON = "the stage's judge has not returned";

const UNEXPLAINED_END_REASON = "the run ended without recording how it ended";

const UNREADABLE_ENDING_REASON =
	"the records that say how the run ended could not be read";

const PRODUCT_OWNER_COST_REASON =
	"neither a main artifact nor a stop record holds the Product Owner's cost, as the run wrote neither, they predate it, or the run stopped before a stage's judge returned a grade";

const STOPPED_GRADE_REASON =
	"the stop record keeps no letter grade, as it predates the letter or its judge returned none";

const WALL_TIME_REASON =
	"the stage record keeps no elapsed time, as it predates the reading or its judge returned no grade";

const RUN_WALL_TIME_REASON =
	"neither a main artifact nor a stop record holds the run's elapsed time, as the run wrote neither, they predate it, or the run stopped before a stage's judge returned a grade";

const UNRECORDED_STAGE_REASON =
	"the stage has written no record, and the run ended or is running in it";

const UNREACHED_STAGE_REASON = "the run has not reached the stage";

const MISSING_STAGE_RECORD_REASON = "the stage has written no record";

const CALL_WITHOUT_METRICS_REASON = "a call in the record has no metrics";

const UNGRADED_BLOCKERS_REASON =
	"the stage record holds no graded hard blockers";

const MINIMUM_GRADE_REASON = "the run manifest predates the minimum grade";

const PRODUCT_OWNER_TOKENS_REASON =
	"neither a main artifact nor a stop record holds the Product Owner's calls, as the run wrote neither, they predate them, or the run stopped before a stage's judge returned a grade";

export {
	INTERRUPTED_REASON,
	RUN_FAILED_REASON,
	PAUSED_REASON,
	OPERATOR_STOPPED_REASON,
	AWAITING_JUDGMENT_REASON,
	AWAITING_GRADE_REASON,
	UNEXPLAINED_END_REASON,
	UNREADABLE_ENDING_REASON,
	PRODUCT_OWNER_COST_REASON,
	STOPPED_GRADE_REASON,
	WALL_TIME_REASON,
	RUN_WALL_TIME_REASON,
	UNRECORDED_STAGE_REASON,
	UNREACHED_STAGE_REASON,
	MISSING_STAGE_RECORD_REASON,
	CALL_WITHOUT_METRICS_REASON,
	UNGRADED_BLOCKERS_REASON,
	MINIMUM_GRADE_REASON,
	PRODUCT_OWNER_TOKENS_REASON,
};
