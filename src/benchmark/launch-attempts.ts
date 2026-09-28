/** The attempt counts the launch dialog offers, and no other. */
export const LAUNCH_ATTEMPTS = [1, 3, 6, 12] as const;

export type LaunchAttempts = (typeof LAUNCH_ATTEMPTS)[number];
