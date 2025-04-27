// app/project/[projectId]/live/page.tsx
"use client";
import { useRef, useState } from "react";
import { LiveContextProvider } from "@/components/context/LiveContext";
import Settings from "@/components/Settings";
import cn from "classnames";

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;

const host = "generativelanguage.googleapis.com";
const uri = `wss://${host}/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent`;

export default function LiveModelPage({
  params,
}: {
  params: { projectId: string };
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);

  return (
    <div className="container mx-auto flex flex-col h-full">
      <header className="pb-3 border-b border-outline">
        <h1 className="ml-4 mt-3 text-xl font-medium">Live Chat</h1>
      </header>
      <LiveContextProvider url={uri} api={API_KEY || ""}>
        <div className="streaming-console">
          <main>
            <div className="main-app-area">
              <video
                className={cn("stream", {
                  hidden: !videoRef.current || !videoStream,
                })}
                ref={videoRef}
                autoPlay
                playsInline
              />
            </div>

            <Settings
              videoRef={videoRef as React.RefObject<HTMLVideoElement>}
              supportsVideo={true}
              onVideoStreamChange={setVideoStream}
            />
          </main>
        </div>
      </LiveContextProvider>
    </div>
  );
}
