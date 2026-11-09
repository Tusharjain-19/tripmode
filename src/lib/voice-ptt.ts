import { useState, useRef, useEffect, useCallback } from "react";
import { soundFx } from "./sound";
import { supabase } from "@/integrations/supabase/client";

export type VoiceClip = {
  id: string;
  senderId: string;
  senderName: string;
  audioBase64: string;
  durationMs: number;
  timestamp: number;
};

/** Ephemeral Realtime Broadcast hook for zero-storage Push-to-Talk audio streaming */
export function useVoiceBroadcast({
  tripId,
  userId,
  senderName,
  onReceiveClip,
}: {
  tripId: string | undefined;
  userId: string | undefined;
  senderName: string;
  onReceiveClip: (clip: VoiceClip) => void;
}) {
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const onReceiveRef = useRef(onReceiveClip);
  onReceiveRef.current = onReceiveClip;

  useEffect(() => {
    if (!tripId) return;
    const ch = supabase.channel(`tripmode:voice:${tripId}`);
    channelRef.current = ch;

    ch.on("broadcast", { event: "voice_clip" }, ({ payload }) => {
      const clip = payload as VoiceClip;
      if (!clip || clip.senderId === userId) return; // avoid echo of own transmission
      onReceiveRef.current(clip);
    });

    ch.subscribe();

    return () => {
      void supabase.removeChannel(ch);
      channelRef.current = null;
    };
  }, [tripId, userId]);

  const broadcastClip = useCallback(
    async (base64Audio: string, durationMs: number) => {
      if (!channelRef.current || !userId) return;
      await channelRef.current.send({
        type: "broadcast",
        event: "voice_clip",
        payload: {
          id: `ptt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          senderId: userId,
          senderName: senderName || "Convoy Driver",
          audioBase64: base64Audio,
          durationMs,
          timestamp: Date.now(),
        },
      });
    },
    [userId, senderName],
  );

  return { broadcastClip };
}

export function usePushToTalk({
  onSendClip,
}: {
  onSendClip: (base64Audio: string, durationMs: number) => Promise<void>;
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const startTime = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorder.current && mediaRecorder.current.state === "recording") {
        mediaRecorder.current.stop();
      }
    };
  }, []);

  const startTalking = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      return false;
    }

    try {
      soundFx.pttOpenChime();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setHasPermission(true);

      audioChunks.current = [];
      startTime.current = Date.now();

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
          ? "audio/ogg;codecs=opus"
          : "audio/webm";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorder.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunks.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const duration = Date.now() - startTime.current;
        // Require at least 400ms to avoid accidental taps
        if (duration >= 400 && audioChunks.current.length > 0) {
          const blob = new Blob(audioChunks.current, { type: mimeType });
          const reader = new FileReader();
          reader.onloadend = async () => {
            const result = reader.result as string;
            // Send base64 payload
            const base64 = result.split(",")[1];
            if (base64) {
              soundFx.pttCloseChime();
              await onSendClip(base64, duration);
            }
          };
          reader.readAsDataURL(blob);
        }
      };

      recorder.start(100);
      setIsRecording(true);
      setRecordingSeconds(0);

      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => {
          if (prev >= 15) {
            // Safety cap: max 15 seconds per voice transmission
            void stopTalking();
            return 15;
          }
          return prev + 1;
        });
      }, 1000);

      return true;
    } catch {
      setHasPermission(false);
      return false;
    }
  }, [onSendClip]);

  const stopTalking = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorder.current && mediaRecorder.current.state === "recording") {
      mediaRecorder.current.stop();
    }
    setIsRecording(false);
  }, []);

  // Hardware Volume-Down Button PTT listener (bridged from Android native container)
  useEffect(() => {
    if (typeof window === "undefined") return;
    (window as unknown as { __triggerHardwarePtt?: (down: boolean) => void }).__triggerHardwarePtt = (down: boolean) => {
      if (down) {
        void startTalking();
      } else {
        stopTalking();
      }
    };
    return () => {
      delete (window as unknown as { __triggerHardwarePtt?: unknown }).__triggerHardwarePtt;
    };
  }, [startTalking, stopTalking]);

  return {
    isRecording,
    hasPermission,
    recordingSeconds,
    startTalking,
    stopTalking,
  };
}

/** Plays an incoming voice clip base64 audio */
export function playVoiceClip(base64Audio: string) {
  if (typeof window === "undefined" || !base64Audio) return;
  try {
    const audio = new Audio(`data:audio/webm;base64,${base64Audio}`);
    void audio.play();
  } catch {
    // ignore
  }
}

