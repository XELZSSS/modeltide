import { isRecognizedNonOpenLicense } from "@/server/formats/licenses";

export interface LicenseDrops {
  withoutTag: number;
  declaredNonOpen: number;
  unknownTags: string[];
  noDownloads: number;
}

/** Counts why rows were dropped by the Hugging Face license and download gates. */
export class LicenseDropTally {
  private withoutTag = 0;
  private declaredNonOpen = 0;
  private noDownloads = 0;
  private readonly unknownTags = new Set<string>();

  record(ids: readonly string[], license: string | null): void {
    if (ids.length === 0) {
      this.withoutTag += 1;
      return;
    }
    if (license != null) return;
    this.declaredNonOpen += 1;
    for (const id of ids) {
      if (!isRecognizedNonOpenLicense(id)) this.unknownTags.add(id);
    }
  }

  drops(): LicenseDrops {
    return {
      withoutTag: this.withoutTag,
      declaredNonOpen: this.declaredNonOpen,
      unknownTags: [...this.unknownTags],
      noDownloads: this.noDownloads,
    };
  }

  recordNoDownloads(): void {
    this.noDownloads += 1;
  }
}
