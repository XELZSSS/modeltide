import type { StatusEvent, UptimeSample } from "@/shared/types";
import { ONE_MINUTE } from "@/shared/config";
import type { SourceId } from "./types";

/**
 * Derive state transitions from one source's samples (oldest first). A failing sample
 * opens a "down" event — including a failing first sample, where the outage start is
 * simply unknown — and the next healthy sample closes it and adds an "up" event.
 */
export function deriveEvents(id: SourceId, samples: UptimeSample[]): StatusEvent[] {
  const events: StatusEvent[] = [];
  let downAt: number | null = null;
  let openDownIndex = -1;
  for (const sample of samples) {
    if (!sample.ok && downAt == null) {
      downAt = sample.t;
      openDownIndex = events.length;
      events.push({ id, type: "down", at: new Date(sample.t).toISOString(), durationMin: null });
    } else if (sample.ok && downAt != null) {
      const down = events[openDownIndex];
      if (down) down.durationMin = Math.round((sample.t - downAt) / ONE_MINUTE);
      events.push({ id, type: "up", at: new Date(sample.t).toISOString(), durationMin: null });
      downAt = null;
      openDownIndex = -1;
    }
  }
  return events;
}
