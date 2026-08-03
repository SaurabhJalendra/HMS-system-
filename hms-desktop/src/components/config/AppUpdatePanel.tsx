import React, { useCallback, useEffect, useState } from "react";
import { getZenHospUpdater, isZenHospUpdaterAvailable } from "../../lib/updater/zenhospUpdaterClient";
import { useUpdateSession } from "../../lib/contexts/UpdateSessionContext";
import {
  fetchVersionInfo,
  evaluateVersionCompatibility,
  type VersionInfo,
} from "../../lib/api/services/versionService";

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
  const [releaseNotes, setReleaseNotes] = useState<string[]>([]);
  const [backendInfo, setBackendInfo] = useState<VersionInfo | null>(null);
  const [backendCompat, setBackendCompat] = useState<string>("");

  const updater = getZenHospUpdater();

  useEffect(() => {
    if (!updater) return;
    let off: (() => void) | undefined;

    void updater.getVersion().then((v) => {
      setInstalledVersion(v.version);
      setIsPackaged(v.isPackaged);
    });

    void fetchVersionInfo()
      .then((info) => {
        setBackendInfo(info);
        if (installedVersion) {
          setBackendCompat(evaluateVersionCompatibility(installedVersion, info));
        }
      })
      .catch(() => {
        /* backend offline — panel still works for electron-updater */
      });

    off = updater.onUpdaterEvent((evt) => {
      switch (evt.type) {
        case "checking-for-update":
          setPhase("checking");
          setMessage("");
          setDownloadPercent(null);
          break;
        case "update-available": {
          setPhase("available");
          const info = evt.data as {
            version?: string;
            releaseNotes?: string | string[];
          };
          setRemoteVersion(info?.version || "newer");
          const notes = info?.releaseNotes;
          if (Array.isArray(notes)) setReleaseNotes(notes.map(String));
          else if (typeof notes === "string" && notes.trim()) setReleaseNotes([notes]);
          setMessage("A newer version is available.");
          break;
        }
        case "update-not-available":
          setPhase("no-update");
          setMessage("You are on the latest version from the update server.");
          setRemoteVersion("");
          setReleaseNotes([]);
          break;
        case "download-progress":
          setPhase("downloading");
          setDownloadPercent(
            Math.round((evt.data as { percent?: number })?.percent ?? 0)
          );
          break;
        case "update-downloaded": {
          setPhase("ready");
          setDownloadPercent(100);
          const info = evt.data as {
            version?: string;
            releaseNotes?: string | string[];
          };
          setRemoteVersion(info?.version || "");
          const notes = info?.releaseNotes;
          if (Array.isArray(notes)) setReleaseNotes(notes.map(String));
          else if (typeof notes === "string" && notes.trim()) setReleaseNotes([notes]);
          setMessage("Update downloaded. Restart when you are finished with patient work.");
          break;
        }
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
  }, [updater, installedVersion]);

  useEffect(() => {
    if (installedVersion && backendInfo) {
      setBackendCompat(evaluateVersionCompatibility(installedVersion, backendInfo));
    }
  }, [installedVersion, backendInfo]);

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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-800 mb-4">
        <div className="rounded border border-gray-200 p-3 bg-gray-50">
          <div className="font-medium text-gray-900 mb-2">Desktop</div>
          <div>
            <span className="text-gray-600">Current:</span>{" "}
            {installedVersion || "—"}
            {!isPackaged && (
              <span className="ml-2 text-amber-700 text-xs">(dev / unpackaged)</span>
            )}
          </div>
          {remoteVersion ? (
            <div>
              <span className="text-gray-600">Update server:</span> v{remoteVersion}
            </div>
          ) : backendInfo?.latestDesktopVersion ? (
            <div>
              <span className="text-gray-600">Latest (API):</span> v
              {backendInfo.latestDesktopVersion}
            </div>
          ) : null}
        </div>
        <div className="rounded border border-gray-200 p-3 bg-gray-50">
          <div className="font-medium text-gray-900 mb-2">Backend API</div>
          {backendInfo ? (
            <>
              <div>
                <span className="text-gray-600">Version:</span> v
                {backendInfo.backendVersion}
              </div>
              <div>
                <span className="text-gray-600">Min desktop:</span> v
                {backendInfo.minimumDesktopVersion}
              </div>
              {backendCompat && backendCompat !== "compatible" ? (
                <div className="mt-1 text-amber-800 text-xs font-medium">
                  {backendCompat === "update_required"
                    ? "Your desktop is below the minimum required for this backend."
                    : "A newer desktop release is recommended for this backend."}
                </div>
              ) : backendCompat === "compatible" ? (
                <div className="mt-1 text-green-700 text-xs">Compatible with this backend.</div>
              ) : null}
            </>
          ) : (
            <div className="text-gray-500 text-xs">Could not reach /api/version</div>
          )}
        </div>
      </div>

      {(releaseNotes.length > 0 ||
        (backendInfo?.releaseNotes?.length && phase !== "no-update")) ? (
        <div className="mb-4 rounded border border-gray-200 p-3 bg-white">
          <div className="text-sm font-medium text-gray-900 mb-2">What&apos;s new</div>
          <ul className="text-sm text-gray-700 list-disc list-inside space-y-0.5">
            {(releaseNotes.length > 0 ? releaseNotes : backendInfo?.releaseNotes || [])
              .slice(0, 8)
              .map((note) => (
                <li key={note}>{note}</li>
              ))}
          </ul>
        </div>
      ) : null}

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
        Packaged installs check{" "}
        <code className="bg-gray-100 px-1 rounded">ZENHOSP_UPDATE_FEED_URL</code> or the feed URL
        baked in at build time (S3 / CloudFront folder with Squirrel{" "}
        <code className="bg-gray-100 px-1 rounded">RELEASES</code> + packages). Dev runs skip real
        checks unless{" "}
        <code className="bg-gray-100 px-1 rounded">ZENHOSP_UPDATER_TEST_DEV=1</code>.
      </p>
    </div>
  );
};

export default AppUpdatePanel;
