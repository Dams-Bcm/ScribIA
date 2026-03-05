import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../client";
import type {
  DiarisationJob,
  DiarisationJobDetail,
  DiarisationUploadResponse,
} from "../types";

const KEYS = {
  list: ["diarisation", "jobs"] as const,
  detail: (id: string) => ["diarisation", "job", id] as const,
};

export function useDiarisationJobs() {
  return useQuery<DiarisationJob[]>({
    queryKey: KEYS.list,
    queryFn: () => api.get<DiarisationJob[]>("/diarisation"),
  });
}

export function useDiarisationJob(id: string | null) {
  return useQuery<DiarisationJobDetail>({
    queryKey: KEYS.detail(id!),
    queryFn: () => api.get<DiarisationJobDetail>(`/diarisation/${id}`),
    enabled: !!id,
  });
}

export function useUploadDiarisationAudio() {
  const qc = useQueryClient();
  return useMutation<DiarisationUploadResponse, Error, { file: File | Blob; filename?: string }>({
    mutationFn: ({ file, filename }) =>
      api.upload<DiarisationUploadResponse>("/diarisation/upload", file, filename),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.list });
    },
  });
}

export function useStartDiarisationProcessing() {
  const qc = useQueryClient();
  return useMutation<DiarisationJob, Error, string>({
    mutationFn: (jobId) => api.post<DiarisationJob>(`/diarisation/${jobId}/process`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.list });
    },
  });
}

export function useDeleteDiarisationJob() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (jobId) => api.delete<void>(`/diarisation/${jobId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.list });
    },
  });
}

export function useRenameSpeaker() {
  const qc = useQueryClient();
  return useMutation<void, Error, { jobId: string; speakerId: string; displayName: string }>({
    mutationFn: ({ jobId, speakerId, displayName }) =>
      api.patch<void>(`/diarisation/${jobId}/speakers/${speakerId}`, { display_name: displayName }),
    onSuccess: (_, { jobId }) => {
      qc.invalidateQueries({ queryKey: KEYS.detail(jobId) });
    },
  });
}
