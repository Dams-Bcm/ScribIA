import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../client";
import type { SpeakerProfile } from "../types";

export function useSpeakers() {
  return useQuery<SpeakerProfile[]>({
    queryKey: ["admin", "speakers"],
    queryFn: () => api.get("/speakers"),
  });
}

interface EnrollFromDiarisationBody {
  job_id: string;
  diarisation_speaker_id: string;
  compute_embedding?: boolean;
}

export function useEnrollFromDiarisation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      profileId,
      body,
    }: {
      profileId: string;
      body: EnrollFromDiarisationBody;
    }) => api.post(`/speakers/${profileId}/enroll-from-diarisation`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "speakers"] });
      qc.invalidateQueries({ queryKey: ["diarisation"] });
    },
    onError: (err) => {
      console.error("Enrollment failed", err instanceof ApiError ? err.message : err);
    },
  });
}
