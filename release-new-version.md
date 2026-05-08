# Release New GCS Version

## 1. Finish Development

1. Merge tested changes into `main`.
2. Confirm the working tree is clean.

```powershell
git status
```

## 2. Update App Version

Update the desktop app version:

```text
apps/desktop/package.json
```

Example:

```json
"version": "0.0.2"
```

## 3. Commit Version Change

```powershell
git add apps/desktop/package.json
git commit -m "Release v0.0.2"
git push origin main
```

## 4. Create Matching Tag

Tag must match the desktop app version.

```powershell
git tag v0.0.2
git push origin v0.0.2
```

## 5. Build Installer

```powershell
npm run build:installer
```

Expected files:

```text
dist/installer-artifacts/GCS-Setup.exe
dist/installer-artifacts/GCS-Setup.exe.blockmap
dist/installer-artifacts/latest.yml
```

## 6. Publish GitHub Release

```powershell
gh release create v0.0.2 `
  dist/installer-artifacts/GCS-Setup.exe `
  dist/installer-artifacts/GCS-Setup.exe.blockmap `
  dist/installer-artifacts/latest.yml `
  --repo Shubhendra-Yadav/gcs-updates `
  --title "GCS v0.0.2" `
  --notes "GCS desktop release v0.0.2"
```

Do not upload:

```text
builder-debug.yml
```

## 7. Verify Release

```powershell
gh release view v0.0.2 --repo Shubhendra-Yadav/gcs-updates
```

Confirm release assets:

```text
GCS-Setup.exe
GCS-Setup.exe.blockmap
latest.yml
```

## 8. Test Update

1. Open the previously installed GCS app.
2. Go to Settings.
3. Check for updates.
4. Download update.
5. Restart and install only when the drone is disarmed and no mission is running.
