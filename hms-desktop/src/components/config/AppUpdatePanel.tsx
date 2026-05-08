import React, { useCallback, useEffect, useState } from "react";
import { getZenHospUpdater, isZenHospUpdaterAvailable } from "../../lib/updater/zenhospUpdaterClient";
import { useUpdateSession } from "../../lib/contexts/UpdateSessionContext";

type UiPhase =
  | "idle"
  | "checking"
  | "no-update"
  | "available"
  | "downloading"
  | "ready"
  | "error"
  | "dev-skipped";

const AppUpdatePanel: React.FC = () => {
  const { isSafeToRestartForUpdate, blockingReasons } = useUpdateSession();
  const [phase, setPhase] = useState<UiPhase>("idle");
  const [installedVersion, setInstalledVersion] = useState<string>("");
  const [isPackaged, setIsPackaged] = useState<boolean>(false);
  const [remoteVersion, setRemoteVersion] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [downloadPercent, setDownloadPercent] = useState<number | null>(null);

  const updater = getZenHospUpdater();

  useEffect(() => {
    if (!updater) return;
    let off: (() => void) | undefined;
    void updater.getVersion().then((v) => {
      setInstalledVersion(v.version);
      setIsPackaged(v.isPackaged);
    });
    off = updater.onUpdaterEvent((evt) => {
      switch (evt.type) {
        case "checking-for-update":
          setPhase("checking");
          setMessage("");
          setDownloadPercent(null);
          break;
        case "update-available":
          setPhase("available");
          setRemoteVersion(
            (evt.data as { version?: string })?.version || "newer"
          );
          setMessage("A newer version is available.");
          break;
        case "update-not-available":
          setPhase("no-update");
          setMessage("You are on the latest version.");
          setRemoteVersion("");
          break;
        case "download-progress":
          setPhase("downloading");
          setDownloadPercent(
            Math.round((evt.data as { percent?: number })?.percent ?? 0)
          );
          break;
        case "update-downloaded":
          setPhase("ready");
          setDownloadPercent(100);
          setRemoteVersion(
            (evt.data as { version?: string })?.version || ""
          );
          setMessage("Update downloaded. Restart when you are finished with patient work.");
          break;
        case "error":
          setPhase("error");
          setMessage(
            (evt.data as { message?: string })?.message || "Update error"
          );
          break;
        case "dev-skipped":
          setPhase("dev-skipped");
          setMessage(
            (evt.data as { message?: string })?.message ||
              "Updater skipped in development."
          );
          break;
        default:
          break;
      }
    });
    return () => {
      off?.();
    };
  }, [updater]);

  const handleCheck = useCallback(async () => {
    if (!updater) {
      setPhase("error");
      setMessage("Updates are only available in the ZenHosp desktop app.");
      return;
    }
    setPhase("checking");
    setMessage("");
    const res = await updater.checkForUpdates();
    if (res.skipped) {
      setPhase("dev-skipped");
      return;
    }
    if (!res.ok) {
      setPhase("error");
      setMessage(res.error || "Check failed");
    }
  }, [updater]);

  const handleDownload = useCallback(async () => {
    if (!updater) return;
    setPhase("downloading");
    setDownloadPercent(0);
    const res = await updater.downloadUpdate();
    if (!res.ok) {
      setPhase("error");
      setMessage(res.error || "Download failed");
    }
  }, [updater]);

  const handleRestart = useCallback(async () => {
    if (!updater) return;
    if (!isSafeToRestartForUpdate) return;
    await updater.quitAndInstall();
  }, [updater, isSafeToRestartForUpdate]);

  if (!isZenHospUpdaterAvailable()) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">App updates</h2>
        <p className="text-sm text-gray-600">
          In-app updates are available when you run the installed ZenHosp desktop application (Electron). In a plain browser build this section is not shown.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
      <h2 className="text-xl font-semibold text-gray-900 mb-2">App updates</h2>
      <p className="text-sm text-gray-600 mb-4">
        Check for a newer ZenHosp build, download it, then restart when no patient registration,
        consultation, or prescription is in progress.
      </p>

      <div className="text-sm text-gray-800 mb-4 space-y-1">
        <div>
          <span className="font-medium">Installed version:</span>{" "}
          {installedVersion || "—"}
          {!isPackaged && (
            <span className="ml-2 text-amber-700">(development / unpackaged)</span>
          )}
        </div>
        {remoteVersion ? (
          <div>
            <span className="font-medium">Update version:</span> {remoteVersion}
          </div>
        ) : null}
      </div>

      {message ? (
        <div
          className={`mb-4 text-sm px-3 py-2 rounded border ${
            phase === "error"
              ? "bg-red-50 border-red-200 text-red-800"
              : phase === "no-update"
                ? "bg-green-50 border-green-200 text-green-800"
                : "bg-gray-50 border-gray-200 text-gray-800"
          }`}
        >
          {message}
        </div>
      ) : null}

      {phase === "downloading" && downloadPercent !== null ? (
        <div className="mb-4">
          <div className="text-xs text-gray-600 mb-1">Download progress</div>
          <div className="h-2 bg-gray-200 rounded overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-all"
              style={{ width: `${downloadPercent}%` }}
            />
          </div>
          <div className="text-xs text-gray-500 mt-1">{downloadPercent}%</div>
        </div>
      ) : null}

      {!isSafeToRestartForUpdate && phase === "ready" ? (
        <div className="mb-4 text-sm text-amber-800 bg-amber-50 border border-amber-200 px-3 py-2 rounded">
          Finish the current task before restarting. Active:{" "}
          {blockingReasons.join(", ")}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleCheck}
          disabled={phase === "checking" || phase === "downloading"}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {phase === "checking" ? "Checking…" : "Check for updates"}
        </button>

        {phase === "available" && (
          <button
            type="button"
            onClick={handleDownload}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700"
          >
            Download update
          </button>
        )}

        {phase === "ready" && (
          <button
            type="button"
            onClick={handleRestart}
            disabled={!isSafeToRestartForUpdate}
            className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-md hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Restart and install
          </button>
        )}
      </div>

      <p className="mt-4 text-xs text-gray-500">
        Packaged installs need <code className="bg-gray-100 px-1 rounded">ZENHOSP_UPDATE_FEED_URL</code> set on the machine (or in the installer environment) to the HTTPS base URL that contains your Squirrel{" "}
        <code className="bg-gray-100 px-1 rounded">RELEASES</code> file and packages. Dev runs skip real checks unless{" "}
        <code className="bg-gray-100 px-1 rounded">ZENHOSP_UPDATER_TEST_DEV=1</code>.
      </p>
    </div>
  );
};

export default AppUpdatePanel;
