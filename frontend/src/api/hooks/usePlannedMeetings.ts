import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../client";
import type {
  PlannedMeeting,
  PlannedMeetingDetail,
  PlannedMeetingCreate,
  PlannedMeetingUpdate,
} from "../types";

const KEYS = {
  list: ["planned-meetings"] as const,
  detail: (id: string) => ["planned-meetings", id] as const,
};

export function usePlannedMeetings() {
  return useQuery<PlannedMeeting[]>({
    queryKey: KEYS.list,
    queryFn: () => api.get<PlannedMeeting[]>("/planned-meetings"),
  });
}

export function usePlannedMeeting(id: string | null) {
  return useQuery<PlannedMeetingDetail>({
    queryKey: KEYS.detail(id!),
    queryFn: () => api.get<PlannedMeetingDetail>(`/planned-meetings/${id}`),
    enabled: !!id,
  });
}

export function useCreatePlannedMeeting() {
  const qc = useQueryClient();
  return useMutation<PlannedMeetingDetail, Error, PlannedMeetingCreate>({
    mutationFn: (data) => api.post<PlannedMeetingDetail>("/planned-meetings", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.list });
    },
  });
}

export function useUpdatePlannedMeeting() {
  const qc = useQueryClient();
  return useMutation<PlannedMeetingDetail, Error, { id: string; data: PlannedMeetingUpdate }>({
    mutationFn: ({ id, data }) => api.patch<PlannedMeetingDetail>(`/planned-meetings/${id}`, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: KEYS.list });
      qc.invalidateQueries({ queryKey: KEYS.detail(id) });
    },
  });
}

export function useDeletePlannedMeeting() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => api.delete(`/planned-meetings/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.list });
    },
  });
}

export function useAddParticipants() {
  const qc = useQueryClient();
  return useMutation<PlannedMeetingDetail, Error, { meetingId: string; contactIds: string[] }>({
    mutationFn: ({ meetingId, contactIds }) =>
      api.post<PlannedMeetingDetail>(`/planned-meetings/${meetingId}/participants`, contactIds),
    onSuccess: (_, { meetingId }) => {
      qc.invalidateQueries({ queryKey: KEYS.list });
      qc.invalidateQueries({ queryKey: KEYS.detail(meetingId) });
    },
  });
}

export function useRemoveParticipant() {
  const qc = useQueryClient();
  return useMutation<void, Error, { meetingId: string; participantId: string }>({
    mutationFn: ({ meetingId, participantId }) =>
      api.delete(`/planned-meetings/${meetingId}/participants/${participantId}`),
    onSuccess: (_, { meetingId }) => {
      qc.invalidateQueries({ queryKey: KEYS.list });
      qc.invalidateQueries({ queryKey: KEYS.detail(meetingId) });
    },
  });
}

export function useLinkRecording() {
  const qc = useQueryClient();
  return useMutation<PlannedMeetingDetail, Error, { meetingId: string; jobId: string }>({
    mutationFn: ({ meetingId, jobId }) =>
      api.post<PlannedMeetingDetail>(`/planned-meetings/${meetingId}/start-recording?job_id=${jobId}`),
    onSuccess: (_, { meetingId }) => {
      qc.invalidateQueries({ queryKey: KEYS.list });
      qc.invalidateQueries({ queryKey: KEYS.detail(meetingId) });
    },
  });
}
