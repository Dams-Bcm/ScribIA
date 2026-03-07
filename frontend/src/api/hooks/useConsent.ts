import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../client";
import type { AttendeesResponse } from "../types";

export function useAttendees(jobId: string | null) {
  return useQuery<AttendeesResponse>({
    queryKey: ["consent", "attendees", jobId],
    queryFn: () => api.get(`/consent/jobs/${jobId}/attendees`),
    enabled: !!jobId,
  });
}

export function useSetAttendees() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      jobId,
      contactIds,
    }: {
      jobId: string;
      contactIds: string[];
    }) =>
      api.post<AttendeesResponse>(`/consent/jobs/${jobId}/attendees`, {
        contact_ids: contactIds,
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["consent", "attendees", vars.jobId] });
      qc.invalidateQueries({ queryKey: ["diarisation"] });
    },
  });
}
