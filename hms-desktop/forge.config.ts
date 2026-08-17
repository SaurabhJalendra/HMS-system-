import path from "node:path";
import type { ForgeConfig } from "@electron-forge/shared-types";
import MakerNSIS from "@electron-addons/electron-forge-maker-nsis";
import { MakerZIP } from "@electron-forge/maker-zip";
import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerRpm } from "@electron-forge/maker-rpm";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { FuseV1Options, FuseVersion } from "@electron/fuses";

const iconPath = path.resolve(__dirname, "assets", "icon");

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    appBundleId: "com.zenhosp.desktop",
    icon: iconPath,
    extraResource: [path.resolve(__dirname, "assets", "icon.ico")],
  },
  rebuildConfig: {},
  makers: [
    // Windows: NSIS + latest.yml for electron-updater (replaces MakerSquirrel).
    // updater.url is required by the maker to emit channel yml; runtime GitHub
    // provider config is handled separately in src/main/updater.ts (Step 6).
    new MakerNSIS({
      updater: {
        url: "https://github.com/SaurabhJalendra/HMS-system-/releases/latest/download",
        channel: "latest",
        updaterCacheDirName: "zenhosp-updater",
      },
    }),
    new MakerZIP({}, ["darwin"]),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: "src/main.ts",
          config: "vite.main.config.ts",
          target: "main",
        },
        {
          entry: "src/preload.ts",
          config: "vite.preload.config.ts",
          target: "preload",
        },
      ],
      renderer: [
        {
          name: "main_window",
          config: "vite.renderer.config.ts",
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
