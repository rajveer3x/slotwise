"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import type { MasterResult } from "../schema";
const FeedbackContext = createContext<(result: MasterResult) => void>(() => {});
export function MasterFeedback({ children }: { children: ReactNode }) {
  const [result, setResult] = useState<MasterResult>();
  return <FeedbackContext.Provider value={setResult}><p role="status" className={`my-4 text-sm ${result?.ok ? "text-success" : "text-danger"}`}>{result?.message}</p>{children}</FeedbackContext.Provider>;
}
export function useMasterFeedback() { return useContext(FeedbackContext); }
