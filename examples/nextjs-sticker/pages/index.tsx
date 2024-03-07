import { useState, useMemo, PointerEvent } from "react";
import {
  useHistory,
  useOthers,
  RoomProvider,
  useStorage,
  useMutation,
  useSelf,
} from "../liveblocks.config";
import { LiveList, LiveMap, LiveObject } from "@liveblocks/client";
import { shallow, ClientSideSuspense } from "@liveblocks/react";
import styles from "../styles/index.module.css";
import { useRouter } from "next/router";

export default function Room() {
  const roomId = useOverrideRoomId("nextjs-whiteboard");
  return (
    <RoomProvider
      id={roomId}
      initialPresence={{ selectedShape: null }}
      initialStorage={{ shapes: new LiveMap() }}
    >
      <div className={styles.container}>
        <ClientSideSuspense fallback={<Loading />}>
          {() => <Canvas />}
        </ClientSideSuspense>
      </div>
    </RoomProvider>
  );
}

function Canvas() {
  const [isDragging, setIsDragging] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const togglePopup = () => {
    setShowPopup(!showPopup);
  };
  const shapeIds = useStorage(
    (root) => Array.from(root.shapes.keys()),
    shallow
  );

  const history = useHistory();

  // Emoji 타입 정의
  interface StickerResource {
    name: string;
    src: string;
  }

  // config.json 파일 구조에 맞는 타입 정의
  interface StickerConfig {
    sticker: StickerResource[];
  }

  const stickerConfig: StickerConfig = require("../resources/config.json");

  const insertSticker = useMutation(({ storage, setMyPresence }, imageUrl) => {
    const shapeId = Date.now().toString();
    // 화면 크기 또는 캔버스 영역에 맞추어 랜덤 위치 결정
    const x = Math.random() * 800; // 예시로 800, 실제 캔버스 너비에 맞춰 조정
    const y = Math.random() * 600; // 예시로 600, 실제 캔버스 높이에 맞춰 조정

    const shape = new LiveObject({
      x: x,
      y: y,
      fill: imageUrl,
    });

    storage.get("shapes").set(shapeId, shape);
    setMyPresence({ selectedShape: shapeId }, { addToHistory: true });
  }, []);

  const deleteSticker = useMutation(({ storage, self, setMyPresence }) => {
    const shapeId = self.presence.selectedShape;
    if (!shapeId) {
      return;
    }

    storage.get("shapes").delete(shapeId);
    setMyPresence({ selectedShape: null });
  }, []);

  const onShapePointerDown = useMutation(
    ({ setMyPresence }, e: PointerEvent<HTMLDivElement>, shapeId: string) => {
      history.pause();
      e.stopPropagation();

      setMyPresence({ selectedShape: shapeId }, { addToHistory: true });
      setIsDragging(true);
    },
    [history]
  );

  const onCanvasPointerUp = useMutation(
    ({ setMyPresence }) => {
      if (!isDragging) {
        setMyPresence({ selectedShape: null }, { addToHistory: true });
      }

      setIsDragging(false);
      history.resume();
    },
    [isDragging, history]
  );

  const onCanvasPointerMove = useMutation(
    ({ storage, self }, e: PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (!isDragging) {
        return;
      }

      const shapeId = self.presence.selectedShape;
      if (!shapeId) {
        return;
      }

      const shape = storage.get("shapes").get(shapeId);

      if (shape) {
        shape.update({
          x: e.clientX - 50,
          y: e.clientY - 50,
        });
      }
    },
    [isDragging]
  );

  return (
    <>
      <div
        className={styles.canvas}
        onPointerMove={onCanvasPointerMove}
        onPointerUp={onCanvasPointerUp}
      >
        {shapeIds.map((shapeId: string) => {
          return (
            <Sticker
              key={shapeId}
              id={shapeId}
              onShapePointerDown={onShapePointerDown}
            />
          );
        })}
      </div>
      <div className={styles.toolbar}>
        <button onClick={togglePopup}>Sticker</button>
        <button onClick={() => deleteSticker()}>Delete</button>
        <button onClick={() => history.undo()}>Undo</button>
        <button onClick={() => history.redo()}>Redo</button>
        {showPopup && (
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              backgroundColor: "white",
              padding: "20px",
              borderRadius: "10px",
              boxShadow: "0 2px 5px rgba(0,0,0,0.2)",
              zIndex: 1000,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              width: "60%", // 팝업의 너비를 설정합니다.
              maxWidth: "600px", // 최대 너비를 설정합니다.
            }}
          >
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "center",
              }}
            >
              {/* 스티커 목록을 이미지로 표시 */}
              {stickerConfig.sticker.map((sticker) => (
                <img
                  key={sticker.name}
                  src={sticker.src}
                  alt={sticker.name}
                  style={{ width: "20px", margin: "5px" }}
                  onClick={() => insertSticker(sticker.src)}
                />
              ))}
            </div>
            <button onClick={togglePopup} style={{ marginTop: "10px" }}>
              Close
            </button>
          </div>
        )}
      </div>
    </>
  );
}

type StickerProps = {
  id: string;
  onShapePointerDown: (e: PointerEvent<HTMLDivElement>, id: string) => void;
};

function Sticker({ id, onShapePointerDown }: StickerProps) {
  const { x, y, fill } = useStorage((root) => root.shapes.get(id)) ?? {};

  const selectedByMe = useSelf((me) => me.presence.selectedShape === id);
  const selectedByOthers = useOthers((others) =>
    others.some((other) => other.presence.selectedShape === id)
  );

  return (
    <div
      onPointerDown={(e) => onShapePointerDown(e, id)}
      className={styles.imageContainer}
      style={{
        transform: `translate(${x}px, ${y}px)`,
        transition: !selectedByMe ? "transform 120ms linear" : "none",
        borderStyle: "none",
      }}
    >
      <img src={fill || "defaultImage.png"} alt="shape" />
    </div>
  );
}

function Loading() {
  return (
    <div className={styles.container}>
      <div className={styles.loading}>
        <img src="https://liveblocks.io/loading.svg" alt="Loading" />
      </div>
    </div>
  );
}

/**
 * This function is used when deploying an example on liveblocks.io.
 * You can ignore it completely if you run the example locally.
 */
function useOverrideRoomId(roomId: string) {
  const { query } = useRouter();
  const overrideRoomId = useMemo(() => {
    return query?.roomId ? `${roomId}-${query.roomId}` : roomId;
  }, [query, roomId]);

  return overrideRoomId;
}
