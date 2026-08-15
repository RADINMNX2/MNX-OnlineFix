import path from 'path';
import { promises as fs } from 'fs';
import { Game, AppSettings } from '../../shared/types';

export class StorageService {
    private readonly gamesFilePath: string;
    private readonly settingsFilePath: string;

    constructor(userDataPath: string) {
        this.gamesFilePath = path.join(userDataPath, 'games.json');
        this.settingsFilePath = path.join(userDataPath, 'settings.json');
    }

    async getGames(): Promise<Game[]> {
        try {
            const data = await fs.readFile(this.gamesFilePath, 'utf-8');
            return JSON.parse(data) as Game[];
        } catch (error) {
            return [];
        }
    }

    async saveGames(games: Game[]): Promise<void> {
        try {
            const data = JSON.stringify(games, null, 2);
            await fs.writeFile(this.gamesFilePath, data, 'utf-8');
        } catch (error) {
            console.error('Failed to save games:', error);
        }
    }
    
    async getSettings(): Promise<AppSettings> {
        const defaults: AppSettings = {
            minimizeToTray: true,
            playerName: 'MNX_Agent',
            avatarDataUrl: undefined,
            hotkey: { key: 'Tab', vkCode: 0x09, ctrl: false, alt: false, shift: true } // Default: Shift + Tab
        };
        try {
            const data = await fs.readFile(this.settingsFilePath, 'utf-8');
            const savedSettings = JSON.parse(data);
            // Merge saved settings with defaults to ensure new properties are added
            return { ...defaults, ...savedSettings };
        } catch (error) {
            return defaults;
        }
    }

    async saveSettings(settings: AppSettings): Promise<void> {
        try {
            const data = JSON.stringify(settings, null, 2);
            await fs.writeFile(this.settingsFilePath, data, 'utf-8');
        } catch (error) {
            console.error('Failed to save settings:', error);
        }
    }
}
