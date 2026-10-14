import { Flame } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { container } from "src/service-container/index";
import type { IRes, IThreadDetail } from "src/service-container/interfaces";
import { MiniWindow } from "src/view/browser/components/MiniWindow";
import { MiniWindowSection } from "src/view/browser/components/MiniWindowControls";
import { STATUS_BAR_PRIORITY } from "src/view/browser/components/status-bar-priority";
import { StatusBarItem } from "src/view/browser/components/StatusBar";
import { useMiniWindowTrigger } from "src/view/browser/hooks/use-mini-window-trigger";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import { useTabStore } from "src/view/browser/state/tabs/use-tab-store";
import { Spinner } from "src/view/browser/ui/Spinner";

const MOMENTUM_BUCKET_COUNT = 30;

interface MomentumGraphData {
  values: number[];
  maxValue: number;
  latestValue: number;
  rangeLabel: string;
}

function parseResTimestamp(res: IRes): number | null {
  const source = res.other ?? res.date;
  if (!source) {
    return null;
  }

  const m = source.match(
    /(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\(.\))?\s?(\d{1,2}):(\d\d)(?::(\d\d)(?:\.\d+)?)?/,
  );
  if (!m) {
    return null;
  }

  const year = Number.parseInt(m[1], 10);
  const month = Number.parseInt(m[2], 10);
  const day = Number.parseInt(m[3], 10);
  const hour = Number.parseInt(m[4], 10);
  const minute = Number.parseInt(m[5], 10);
  const second = Number.parseInt(m[6] ?? "0", 10);
  if (
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day) ||
    Number.isNaN(hour) ||
    Number.isNaN(minute) ||
    Number.isNaN(second)
  ) {
    return null;
  }

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return null;
  }

  return new Date(year, month - 1, day, hour, minute, second).valueOf();
}

function calculateIkioi(responses: IRes[]): number | null {
  if (responses.length === 0) {
    return null;
  }

  const timestamps = responses
    .map(parseResTimestamp)
    .filter((value): value is number => value != null)
    .sort((a, b) => a - b);
  if (timestamps.length === 0) {
    return null;
  }

  const firstResAt = timestamps[0];
  const elapsedDays = Math.max((Date.now() - firstResAt) / 86_400_000, 1 / 1440);
  return Math.round((responses.length / elapsedDays) * 10) / 10;
}

function buildMomentumGraphData(responses: IRes[]): MomentumGraphData | null {
  const timestamps = responses
    .map(parseResTimestamp)
    .filter((value): value is number => value != null)
    .sort((a, b) => a - b);
  if (timestamps.length === 0) {
    return null;
  }

  const first = timestamps[0];
  const last = timestamps[timestamps.length - 1];
  const end = Math.max(Date.now(), last);
  const spanMs = Math.max(end - first, 60 * 60 * 1000);
  const buckets = Array.from({ length: MOMENTUM_BUCKET_COUNT }, () => 0);

  for (const ts of timestamps) {
    const ratio = Math.min(1, Math.max(0, (ts - first) / spanMs));
    const bucketIndex = Math.min(
      MOMENTUM_BUCKET_COUNT - 1,
      Math.floor(ratio * (MOMENTUM_BUCKET_COUNT - 1)),
    );
    buckets[bucketIndex] += 1;
  }

  const hoursPerBucket = spanMs / MOMENTUM_BUCKET_COUNT / (1000 * 60 * 60);
  const values = buckets.map(
    (count) => Math.round((count / Math.max(hoursPerBucket, 1 / 60)) * 10) / 10,
  );
  const maxValue = Math.max(1, ...values);
  const latestValue = values[values.length - 1] ?? 0;
  const spanHours = spanMs / (1000 * 60 * 60);
  const rangeLabel =
    spanHours >= 48
      ? `開始から${Math.round(spanHours / 24)}日`
      : `開始から${Math.max(1, Math.round(spanHours))}時間`;

  return {
    values,
    maxValue,
    latestValue,
    rangeLabel,
  };
}

interface MomentumLineChartProps {
  data: MomentumGraphData | null;
  loading: boolean;
}

const MomentumLineChart: React.FC<MomentumLineChartProps> = ({ data, loading }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { window: viewWindow } = useViewSurface();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const width = 252;
    const height = 82;
    const dpr = viewWindow.devicePixelRatio || 1;

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);

    const left = 10;
    const right = width - 8;
    const top = 8;
    const bottom = height - 8;
    const chartWidth = right - left;
    const chartHeight = bottom - top;

    context.strokeStyle = "rgba(127, 127, 127, 0.25)";
    context.lineWidth = 1;
    for (let i = 0; i <= 3; i += 1) {
      const y = top + (chartHeight * i) / 3;
      context.beginPath();
      context.moveTo(left, y);
      context.lineTo(right, y);
      context.stroke();
    }

    const points = data.values.map((value, index) => {
      const x = left + (chartWidth * index) / Math.max(data.values.length - 1, 1);
      const y = bottom - (value / data.maxValue) * chartHeight;
      return { x, y };
    });

    context.beginPath();
    context.moveTo(points[0]?.x ?? left, bottom);
    for (const point of points) {
      context.lineTo(point.x, point.y);
    }
    context.lineTo(points[points.length - 1]?.x ?? right, bottom);
    context.closePath();
    context.fillStyle = "rgba(56, 154, 255, 0.16)";
    context.fill();

    context.beginPath();
    points.forEach((point, index) => {
      if (index === 0) {
        context.moveTo(point.x, point.y);
        return;
      }
      context.lineTo(point.x, point.y);
    });
    context.strokeStyle = "rgba(56, 154, 255, 0.95)";
    context.lineWidth = 1.6;
    context.stroke();

    const lastPoint = points[points.length - 1];
    if (lastPoint) {
      context.beginPath();
      context.arc(lastPoint.x, lastPoint.y, 2.2, 0, Math.PI * 2);
      context.fillStyle = "rgba(56, 154, 255, 1)";
      context.fill();
    }
  }, [data, viewWindow]);

  return (
    <div className="mini-window__momentum-chart-wrap">
      <canvas
        ref={canvasRef}
        className="mini-window__momentum-chart"
        role="img"
        aria-label="勢い推移グラフ"
      />
      {loading && (
        <p className="mini-window__note mini-window__note--loading">
          <Spinner size="xs" aria-label="勢いデータを読み込み中" />
          <span>勢いデータを読み込み中...</span>
        </p>
      )}
      {!loading && data && (
        <p className="mini-window__note">
          {/* {data.rangeLabel} / 最新: {data.latestValue.toLocaleString()} 勢い */}
          {data.rangeLabel} / 勢い
        </p>
      )}
      {!loading && !data && (
        <p className="mini-window__note">投稿時刻の情報が不足しているため描画できません</p>
      )}
    </div>
  );
};

export const IkioiStatusItem: React.FC = () => {
  const { viewTab, viewPage } = useTabStore();
  const [ikioi, setIkioi] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [momentumData, setMomentumData] = useState<MomentumGraphData | null>(null);

  const threadUrl = viewPage.type === "thread" ? viewPage.threadUrl : null;
  const reloadKey = viewTab.reloadKey;
  const {
    triggerRef: miniWindowTriggerRef,
    anchor: miniWindowAnchor,
    toggle: toggleMiniWindow,
    close: closeMiniWindow,
  } = useMiniWindowTrigger(threadUrl);

  useEffect(() => {
    if (threadUrl == null) {
      setIkioi(null);
      setMomentumData(null);
      setLoading(false);
      return;
    }

    let alive = true;

    const syncIkioi = (detail: Pick<IThreadDetail, "res"> | undefined) => {
      if (!alive || !detail?.res) {
        return;
      }
      setIkioi(calculateIkioi(detail.res));
      setMomentumData(buildMomentumGraphData(detail.res));
    };

    const load = async () => {
      setLoading(true);
      try {
        const result = await container.thread.getThread(threadUrl, {
          forceUpdate: false,
          // 常時表示のアイテムなので、cache結果で先に更新してちらつきを減らす。
          onCache: (cached) => syncIkioi(cached),
        });
        syncIkioi(result);
      } catch {
        if (alive) {
          setIkioi(null);
          setMomentumData(null);
        }
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    };

    // 手動更新・自動更新など外部要因の再取得は Tab の reloadKey へ集約されるため、
    // pollingではなく reloadKey 変化時に同期して不要な定期通信を避ける。
    void load();

    return () => {
      alive = false;
    };
  }, [reloadKey, threadUrl]);

  const displayValue = useMemo(() => {
    if (loading && ikioi == null) {
      return "...";
    }
    if (ikioi == null) {
      return "--";
    }
    return ikioi.toLocaleString();
  }, [ikioi, loading]);

  if (threadUrl == null) {
    return null;
  }

  return (
    <>
      <StatusBarItem
        id="ikioi-status"
        alignment="left"
        priority={STATUS_BAR_PRIORITY.left.ikioi}
        title={`勢い: ${displayValue}`}
        interactive
      >
        <button
          ref={miniWindowTriggerRef}
          className="status-bar__btn"
          onClick={toggleMiniWindow}
          title={`勢い: ${displayValue}`}
          aria-label={`勢い ${displayValue}`}
        >
          <span className="status-bar__ikioi">
            <Flame size={13} aria-hidden="true" />
            <span className="status-bar__ikioi-value">{displayValue}</span>
          </span>
        </button>
      </StatusBarItem>

      {miniWindowAnchor && (
        <MiniWindow
          title="勢い"
          anchor={miniWindowAnchor}
          onClose={closeMiniWindow}
          triggerRef={miniWindowTriggerRef}
        >
          <MiniWindowSection title="勢いグラフ">
            <MomentumLineChart data={momentumData} loading={loading} />
          </MiniWindowSection>
        </MiniWindow>
      )}
    </>
  );
};
