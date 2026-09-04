# Release New ZenHosp Version

## ⚡ Automated 1-Command Release (Recommended)

From the project root (`D:\OneDrive\HMS-system-`), run a single command:

```powershell
# Bump patch version (e.g. 1.0.7 -> 1.0.8) with release notes:
npm run release -- patch "Add doctor consultation fee and automatic patient billing"

# Or bump minor version (e.g. 1.0.8 -> 1.1.0):
npm run release -- minor "New OT surgical module"

# Or release a specific version:
npm run release -- 1.0.8 "Bug fixes and performance improvements"

# Or re-publish the current version:
npm run release -- current "Publish v1.0.7 with latest updates"
```

### Options:
- `--dry-run`: Preview what would happen without committing or pushing anything:
  ```powershell
  npm run release --dry-run patch "Test release notes"
  ```
- `--no-push`: Update files, commit, and tag locally without pushing to remote:
  ```powershell
  npm run release --no-push patch "Local release"
  ```
- `--min-desktop <version>`: Set minimum desktop version required by backend:
  ```powershell
  npm run release -- patch "Breaking API change" --min-desktop 1.0.7
  ```

### What this single command does automatically:
1. Bumps / syncs version across all 5 version files:
   - `package.json`
   - `hms-desktop/package.json`
   - `hms-desktop/backend/package.json`
   - `hms-desktop/release/version.json`
   - `hms-desktop/backend/api/data/release-version.json`
2. Sets `publishedAt` timestamp and updates release notes.
3. Commits the changes on `dev`.
4. Pushes `dev` to `origin`.
5. Merges `dev` into `main` and pushes `main` (triggers backend deploy).
6. Creates and pushes the git tag `v<version>` (triggers desktop installer build on GitHub Actions).
7. Switches back to `dev` so you can continue developing immediately.

---

## 🛠️ Manual Release Flow (Reference Only)

If you ever need to perform steps manually:

1. Update version in `hms-desktop/package.json`.
2. Sync manifest:
   ```powershell
   cd hms-desktop
   node scripts/sync-release-version.mjs --notes "Feature A" "Fix B"
   ```
3. Commit version change on `dev`:
   ```powershell
   git add -A
   git commit -m "Release vX.Y.Z"
   git push origin dev
   ```
4. Merge into `main`:
   ```powershell
   git checkout main
   git merge dev
   git push origin main
   git checkout dev
   ```
5. Tag and push:
   ```powershell
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

---

## 🧪 Testing Desktop Updates

1. Open a previously installed ZenHosp app.
2. Go to **Dashboard ➔ Configuration ➔ App updates**.
3. Click **Check for updates**.
4. Click **Download and install**.
5. ZenHosp will close, update silently via NSIS, and reopen with the new version.
