import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

export type UpdateSessionContextValue = {
  beginBlocking: (reason: string) => void;
  endBlocking: (reason: string) => void;
  isSafeToRestartForUpdate: boolean;
  blockingReasons: string[];
};

const UpdateSessionContext = createContext<UpdateSessionContextValue | null>(
  null
);

export const UpdateSessionProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [counts, setCounts] = useState<Record<string, number>>({});

  const beginBlocking = useCallback((reason: string) => {
    setCounts((prev) => ({
      ...prev,
      [reason]: (prev[reason] || 0) + 1,
    }));
  }, []);

  const endBlocking = useCallback((reason: string) => {
    setCounts((prev) => {
      const next = { ...prev };
      const n = Math.max(0, (next[reason] || 0) - 1);
      if (n === 0) delete next[reason];
      else next[reason] = n;
      return next;
    });
  }, []);

  const blockingReasons = useMemo(
    () =>
      Object.entries(counts)
        .filter(([, n]) => n > 0)
        .map(([k]) => k),
    [counts]
  );

  const isSafeToRestartForUpdate = blockingReasons.length === 0;

  const value = useMemo(
    () => ({
      beginBlocking,
      endBlocking,
      isSafeToRestartForUpdate,
      blockingReasons,
    }),
    [beginBlocking, endBlocking, isSafeToRestartForUpdate, blockingReasons]
  );

  return (
    <UpdateSessionContext.Provider value={value}>
      {children}
    </UpdateSessionContext.Provider>
  );
};

export function useUpdateSession(): UpdateSessionContextValue {
  const ctx = useContext(UpdateSessionContext);
  if (!ctx) {
    throw new Error("useUpdateSession must be used within UpdateSessionProvider");
  }
  return ctx;
}
