"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import type { HealthReport, SystemStatus as Status } from "@/types";

const LABELS: Record<Status | "checking", string> = {
  checking: "Checking Systems",
  online: "System Online",
  degraded: "System Degraded",
  offline: "System Offline",
};

const COLORS: Record<Status | "checking", string> = {
  checking: "bg-muted-foreground",
  online: "bg-emerald-500",
  degraded: "bg-amber-500",
  offline: "bg-red-500",
};

/**
 * Reports the live result of `/api/health` rather than a hardcoded string, so
 * the landing page doubles as a smoke test for the whole foundation.
 */
export function SystemStatus() {
  const [status, setStatus] = useState<Status | "checking">("checking");

  useEffect(() => {
    const controller = new AbortController();

    async function probe() {
      try {
        const response = await fetch("/api/health", {
          cache: "no-store",
          signal: controller.signal,
        });
        const report = (await response.json()) as HealthReport;
        setStatus(report.status);
      } catch {
        if (!controller.signal.aborted) setStatus("offline");
      }
    }

    void probe();
    return () => controller.abort();
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.3 }}
      className="flex items-center gap-2.5 rounded-full border border-border bg-card/50 px-4 py-2 text-card-foreground"
    >
      <span className="relative flex size-2">
        {status !== "checking" && (
          <span
            className={cn(
              "absolute inline-flex size-full animate-ping rounded-full opacity-60",
              COLORS[status],
            )}
          />
        )}
        <span
          className={cn(
            "relative inline-flex size-2 rounded-full",
            COLORS[status],
          )}
        />
      </span>
      <span className="text-sm font-medium tracking-wide">
        {LABELS[status]}
      </span>
    </motion.div>
  );
}
