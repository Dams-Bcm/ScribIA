import { useEffect, useState, useCallback } from "react";
import { api } from "@/api/client";

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>(
    "Notification" in window ? Notification.permission : "denied",
  );
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check existing subscription on mount
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      setSubscribed(!!sub);
    });
  }, []);

  const subscribe = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    setError(null);

    // Request permission
    const perm = await Notification.requestPermission();
    setPermission(perm);
    if (perm !== "granted") {
      setError("Permission refusée. Autorisez les notifications dans les paramètres du navigateur.");
      return;
    }

    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;

      // Get VAPID public key from backend
      const { vapid_public_key } = await api.get<{ vapid_public_key: string }>("/push/vapid-key");

      // Convert base64url to Uint8Array
      const rawKey = atob(vapid_public_key.replace(/-/g, "+").replace(/_/g, "/"));
      const applicationServerKey = new Uint8Array(rawKey.length);
      for (let i = 0; i < rawKey.length; i++) {
        applicationServerKey[i] = rawKey.charCodeAt(i);
      }

      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });

      // Send subscription to backend
      await api.post("/push/subscribe", subscription.toJSON());
      setSubscribed(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de l'activation des notifications");
    } finally {
      setLoading(false);
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    if (!("serviceWorker" in navigator)) return;

    setError(null);
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        // Notify backend
        await api.post("/push/unsubscribe", { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de la désactivation");
    } finally {
      setLoading(false);
    }
  }, []);

  const supported = "serviceWorker" in navigator && "PushManager" in window;

  return { supported, permission, subscribed, loading, error, subscribe, unsubscribe };
}
