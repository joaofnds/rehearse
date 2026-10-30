import { z } from "zod";

/**
 * The effort levels a session runs at. This module imports only Zod, so the
 * client offers the same levels the harness accepts.
 */
const effortSchema = z.enum(["low", "medium", "high", "xhigh", "max"]);

type Effort = z.infer<typeof effortSchema>;

export default effortSchema;
export type { Effort };
