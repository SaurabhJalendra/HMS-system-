import React, { useEffect, useState } from "react";
import {
  fetchVersionInfo,
  evaluateVersionCompatibility,
  type VersionInfo,
} from "../../lib/api/services/versionService";
import { getZenHospUpdater, isZenHospUpdaterAvailable } from "../../lib/updater/zenhospUpdaterClient";
import config from "../../config/environment";

type Props = {
  onNavigateToSettings?: () => void;
};

const VersionCompatibilityBanner: React.FC<Props> = ({ onNavigateToSettings }) => {
  const [desktopVersion, setDesktopVersion] = useState(config.APP_VERSION);
  const [serverInfo, setServerInfo] = useState<VersionInfo | null>(null);
  const [compat, setCompat] = useState<
    "loading" | "compatible" | "update_recommended" | "update_required" | "error"
  >("loading");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        let installed = config.APP_VERSION;
        const updater = getZenHospUpdater();
        if (updater) {
          const v = await updater.getVersion();
          if (v.version) installed = v.version;
        }
        if (cancelled) return;
        setDesktopVersion(installed);

        const info = await fetchVersionInfo();
        if (cancelled) return;

        setServerInfo(info);
        setCompat(evaluateVersionCompatibility(installed, info));
      } catch {
        if (cancelled) return;
        setCompat("error");
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (compat === "loading" || compat === "compatible" || compat === "error") {
    return null;
  }

  const isRequired = compat === "update_required";

  return (
    <div
      className={`mx-4 mt-3 mb-1 rounded-lg border px-4 py-3 text-sm ${
        isRequired
          ? "bg-red-50 border-red-200 text-red-900"
          : "bg-blue-50 border-blue-200 text-blue-900"
      }`}
      role="status"
    >
      <div className="font-semibold mb-1">
        {isRequired ? "Desktop update required" : "Desktop update available"}
      </div>
      <p className="mb-2">
        Installed: v<strong>{desktopVersion}</strong>. Server backend: v
        <strong>{serverInfo?.backendVersion}</strong>
        {isRequired ? (
          <>
            {" "}
            — minimum desktop v<strong>{serverInfo?.minimumDesktopVersion}</strong>{" "}
            required.
          </>
        ) : (
          <>
            {" "}
            — latest desktop v<strong>{serverInfo?.latestDesktopVersion}</strong>.
          </>
        )}
      </p>
      {serverInfo?.releaseNotes?.length ? (
        <ul className="list-disc list-inside mb-2 text-xs opacity-90">
          {serverInfo.releaseNotes.slice(0, 4).map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
      {onNavigateToSettings && isZenHospUpdaterAvailable() ? (
        <button
          type="button"
          onClick={onNavigateToSettings}
          className={`px-3 py-1.5 rounded text-white text-xs font-medium ${
            isRequired ? "bg-red-700 hover:bg-red-800" : "bg-blue-700 hover:bg-blue-800"
          }`}
        >
          Open Settings → App updates
        </button>
      ) : (
        <p className="text-xs">
          Contact your administrator to install ZenHosp v
          {serverInfo?.latestDesktopVersion}.
        </p>
      )}
    </div>
  );
};

export default VersionCompatibilityBanner;
