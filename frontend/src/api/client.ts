const BASE_URL = "/api";

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function getToken(): string | null {
  return localStorage.getItem("token");
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) ?? {}),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (res.status === 401) {
    const body = await res.json().catch(() => ({ detail: "Session expirée" }));
    const message = body.detail ?? "Session expirée";
    // On login page, just propagate the backend error (e.g. "Identifiants incorrects")
    if (window.location.pathname !== "/login") {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    throw new ApiError(401, message);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(res.status, body.detail ?? res.statusText);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

async function upload<T>(path: string, file: File | Blob, filename?: string): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const formData = new FormData();
  formData.append("file", file, filename ?? (file instanceof File ? file.name : "recording.webm"));

  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (res.status === 401) {
    const body = await res.json().catch(() => ({ detail: "Session expirée" }));
    const message = body.detail ?? "Session expirée";
    if (window.location.pathname !== "/login") {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    throw new ApiError(401, message);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(res.status, body.detail ?? res.statusText);
  }

  return res.json();
}

function streamSSE(
  path: string,
  onMessage: (data: Record<string, unknown>) => void,
  onDone?: () => void,
): AbortController {
  const controller = new AbortController();
  const token = getToken();

  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  fetch(`${BASE_URL}${path}`, { headers, signal: controller.signal })
    .then(async (res) => {
      if (!res.ok || !res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              onMessage(data);
            } catch {
              // ignore parse errors
            }
          }
        }
      }
    })
    .catch(() => {
      // aborted or network error
    })
    .finally(() => {
      onDone?.();
    });

  return controller;
}

function uploadWithProgress<T>(
  path: string,
  file: File | Blob,
  filename?: string,
  onProgress?: (pct: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const token = getToken();

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status === 401) {
        let msg = "Session expirée";
        try { msg = JSON.parse(xhr.responseText).detail ?? msg; } catch { /* ignore */ }
        if (window.location.pathname !== "/login") {
          localStorage.removeItem("token");
          window.location.href = "/login";
        }
        reject(new ApiError(401, msg));
        return;
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        try {
          const body = JSON.parse(xhr.responseText);
          reject(new ApiError(xhr.status, body.detail ?? xhr.statusText));
        } catch {
          reject(new ApiError(xhr.status, xhr.statusText));
        }
        return;
      }
      resolve(JSON.parse(xhr.responseText));
    });

    xhr.addEventListener("error", () => reject(new ApiError(0, "Erreur réseau")));
    xhr.addEventListener("abort", () => reject(new ApiError(0, "Upload annulé")));

    const formData = new FormData();
    formData.append("file", file, filename ?? (file instanceof File ? file.name : "recording.webm"));

    xhr.open("POST", `${BASE_URL}${path}`);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.send(formData);
  });
}

async function handle401(res: Response) {
  if (res.status === 401) {
    const body = await res.json().catch(() => ({ detail: "Session expirée" }));
    const message = body.detail ?? "Session expirée";
    if (window.location.pathname !== "/login") {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    throw new ApiError(401, message);
  }
}

async function rawGet(path: string): Promise<Blob> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { headers });
  await handle401(res);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(res.status, body.detail ?? res.statusText);
  }
  return res.blob();
}

async function postForm<T>(path: string, formData: FormData): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers,
    body: formData,
  });
  await handle401(res);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(res.status, body.detail ?? res.statusText);
  }
  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, file: File | Blob, filename?: string) => upload<T>(path, file, filename),
  uploadWithProgress: <T>(path: string, file: File | Blob, filename?: string, onProgress?: (pct: number) => void) =>
    uploadWithProgress<T>(path, file, filename, onProgress),
  rawGet,
  postForm,
  streamSSE,
};

export { ApiError };
