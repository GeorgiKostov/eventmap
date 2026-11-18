import { useEffect, useRef, useState } from "react";
import {
  interpolate,
  spring,
  useCurrentFrame,
  useDelayRender,
  useVideoConfig,
} from "remotion";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Glyph } from "./Brand";

const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

// A street-level map plate centred on one event, with its category pin
// dropping in. The camera is fixed (no per-frame camera moves → no tile
// shimmer); motion is a slow push-in on the whole plate.
export const MiniMap: React.FC<{
  lat: number;
  lng: number;
  color: string;
  glyph: string[];
  width: number;
  height: number;
  // false = we only know the town: zoom out and draw an area, not a pin.
  precise: boolean;
}> = ({ lat, lng, color, glyph, width, height, precise }) => {
  const zoom = precise ? 14 : 11.5;
  const ref = useRef<HTMLDivElement>(null);
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { delayRender, continueRender } = useDelayRender();
  const [handle] = useState(() =>
    delayRender(`Loading mini map ${lat},${lng}`),
  );

  useEffect(() => {
    if (!ref.current) return;
    const map = new maplibregl.Map({
      container: ref.current,
      style: MAP_STYLE,
      center: [lng, lat],
      zoom,
      interactive: false,
      attributionControl: false,
      fadeDuration: 0,
      canvasContextAttributes: { preserveDrawingBuffer: true },
    });
    map.on("load", () => map.once("idle", () => continueRender(handle)));
  }, [continueRender, handle, lat, lng, zoom]);

  const push = interpolate(frame, [0, durationInFrames], [1, 1.08]);
  const drop = spring({
    frame: frame - 8,
    fps,
    config: { damping: 10, mass: 0.7 },
  });
  const pulse = interpolate((frame - 18) % 45, [0, 45], [0, 1], {
    extrapolateLeft: "clamp",
  });

  return (
    <div
      style={{
        position: "relative",
        width,
        height,
        overflow: "hidden",
        background: "#e8e4da",
      }}
    >
      <div
        style={{ position: "absolute", inset: 0, transform: `scale(${push})` }}
      >
        <div ref={ref} style={{ position: "absolute", width, height }} />
      </div>
      {!precise ? (
        <div
          style={{
            position: "absolute",
            left: width / 2 - 150,
            top: height / 2 - 150,
            width: 300,
            height: 300,
            borderRadius: "50%",
            background: `${color}33`,
            border: `6px solid ${color}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: drop,
            transform: `scale(${interpolate(drop, [0, 1], [0.3, 1])})`,
          }}
        >
          <div
            style={{
              width: 96,
              height: 96,
              borderRadius: "50%",
              background: color,
              border: "5px solid #fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Glyph paths={glyph} size={56} strokeWidth={2.2} />
          </div>
        </div>
      ) : null}
      {/* pulse ring at the spot */}
      {precise && frame > 18 ? (
        <div
          style={{
            position: "absolute",
            left: width / 2 - 60,
            top: height / 2 - 30,
            width: 120,
            height: 60,
            borderRadius: "50%",
            border: `5px solid ${color}`,
            opacity: 1 - pulse,
            transform: `scale(${0.4 + pulse * 1.4})`,
          }}
        />
      ) : null}
      {precise ? (
        <div
          style={{
            position: "absolute",
            left: width / 2 - 60,
            top: height / 2 - 144,
            width: 120,
            height: 145,
            opacity: Math.min(1, drop * 2),
            transform: `translateY(${interpolate(drop, [0, 1], [-260, 0])}px)`,
          }}
        >
          <svg
            width={120}
            height={145}
            viewBox="0 0 96 116"
            style={{ position: "absolute" }}
          >
            <path
              d="M48 114C48 114 6 70 6 46a42 42 0 0 1 84 0c0 24-42 68-42 68z"
              fill={color}
              stroke="#fff"
              strokeWidth={5}
            />
          </svg>
          <div style={{ position: "absolute", left: 27, top: 25 }}>
            <Glyph paths={glyph} size={66} strokeWidth={2.2} />
          </div>
        </div>
      ) : null}
      <div
        style={{
          position: "absolute",
          right: 12,
          bottom: 8,
          fontSize: 18,
          color: "#333",
          background: "rgba(255,255,255,0.75)",
          padding: "3px 8px",
          borderRadius: 6,
        }}
      >
        © OpenFreeMap © OpenMapTiles © OpenStreetMap
      </div>
    </div>
  );
};
