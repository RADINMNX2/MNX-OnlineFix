import { promises as fs, existsSync } from 'fs';
import path from 'path';
import { app } from 'electron';

/**
 * Resolves native binary locations in both Dev and packaged (ASAR) environments.
 *
 * Dev:  appPath = project root (contains package.json, build/, target/, MNX_DLL/)
 * Prod: appPath = .../resources/app.asar → binaries live in .../resources/ (extraResources)
 */
export class FileService {
    private getBaseDir(): string {
        const appPath = app.getAppPath();
        if (process.env.VITE_DEV_SERVER_URL || !appPath.endsWith('.asar')) {
            return appPath;
        }
        return path.resolve(appPath, '..');
    }

    private resolveFirst(candidates: string[]): string | null {
        for (const candidate of candidates) {
            if (existsSync(candidate)) return candidate;
        }
        return null;
    }

    /**
     * The Node.js native addon used by Electron to communicate with the proxy DLL
     * (writes the Shared Memory bridge).
     */
    public getAddonPath(): string | null {
        const base = this.getBaseDir();
        return this.resolveFirst([
            // napi-rs build output
            path.join(base, 'target/release/mnx_steam_proxy.node'),
            path.join(base, 'mnx_steam_proxy.node'),
            // Legacy node-gyp build output
            path.join(base, 'build/Release/mnx_steam_proxy.node'),
        ]);
    }

    /**
     * The actual DLL injected into the game folder as steam_api64.dll.
     * Prefers the Rust cdylib (real Steam API exports) over the legacy .node addon.
     */
    public getInjectionDllPath(): string | null {
        const base = this.getBaseDir();
        return this.resolveFirst([
            path.join(base, 'target/release/steam_api64.dll'),
            path.join(base, 'steam_api64.dll'),
            path.join(base, 'target/release/mnx_steam_proxy.dll'),
            path.join(base, 'build/Release/mnx_steam_proxy.node'),
        ]);
    }

    public getProxyDllPath(): string {
        return this.getAddonPath() ?? path.join(this.getBaseDir(), 'build/Release/mnx_steam_proxy.node');
    }

    public isProxyCompiled(): boolean {
        return !!this.getAddonPath() || !!this.getInjectionDllPath();
    }

    public getCompilerBaseDir(): string {
        return this.getBaseDir();
    }

    private async fileExists(filePath: string): Promise<boolean> {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    async injectProxy(gamePath: string): Promise<boolean> {
        const originalDllPath = path.join(gamePath, 'steam_api64.dll');
        const backupDllPath = path.join(gamePath, 'steam_api64_original.dll');
        const proxyDllSourcePath = this.getInjectionDllPath();

        try {
            if (!proxyDllSourcePath || !existsSync(proxyDllSourcePath)) {
                console.error('Proxy DLL not found. Run the setup first.');
                return false;
            }

            if (await this.fileExists(originalDllPath) && !(await this.fileExists(backupDllPath))) {
                console.log(`Backing up original DLL to: ${backupDllPath}`);
                await fs.rename(originalDllPath, backupDllPath);
            }

            console.log(`Injecting proxy DLL (${proxyDllSourcePath}) into: ${originalDllPath}`);
            await fs.copyFile(proxyDllSourcePath, originalDllPath);

            return true;
        } catch (error) {
            console.error('Failed to inject proxy DLL:', error);
            await this.restoreOriginal(gamePath).catch(e => console.error("Cleanup failed:", e));
            return false;
        }
    }

    async restoreOriginal(gamePath: string): Promise<boolean> {
        const originalDllPath = path.join(gamePath, 'steam_api64.dll');
        const backupDllPath = path.join(gamePath, 'steam_api64_original.dll');

        try {
            if (await this.fileExists(backupDllPath)) {
                console.log(`Restoring original DLL from: ${backupDllPath}`);
                // Before restoring, ensure the injected DLL is removed
                if (await this.fileExists(originalDllPath)) {
                    await fs.unlink(originalDllPath);
                }
                await fs.rename(backupDllPath, originalDllPath);
                return true;
            } else {
                console.warn('No backup DLL found to restore.');
                const injected = this.getInjectionDllPath();
                if (await this.fileExists(originalDllPath) && injected) {
                    const injectedStat = await fs.stat(originalDllPath);
                    const sourceStat = await fs.stat(injected);
                    if (injectedStat.size === sourceStat.size) {
                        await fs.unlink(originalDllPath);
                        console.log('Removed injected proxy DLL.');
                    }
                }
            }
            return true;
        } catch (error) {
            console.error('Failed to restore original DLL:', error);
            return false;
        }
    }
}