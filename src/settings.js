const fs = require('fs');
const path = require('path');

const dataDir = fs.existsSync('/data') ? '/data' : path.join(__dirname, '..', 'data');
const settingsPath = path.join(dataDir, 'settings.json');

const defaultSettings = {
	downloadEnabled: true,
	byAlbum: false,
	byArtist: false,
	downloadLyrics: true,
	downloadEmbedLyrics: true,
	downloadLrcFile: true,
	addTranslation: true,
	embedLyricAddTranslation: true,
	lrcFileAddTranslation: true,
	useDynamicLyrics: true,
	embedLyricDynamic: true,
	lrcFileDynamic: true,
	mp3BothStaticDynamic: false
};

function getSettings() {
	try {
		if (!fs.existsSync(dataDir)) {
			fs.mkdirSync(dataDir, { recursive: true });
		}
		if (fs.existsSync(settingsPath)) {
			const content = fs.readFileSync(settingsPath, 'utf8');
			return { ...defaultSettings, ...JSON.parse(content) };
		} else {
			// Write default settings to settings.json if it doesn't exist
			saveSettings(defaultSettings);
		}
	} catch (e) {
		console.error('Failed to read settings, using defaults:', e.message);
	}
	return { ...defaultSettings };
}

function saveSettings(settings) {
	try {
		if (!fs.existsSync(dataDir)) {
			fs.mkdirSync(dataDir, { recursive: true });
		}
		fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 4), 'utf8');
		return true;
	} catch (e) {
		console.error('Failed to save settings:', e.message);
		return false;
	}
}

module.exports = {
	getSettings,
	saveSettings,
	settingsPath
};
