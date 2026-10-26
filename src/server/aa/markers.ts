/**
 * The Flight prop names Artificial Analysis pages carry their rows under.
 *
 * `initialModels` is the one marker two independent readers key off: the leaderboard parser resolves the index rows
 * from it, and both enrichment pages (`/models`, `/evaluations/omniscience`) project their rows out of it. The two used
 * to spell it separately, which is the failure this file prevents — a renamed prop would have failed the index parse
 * loudly while the enrichment legs kept answering rows of the wrong shape, so the payload would have lost every
 * benchmark and every price with nothing in the log but "partial".
 *
 * The decision index and the image leaderboard read their own props and name them where they are parsed: no second
 * reader exists for either, so a shared constant would only move the literal one import away.
 */
export const AA_FLIGHT_MARKERS = {
  models: "initialModels",
} as const;
