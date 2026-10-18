import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ScanLine, X, Zap, ZapOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { fa } from '@/i18n/fa';

type Detector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> };

/**
 * The WASM reader ships with the app; its wasm file is imported through Vite
 * (inlined into the install cache) so a scan never touches the network.
 * The module is loaded once, on the first scan, and kept for the session.
 */
let detectorPromise: Promise<Detector> | null = null;

function loadDetector(): Promise<Detector> {
  detectorPromise ??= (async () => {
    const [{ BarcodeDetector, prepareZXingModule }, wasmUrl] = await Promise.all([
      import('barcode-detector/ponyfill'),
      import('zxing-wasm/reader/zxing_reader.wasm?url'),
    ]);
    prepareZXingModule({
      overrides: {
        locateFile: (path: string) => (path.endsWith('.wasm') ? wasmUrl.default : path),
      },
    });
    return new BarcodeDetector();
  })().catch((error: unknown) => {
    detectorPromise = null;
    throw error;
  });
  return detectorPromise;
}

/**
 * The vendor caches a rejected WASM module promise for the whole page session
 * and its constructor reports success anyway, so a broken first load would
 * otherwise leave every later scan dead but silent. Drop both caches so the
 * retry button can genuinely start over.
 */
async function discardDetector(): Promise<void> {
  detectorPromise = null;
  try {
    const { purgeZXingModule } = await import('barcode-detector/ponyfill');
    await purgeZXingModule();
  } catch {
    // Nothing cached to purge, or the module never loaded; either way retrying is safe.
  }
}

const RETRY_MS = 250;
/** Consecutive detect rejections before the scanner declares the reader broken. */
const MAX_TICK_FAILURES = 12;

type Phase = 'starting' | 'scanning' | 'denied' | 'failed';

export function Scanner({
  open,
  onClose,
  onResult,
}: {
  open: boolean;
  onClose: () => void;
  onResult: (code: string) => void;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-50 flex flex-col bg-black text-white"
        >
          <div className="safe-t flex items-center justify-between gap-2 p-3">
            <DialogPrimitive.Title className="text-title font-bold">
              {fa.scan.title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label={fa.scan.close}
              className="flex size-12 items-center justify-center rounded-input"
            >
              <X className="size-6" />
            </DialogPrimitive.Close>
          </div>
          {/* The dialog content mounts in a later commit than `open` flips, so the
              camera lives in a child that mounts together with its own <video>. */}
          <CameraStage onClose={onClose} onResult={onResult} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function CameraStage({
  onClose,
  onResult,
}: {
  onClose: () => void;
  onResult: (code: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const onResultRef = useRef(onResult);
  const [phase, setPhase] = useState<Phase>('starting');
  const [attempt, setAttempt] = useState(0);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;
    let delivered = false;
    let stream: MediaStream | null = null;
    let timer: number | undefined;

    setPhase('starting');
    setTorchOn(false);
    setTorchSupported(false);

    const schedule = (tick: () => void) => {
      if (!cancelled && !delivered) timer = window.setTimeout(tick, RETRY_MS);
    };

    const run = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) {
          // The cleanup ran while getUserMedia was still resolving; nobody else
          // can reach this stream, so stop it here or the camera stays on.
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        video.srcObject = stream;
        await video.play();
        if (cancelled) return;
        const track = stream.getVideoTracks()[0];
        trackRef.current = track ?? null;
        const caps = track?.getCapabilities?.() as
          | (MediaTrackCapabilities & { torch?: boolean })
          | undefined;
        setTorchSupported(Boolean(caps?.torch));
        const detector = await loadDetector();
        if (cancelled) return;
        setPhase('scanning');

        let failures = 0;
        const tick = async () => {
          if (cancelled || delivered) return;
          if (video.readyState < 2) {
            schedule(() => void tick());
            return;
          }
          try {
            const found = await detector.detect(video);
            failures = 0;
            const value = found.map((barcode) => barcode.rawValue.trim()).find(Boolean);
            if (value && !cancelled && !delivered) {
              delivered = true;
              onResultRef.current(value);
              return;
            }
          } catch {
            // One unreadable frame is not a failure; a permanently rejecting
            // reader (broken WASM cache) is — give it ~3 s, then say so.
            failures += 1;
            if (failures >= MAX_TICK_FAILURES && !cancelled && !delivered) {
              await discardDetector();
              if (!cancelled) setPhase('failed');
              return;
            }
          }
          schedule(() => void tick());
        };
        schedule(() => void tick());
      } catch (error) {
        if (cancelled) return;
        // A refused play() leaves the camera running behind the panel; stop it.
        stream?.getTracks().forEach((track) => track.stop());
        video.srcObject = null;
        trackRef.current = null;
        setPhase(
          error instanceof DOMException && error.name === 'NotAllowedError' ? 'denied' : 'failed',
        );
      }
    };
    void run();

    return () => {
      cancelled = true;
      if (timer != null) window.clearTimeout(timer);
      trackRef.current = null;
      stream?.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
    };
  }, [attempt]);

  const toggleTorch = async () => {
    const track = trackRef.current;
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next }],
      } as unknown as MediaTrackConstraints);
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
      setTorchOn(false);
    }
  };

  const live = phase === 'starting' || phase === 'scanning';

  return (
    <div className="relative flex-1 overflow-hidden">
      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        className="absolute inset-0 size-full object-cover"
      />

      {live ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-4">
          <div className="h-36 w-full max-w-[420px] rounded-sheet border-2 border-white/80" />
          <p className="rounded-input bg-black/60 px-3 py-1 text-[0.9rem]">{fa.scan.hint}</p>
        </div>
      ) : null}

      {live && torchSupported ? (
        <button
          type="button"
          aria-label={fa.scan.torch}
          aria-pressed={torchOn}
          onClick={() => void toggleTorch()}
          className="absolute top-3 start-3 flex size-12 items-center justify-center rounded-input bg-black/60"
        >
          {torchOn ? <Zap className="size-6" /> : <ZapOff className="size-6" />}
        </button>
      ) : null}

      {phase === 'denied' || phase === 'failed' ? (
        <div className="safe-b absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black p-6 text-center">
          {phase === 'denied' ? (
            <>
              <p className="text-title font-bold">{fa.scan.denied}</p>
              <p className="text-crate">{fa.scan.deniedHint}</p>
              <Button onClick={() => setAttempt((value) => value + 1)}>{fa.scan.allow}</Button>
            </>
          ) : (
            <>
              <ScanLine className="size-10" />
              <p className="text-crate">{fa.scan.noCamera}</p>
              <Button onClick={() => setAttempt((value) => value + 1)}>{fa.scan.retry}</Button>
            </>
          )}
          <Button variant="secondary" onClick={onClose}>
            {fa.scan.close}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
