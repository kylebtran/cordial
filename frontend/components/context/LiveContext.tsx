// components/context/LiveContext.tsx
import { createContext, useContext } from "react";
import { useLiveAPI } from "@/lib/hooks/live";

import { UseLiveAPIResults } from "@/lib/hooks/live";

const LiveContext = createContext<UseLiveAPIResults | undefined>(undefined);

export const LiveContextProvider = ({
  url,
  api,
  children,
}: {
  url?: string;
  api: string;
  children: React.ReactNode;
}) => {
  const gemini = useLiveAPI({ url, apiKey: api });
  return <LiveContext.Provider value={gemini}>{children}</LiveContext.Provider>;
};

export const useLiveContext = () => {
  const context = useContext(LiveContext);
  if (!context) {
    throw new Error("useLiveContext must be used within a LiveContextProvider");
  }
  return context;
};
