import { API_DOMAINS } from "@/shared/config";

// Version carried INSIDE the record, never in its key: bump only on an
// incompatible shape. An absent `v` is salvaged; an unknown one is unreadable.
export const HISTORY_SCHEMA_VERSION = 1;

export const HISTORY_KEY = API_DOMAINS.statusHistory;

export const FIRST_LAUNCH_KEY = "uptime:first-launch";

export const SAMPLE_LOCK_KEY = `${API_DOMAINS.statusHistory}:lock`;
