import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../client";
import type { SpeakerProfile, OralConsentDetection, CollectiveConsentResult } from "../types";

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

export interface EnrollFromSegmentBody {
  start_time: number;
  end_time: number;
  speaker_profile_id?: string;
  first_name?: string;
  last_name?: string;
  fonction?: string;
}

export function useEnrollFromSegment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, body }: { jobId: string; body: EnrollFromSegmentBody }) =>
      api.post<{ message: string; profile_id: string; display_name: string; duration: number }>(
        `/diarisation/${jobId}/enroll-from-segment`,
        body,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "speakers"] });
      qc.invalidateQueries({ queryKey: ["diarisation"] });
    },
  });
}

export function useCreateSpeaker() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { first_name: string; last_name: string; fonction?: string }) =>
      api.post<SpeakerProfile>("/speakers", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "speakers"] });
    },
  });
}

export function useDetectOralConsent() {
  return useMutation({
    mutationFn: (jobId: string) =>
      api.post<OralConsentDetection>(`/diarisation/${jobId}/detect-oral-consent`),
  });
}

export function useValidateCollectiveConsent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      jobId,
      body,
    }: {
      jobId: string;
      body: { consent_segment_id?: string; contact_ids: string[] };
    }) =>
      api.post<CollectiveConsentResult>(
        `/diarisation/${jobId}/validate-collective-consent`,
        body,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "speakers"] });
      qc.invalidateQueries({ queryKey: ["diarisation"] });
    },
  });
}

export function useSendConsent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (profileId: string) =>
      api.post<SpeakerProfile>(`/speakers/${profileId}/send-consent`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "speakers"] });
    },
  });
}
