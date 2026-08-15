import { BrowserWindow, app } from 'electron';
import { spawn } from 'child_process';
import path from 'path';
import { promises as fs } from 'fs';

export class CompilerService {
    private win: BrowserWindow;
    private projectRoot: string;

    constructor(win: BrowserWindow) {
        this.win = win;
        // Dev: project root itself. Prod: the directory next to app.asar (extraResources).
        const appPath = app.getAppPath();
        this.projectRoot = process.env.VITE_DEV_SERVER_URL || !appPath.endsWith('.asar')
            ? appPath
            : path.resolve(appPath, '..');
    }

    private sendlog(log: string) {
        console.log(log);
        this.win.webContents.send('setup-progress', log);
    }

    private runCommand(command: string, args: string[]): Promise<void> {
        return new Promise((resolve, reject) => {
            this.sendlog(`Executing: ${command} ${args.join(' ')} in ${this.projectRoot}`);

            const child = spawn(command, args, {
                cwd: this.projectRoot,
                shell: true // Use shell for commands like npm.cmd on Windows
            });

            child.stdout.on('data', (data) => {
                this.sendlog(data.toString().trim());
            });

            child.stderr.on('data', (data) => {
                this.sendlog(`STDERR: ${data.toString().trim()}`);
            });

            child.on('close', (code) => {
                if (code === 0) {
                    this.sendlog(`Command finished successfully.`);
                    resolve();
                } else {
                    this.sendlog(`Command failed with exit code ${code}.`);
                    reject(new Error(`Process exited with code ${code}`));
                }
            });

            child.on('error', (err) => {
                this.sendlog(`Failed to start command: ${err.message}`);
                reject(err);
            });
        });
    }

    public async runSetup(): Promise<boolean> {
        try {
            // Step 1: Install dependencies
            this.sendlog("Step 1/4: Installing build dependencies...");
            await this.runCommand('npm', ['install', 'node-gyp', 'node-addon-api']);
            this.sendlog("Dependencies installed.");

            // Step 2: Ensure binding.gyp is present (handle EEXIST / empty file)
            this.sendlog("Step 2/4: Configuring build file...");
            const gypTxtPath = path.join(this.projectRoot, 'binding.gyp.txt');
            const gypPath = path.join(this.projectRoot, 'binding.gyp');

            const [hasGyp, hasGypTxt] = await Promise.all([
                fs.access(gypPath).then(() => true).catch(() => false),
                fs.access(gypTxtPath).then(() => true).catch(() => false),
            ]);

            if (hasGypTxt) {
                if (hasGyp) {
                    // Replace stale binding.gyp (possibly 0 bytes) with the template
                    try {
                        const gypStats = await fs.stat(gypPath);
                        if (gypStats.size === 0) {
                            await fs.unlink(gypPath);
                            this.sendlog("Removed empty binding.gyp (stale build artifact).");
                        }
                    } catch { /* ignore */ }
                }
                try {
                    await fs.rename(gypTxtPath, gypPath);
                    this.sendlog("binding.gyp.txt renamed to binding.gyp");
                } catch (e: any) {
                    if (e.code === 'EEXIST' || e.code === 'EPERM') {
                        this.sendlog("binding.gyp already exists. Using existing file.");
                    } else if (e.code === 'ENOENT') {
                        this.sendlog("binding.gyp.txt not found. Proceeding with existing binding.gyp.");
                    } else {
                        throw e;
                    }
                }
            } else if (!hasGyp) {
                throw new Error('Neither binding.gyp nor binding.gyp.txt exists.');
            }

            // Step 3: Configure node-gyp
            this.sendlog("Step 3/4: Running node-gyp configure...");
            await this.runCommand('npx', ['node-gyp', 'configure']);
            this.sendlog("Configuration complete.");

            // Step 4: Build the addon
            this.sendlog("Step 4/4: Compiling C++ addon... (This may take a moment)");
            await this.runCommand('npx', ['node-gyp', 'build']);
            this.sendlog("Compilation finished!");

            return true;
        } catch (error) {
            console.error("Setup failed:", error);
            this.sendlog(`ERROR: Setup process failed. Please check the logs.`);
            return false;
        }
    }
}