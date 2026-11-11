/**
 * The Flight prop names Artificial Analysis pages carry their rows under.
 *
 * `initialModels` is the one marker two readers key off: the leaderboard parser resolves the index rows from it, and
 * both enrichment pages project their rows out of it, so a renamed prop fails both instead of only one.
 */
export const AA_FLIGHT_MARKERS = {
  models: "initialModels",
} as const;
