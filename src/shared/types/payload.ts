export interface SourcePayload<T> {
  data: T;
  fetchedAt: string;
  partial?: boolean;
}
