import { useEffect } from "react";
import { useUpdateSession } from "../contexts/UpdateSessionContext";

/**
 * While `active` is true, blocks "Restart to install update" so users are not interrupted
 * mid patient registration, consultation, prescription, etc.
 */
export function useCriticalUpdateLock(active: boolean, reason: string): void {
  const { beginBlocking, endBlocking } = useUpdateSession();

  useEffect(() => {
    if (!active) return;
    beginBlocking(reason);
    return () => endBlocking(reason);
  }, [active, reason, beginBlocking, endBlocking]);
}
