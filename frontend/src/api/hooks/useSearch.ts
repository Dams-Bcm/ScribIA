import { useMutation } from "@tanstack/react-query";
import { api } from "../client";
import type { SearchResponse, ReindexResponse } from "../types";

export function useAskQuestion() {
  return useMutation({
    mutationFn: (body: { question: string; source_filter?: string | null }) =>
      api.post<SearchResponse>("/search/ask", body),
  });
}

export function useReindex() {
  return useMutation({
    mutationFn: (tenantId?: string) =>
      api.post<ReindexResponse>("/search/reindex", {
        tenant_id: tenantId ?? null,
      }),
  });
}
