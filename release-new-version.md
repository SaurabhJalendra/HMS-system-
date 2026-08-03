# Release New ZenHosp Version

## 1. Finish development

1. Merge tested changes into `main`.
2. Confirm the working tree is clean.

```powershell
git status
```

## 2. Update app version

Edit:

```text
hms-desktop/package.json
```

Example:

```json
"version": "2.3.0"
```

## 3. Sync release manifest

```powershell
cd hms-desktop
node scripts/sync-release-version.mjs --notes "Faster login" "OT module" "Billing fixes"
```

Edit `release/version.json` if you need to raise `minimumDesktopVersion` for breaking API changes.

## 4. Commit version change

```powershell
git add hms-desktop/package.json hms-desktop/release/version.json hms-desktop/backend/api/data/release-version.json hms-desktop/backend/package.json
git commit -m "Release v2.3.0"
git push origin main
```

## 5. Create matching tag

Tag must match the desktop app version.

```powershell
git tag v2.3.0
git push origin v2.3.0
```

Tag push triggers the **desktop-release** GitHub Action. Backend deploy runs on `main` push.

## 6. Build installer (local alternative)

```powershell
cd hms-desktop
$env:ZENHOSP_UPDATE_FEED_URL = "https://YOUR-S3-OR-CLOUDFRONT-URL/zenhosp/desktop/"
npm run release:build
```

Expected files:

```text
release/installer-artifacts/RELEASES
release/installer-artifacts/ZenHosp-Setup.exe
release/installer-artifacts/*.nupkg
```

## 7. Publish to S3

```powershell
$env:ZENHOSP_UPDATE_S3_BUCKET = "your-bucket"
$env:AWS_REGION = "ap-south-1"
npm run release:publish-s3
```

Or use GitHub Actions with secrets configured (see `docs/RELEASE_AND_UPDATES.md`).

## 8. Deploy backend (EC2)

Automatic via GitHub Actions, or manually:

```bash
cd hms-desktop/backend
git pull
npm ci
npx prisma migrate deploy
npm run build
pm2 reload ecosystem.config.cjs
curl http://127.0.0.1:3000/api/version
```

## 9. Test update

1. Open a previously installed ZenHosp app.
2. Go to **Configuration → Updates**.
3. Check for updates.
4. Download update.
5. Restart and install only when no patient registration, consultation, or prescription is in progress.

Full architecture: `hms-desktop/docs/RELEASE_AND_UPDATES.md`
