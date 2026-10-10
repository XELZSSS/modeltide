import { describe, expect, it } from "vitest";
import { buildContext, type Env } from "@/server/context";
import { parseGoogleCloudIncidentLog, parseStatuspageIncidents } from "@/server/parsers/incident-parser";
import { getSourceIncidentLog } from "./incident-log-source";

function stubFetch(handler: (url: string) => Response): typeof fetch {
  return ((url: unknown) => Promise.resolve(handler(String(url)))) as typeof fetch;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function statuspageIncidents() {
  return {
    incidents: [
      {
        id: "abc123",
        name: "Delayed Costs data in the Compliance API",
        status: "monitoring",
        impact: "minor",
        created_at: "2026-10-09T10:00:00Z",
        updated_at: "2026-10-09T12:00:00Z",
        shortlink: "https://status.openai.com/incidents/abc123",
        incident_updates: [
          {
            status: "monitoring",
            body: "<p>We have implemented a <strong>mitigation</strong>.</p>",
            created_at: "2026-10-09T12:00:00Z",
          },
          {
            status: "identified",
            body: "<p>We identified the cause.</p>",
            created_at: "2026-10-09T11:00:00Z",
          },
        ],
      },
      { id: "empty", name: "   ", status: "resolved" },
    ],
  };
}

describe("parseStatuspageIncidents", () => {
  it("parses incidents with plain-text update bodies", () => {
    const parsed = parseStatuspageIncidents(statuspageIncidents());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data).toHaveLength(1);
    const [incident] = parsed.data;
    expect(incident?.name).toBe("Delayed Costs data in the Compliance API");
    expect(incident?.shortlink).toBe("https://status.openai.com/incidents/abc123");
    expect(incident?.updates).toHaveLength(2);
    expect(incident?.updates[0]?.body).toBe("We have implemented a mitigation.");
    expect(incident?.updates[0]?.status).toBe("monitoring");
  });

  it("fails when the payload has no incidents array", () => {
    expect(parseStatuspageIncidents({ page: {} }).ok).toBe(false);
    expect(parseStatuspageIncidents(null).ok).toBe(false);
  });
});

describe("parseGoogleCloudIncidentLog", () => {
  it("maps GCP incidents and their updates", () => {
    const parsed = parseGoogleCloudIncidentLog([
      {
        number: 1234,
        external_desc: "Elevated errors on platform.cloud.com",
        begin: "2026-10-08T12:19:00+00:00",
        end: "",
        modified: "2026-10-09T16:50:52+00:00",
        severity: "medium",
        uri: "https://status.cloud.google.com/incidents/1234",
        updates: [{ when: "2026-10-09T16:44:56+00:00", text: "## Update\nWorking on it.", status: "update" }],
      },
    ]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data).toHaveLength(1);
    expect(parsed.data[0]?.status).toBe("update");
    expect(parsed.data[0]?.updates).toHaveLength(1);
  });
});

describe("getSourceIncidentLog", () => {
  it("fetches statuspage incidents for a provider source", async () => {
    const ctx = buildContext({} as Env, {
      fetchImpl: stubFetch((url) =>
        url.includes("/incidents.json") ? jsonResponse(200, statuspageIncidents()) : jsonResponse(404, {}),
      ),
    });
    const payload = await getSourceIncidentLog(ctx, "openaiApi");
    expect(payload.data.source).toBe("openaiApi");
    expect(payload.data.pageUrl).toBe("https://status.openai.com");
    expect(payload.data.incidents).toHaveLength(1);
  });

  it("returns an empty log for sources without an incident feed", async () => {
    const ctx = buildContext({} as Env, { fetchImpl: stubFetch(() => jsonResponse(200, {})) });
    const payload = await getSourceIncidentLog(ctx, "huggingface");
    expect(payload.data.incidents).toEqual([]);
    expect(payload.data.pageUrl).toBeNull();
  });

  it("degrades to an empty log when upstream fails", async () => {
    // NOTE: a different source id than the success case, the in-memory cache
    // is shared process-wide and would otherwise serve the earlier result.
    const ctx = buildContext({} as Env, { fetchImpl: stubFetch(() => jsonResponse(500, { error: "boom" })) });
    const payload = await getSourceIncidentLog(ctx, "groqApi");
    expect(payload.data.incidents).toEqual([]);
    expect(payload.partial).toBe(true);
  });
});
