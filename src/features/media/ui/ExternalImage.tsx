import {
  forwardRef,
  type ImgHTMLAttributes,
  type SyntheticEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { createLogger } from "src/app/logger";
import { isTauriRuntime } from "src/app/platform/runtime";
import { fetchTauriBinary } from "src/app/platform/tauri/HttpClient";

const logger = createLogger("media");

const EXTERNAL_IMAGE_TIMEOUT_MS = 30_000;

export type ExternalImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string;
};

function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function getResponseHeader(headers: Record<string, string>, name: string): string | undefined {
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
  return entry?.[1];
}

async function fetchTauriImage(url: string): Promise<string> {
  const response = await fetchTauriBinary(url, {
    headers: {
      Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    },
    timeout: EXTERNAL_IMAGE_TIMEOUT_MS,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`外部画像のHTTPステータスが不正です: ${response.status}`);
  }

  const contentType =
    getResponseHeader(response.headers, "content-type") ?? "application/octet-stream";
  return URL.createObjectURL(new Blob([response.body], { type: contentType }));
}

/**
 * Tauri WebViewで外部画像の読み込みに失敗した場合だけ、Rust側HTTP経由のblob URLへ切り替える。
 * 通常のimg読み込みを先に試すことで、ブラウザのlazy loadingと既存のキャッシュ挙動を維持する。
 */
export const ExternalImage = forwardRef<HTMLImageElement, ExternalImageProps>(
  function ExternalImage({ src, onError, ...props }, ref) {
    const [sourceState, setSourceState] = useState<{ rawSrc: string; renderedSrc: string | null }>(
      () => ({
        rawSrc: src,
        renderedSrc: src,
      }),
    );
    const fallbackAttemptedRef = useRef(false);
    const currentSrcRef = useRef(src);
    const objectUrlRef = useRef<string | null>(null);

    currentSrcRef.current = src;

    useEffect(() => {
      fallbackAttemptedRef.current = false;
      setSourceState({ rawSrc: src, renderedSrc: src });

      return () => {
        if (objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current);
          objectUrlRef.current = null;
        }
      };
    }, [src]);

    const handleError = (event: SyntheticEvent<HTMLImageElement, Event>) => {
      if (
        !isTauriRuntime() ||
        !isHttpUrl(src) ||
        fallbackAttemptedRef.current ||
        sourceState.rawSrc !== src
      ) {
        onError?.(event);
        return;
      }

      fallbackAttemptedRef.current = true;
      setSourceState({ rawSrc: src, renderedSrc: null });

      void fetchTauriImage(src)
        .then((objectUrl) => {
          if (currentSrcRef.current !== src) {
            URL.revokeObjectURL(objectUrl);
            return;
          }
          objectUrlRef.current = objectUrl;
          setSourceState({ rawSrc: src, renderedSrc: objectUrl });
        })
        .catch((error: unknown) => {
          // WebView側とRust側の両方で失敗したURLを記録し、画像だけを黙って消さない。
          logger.error("Tauri経由の外部画像取得に失敗しました", {
            url: src,
            error,
          });
          if (currentSrcRef.current !== src) {
            return;
          }
          setSourceState({ rawSrc: src, renderedSrc: src });
          onError?.(event);
        });
    };

    const renderedSrc = sourceState.rawSrc === src ? sourceState.renderedSrc : null;
    return <img {...props} ref={ref} src={renderedSrc ?? undefined} onError={handleError} />;
  },
);
