"use client";

import type { ForossPodcast } from "@/app/api/chat/route";
import {
  faExternalLink,
  faHeadphones,
  faPause,
  faPlay,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useRef, useState } from "react";
import ReactHowler from "react-howler";

function fmt(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function PodcastCard({
  podcast,
  compact = false,
}: {
  podcast: ForossPodcast;
  compact?: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0–1
  const [duration, setDuration] = useState(0);
  const howlerRef = useRef<ReactHowler>(null);
  const rafRef = useRef<number | null>(null);

  const forossUrl = `https://www.foross.no/podkast/${podcast.series?.slug?.current ?? "episode"}/${podcast._id}`;

  // Poll position while playing
  useEffect(() => {
    if (playing) {
      const tick = () => {
        const h = howlerRef.current;
        if (h) {
          const pos = h.seek() as number;
          const dur = h.duration() as number;
          if (dur > 0) setProgress(pos / dur);
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } else {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    }
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [playing]);

  function handleLoad() {
    const h = howlerRef.current;
    if (h) setDuration(h.duration() as number);
  }

  function handleEnd() {
    setPlaying(false);
    setProgress(0);
  }

  function handleSeek(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(
      0,
      Math.min(1, (e.clientX - rect.left) / rect.width),
    );
    const h = howlerRef.current;
    if (h && duration > 0) {
      h.seek(ratio * duration);
      setProgress(ratio);
    }
  }

  const imgSize = compact ? "72px" : "88px";
  const btnSize = compact ? "28px" : "34px";
  const iconSize = compact ? "10px" : "13px";

  return (
    <div
      className="foross-card lg:min-h-[200px]"
      style={{
        border: "1px solid var(--rule-mid)",
        borderRadius: "3px",
        overflow: "hidden",
        background: "var(--surface2)",
        transition: "border-color 0.2s",
        display: "flex",
        flexDirection: "column",
        ...(compact ? { width: "160px", flexShrink: 0 } : {}),
      }}
    >
      {podcast.rawUrl && (
        <ReactHowler
          ref={howlerRef}
          src={podcast.rawUrl}
          playing={playing}
          html5
          onLoad={handleLoad}
          onEnd={handleEnd}
        />
      )}

      {/* Image + play overlay */}
      <div
        style={{
          width: "100%",
          height: imgSize,
          background: "var(--surface)",
          flexShrink: 0,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {podcast.series?.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={podcast.series.imageUrl}
            alt={podcast.series.title ?? ""}
            style={{
              width: "100%",
              height: "100%",
              objectPosition: "top",
              objectFit: "cover",
            }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <FontAwesomeIcon
              icon={faHeadphones}
              aria-hidden
              style={{
                fontSize: compact ? "22px" : "26px",
                color: "var(--gold-dim)",
              }}
            />
          </div>
        )}

        {podcast.rawUrl && (
          <button
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? "Pause" : "Spill av"}
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: playing ? "rgba(0,0,0,0.45)" : "rgba(0,0,0,0.25)",
              border: "none",
              cursor: "pointer",
              transition: "background 0.15s",
            }}
          >
            <div
              style={{
                width: btnSize,
                height: btnSize,
                borderRadius: "50%",
                background: "var(--gold)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <FontAwesomeIcon
                icon={playing ? faPause : faPlay}
                aria-hidden
                style={{
                  fontSize: iconSize,
                  color: "#1a1a1a",
                  marginLeft: playing ? 0 : "2px",
                }}
              />
            </div>
          </button>
        )}
      </div>

      {/* Progress track + time */}
      {podcast.rawUrl && (
        <div style={{ flexShrink: 0 }}>
          <div
            onClick={handleSeek}
            style={{
              width: "100%",
              height: "6px",
              background: "var(--rule-mid)",
              cursor: duration > 0 ? "pointer" : "default",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${progress * 100}%`,
                background: "var(--gold)",
                transition: playing ? "none" : "width 0.2s",
              }}
            />
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              padding: "2px 9px 0",
              fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
              fontSize: "8px",
              color: "var(--muted)",
              letterSpacing: "0.04em",
            }}
          >
            {fmt(progress * duration)} / {fmt(duration)}
          </div>
        </div>
      )}

      {/* Info */}
      <div
        style={{
          padding: compact ? "7px 9px" : "8px 10px",
          display: "flex",
          flexDirection: "column",
          gap: "3px",
          flex: 1,
        }}
      >
        {podcast.series?.title && (
          <span
            style={{
              fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
              fontSize: "8px",
              fontWeight: 500,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--gold-dim)",
            }}
          >
            {podcast.series.title}
          </span>
        )}
        {(podcast.kirkedag?.length ?? 0) > 0 && (
          <span
            style={{
              fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
              fontSize: "8px",
              fontWeight: 400,
              letterSpacing: "0.06em",
              color: "var(--muted)",
            }}
          >
            {(podcast.kirkedag ?? []).map((k) => k.title).join(", ")}
          </span>
        )}
        <span
          style={{
            fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
            fontSize: compact ? "11px" : "12px",
            fontWeight: 500,
            color: "var(--ink)",
            lineHeight: 1.35,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {podcast.title}
        </span>
        <a
          href={forossUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontFamily: "var(--font-ubuntu), Ubuntu, sans-serif",
            fontSize: "9px",
            color: "var(--muted)",
            marginTop: "auto",
            paddingTop: "2px",
            display: "flex",
            alignItems: "center",
            gap: "4px",
            textDecoration: "none",
          }}
        >
          <FontAwesomeIcon
            icon={faExternalLink}
            aria-hidden
            style={{ fontSize: "8px" }}
          />
          foross.no
        </a>
      </div>
    </div>
  );
}
