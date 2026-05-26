const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { spawn } = require('child_process');
const os = require('os');
const { getSettings } = require('./settings');

const songId = process.argv[2];
const fallbackSongName = process.argv[3];
const audioUrl = process.argv[4];

// Resolve output dir
const outputDir = fs.existsSync('/data') ? '/data' : path.join(process.cwd(), 'data');
if (!fs.existsSync(outputDir)) {
	try {
		fs.mkdirSync(outputDir, { recursive: true });
	} catch (e) {}
}
const logFile = path.join(outputDir, 'download.log');

function log(message, level = 'INFO') {
	const timestamp = new Date().toISOString();
	const logLine = `[${timestamp}] [${level}] [Song ${songId}] ${message}\n`;
	try {
		fs.appendFileSync(logFile, logLine);
	} catch (e) {}
	console.log(logLine.trim());
}

// Download utility with redirect support
function downloadFile(url, destPath) {
	return new Promise((resolve, reject) => {
		const parsedUrl = new URL(url);
		const client = parsedUrl.protocol === 'https:' ? https : http;

		const headers = {
			'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
			'X-Real-IP': '118.8.8.8'
		};
		const host = parsedUrl.host;
		if (host.includes('bilibili.com') || host.includes('bilivideo.com') || host.includes('bilivideo.cn') || host.includes('upos-')) {
			headers['Referer'] = 'https://www.bilibili.com/';
		} else if (host.includes('qq.com')) {
			headers['Referer'] = 'https://y.qq.com/';
		} else if (host.includes('126.net') || host.includes('163.com')) {
			headers['Referer'] = 'https://music.163.com/';
		} else if (host.includes('kugou.com')) {
			headers['Referer'] = 'http://www.kugou.com/';
		} else if (host.includes('kuwo.cn')) {
			headers['Referer'] = 'http://www.kuwo.cn/';
		} else if (host.includes('migu.cn')) {
			headers['Referer'] = 'https://music.migu.cn/';
		}

		const req = client.get(url, { headers }, (res) => {
			if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
				// Handle redirect
				const redirectUrl = new URL(res.headers.location, url).href;
				return downloadFile(redirectUrl, destPath).then(resolve).catch(reject);
			}
			if (res.statusCode !== 200) {
				return reject(new Error(`Failed to download, status: ${res.statusCode}`));
			}
			const fileStream = fs.createWriteStream(destPath);
			res.pipe(fileStream);
			fileStream.on('finish', () => {
				fileStream.close();
				resolve(res.headers);
			});
			fileStream.on('error', (err) => {
				fs.unlink(destPath, () => {});
				reject(err);
			});
		});
		req.on('error', reject);
	});
}

// Fetch JSON utility
function fetchJson(url) {
	return new Promise((resolve, reject) => {
		const parsedUrl = new URL(url);
		const client = parsedUrl.protocol === 'https:' ? https : http;
		const req = client.get(url, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
				'X-Real-IP': '118.8.8.8'
			}
		}, (res) => {
			let data = '';
			res.on('data', chunk => { data += chunk; });
			res.on('end', () => {
				try {
					resolve(JSON.parse(data));
				} catch (e) {
					reject(new Error(`Invalid JSON response: ${data.slice(0, 100)}`));
				}
			});
		});
		req.on('error', reject);
	});
}

async function main() {
	if (!songId || !audioUrl) {
		log('Missing songId or audioUrl', 'ERROR');
		process.exit(1);
	}

	// Deduplication check: check if song has already been processed in download.log
	if (fs.existsSync(logFile)) {
		try {
			const logContent = fs.readFileSync(logFile, 'utf8');
			if (logContent.includes(`[Song ${songId}]`)) {
				console.log(`Song ${songId} has already been processed (found in download.log). Skipping.`);
				process.exit(0);
			}
		} catch (e) {
			console.error(`Failed to read download.log: ${e.message}`);
		}
	}

	log(`Starting background download. Audio URL: ${audioUrl}`);

	let songTitle = fallbackSongName || '';
	let artistName = 'Unknown Artist';
	let albumName = 'Unknown Album';
	let picUrl = '';
	let lyrics = '';
	let cleanLyrics = '';

	// Step A: Get Metadata
	try {
		const detail = await fetchJson(`https://music.163.com/api/song/detail?ids=[${songId}]`);
		if (detail && detail.songs && detail.songs[0]) {
			const s = detail.songs[0];
			songTitle = s.name || songTitle;
			if (s.artists && s.artists.length) {
				artistName = s.artists.map(a => a.name).join(' & ');
			}
			if (s.album) {
				albumName = s.album.name || albumName;
				picUrl = s.album.picUrl || '';
			}
		}
	} catch (err) {
		log(`Failed to fetch song details: ${err.message}. Using defaults.`, 'WARN');
	}

	// Try to fetch lyrics
	try {
		const lyricRes = await fetchJson(`https://music.163.com/api/song/lyric?id=${songId}&lv=1&kv=1&tv=-1`);
		if (lyricRes && lyricRes.lrc && lyricRes.lrc.lyric) {
			lyrics = lyricRes.lrc.lyric;
			cleanLyrics = lyrics.replace(/\[\d+:\d+(?:\.\d+)?\]/g, '').trim();
		}
	} catch (err) {
		log(`Failed to fetch lyrics: ${err.message}`, 'WARN');
	}

	// Step B: Download assets
	const tempDir = os.tmpdir();
	const tempAudioPath = path.join(tempDir, `audio_${songId}_raw`);
	const tempCoverPath = path.join(tempDir, `cover_${songId}.jpg`);

	try {
		log(`Downloading audio stream...`);
		const audioHeaders = await downloadFile(audioUrl, tempAudioPath);
		
		// Determine extension from Content-Type or audioUrl
		let ext = '.m4a';
		const contentType = audioHeaders['content-type'] || '';
		if (contentType.includes('audio/mpeg') || audioUrl.includes('.mp3')) {
			ext = '.mp3';
		} else if (contentType.includes('audio/flac') || audioUrl.includes('.flac')) {
			ext = '.flac';
		}
		
		const actualTempAudioPath = tempAudioPath + ext;
		
		try {
			if (fs.existsSync(actualTempAudioPath)) {
				fs.unlinkSync(actualTempAudioPath);
			}
			fs.renameSync(tempAudioPath, actualTempAudioPath);
		} catch (e) {
			log(`Rename temp audio failed: ${e.message}`, 'ERROR');
			throw e;
		}

		let hasCover = false;
		if (picUrl) {
			log(`Downloading cover image from ${picUrl}...`);
			try {
				await downloadFile(picUrl, tempCoverPath);
				hasCover = true;
			} catch (coverErr) {
				log(`Failed to download cover image: ${coverErr.message}`, 'WARN');
			}
		}

		// Step C: ffmpeg Merge & Save
		const settings = getSettings();
		const sanitizedArtist = artistName.replace(/[\\/:*?"<>|]/g, '_');
		const sanitizedTitle = songTitle.replace(/[\\/:*?"<>|]/g, '_');
		const sanitizedAlbum = albumName.replace(/[\\/:*?"<>|]/g, '_');

		let targetDir = outputDir;
		if (settings.byArtist) {
			targetDir = path.join(targetDir, sanitizedArtist);
		}
		if (settings.byAlbum) {
			targetDir = path.join(targetDir, sanitizedAlbum);
		}

		if (!fs.existsSync(targetDir)) {
			try {
				fs.mkdirSync(targetDir, { recursive: true });
			} catch (e) {
				log(`Failed to create directory ${targetDir}: ${e.message}`, 'WARN');
			}
		}

		const finalFilename = `${sanitizedArtist} - ${sanitizedTitle}${ext}`;
		const finalOutputPath = path.join(targetDir, finalFilename);

		log(`Merging with ffmpeg. Output path: ${finalOutputPath}`);

		const ffmpegArgs = [];
		ffmpegArgs.push('-y', '-i', actualTempAudioPath);
		if (hasCover) {
			ffmpegArgs.push('-i', tempCoverPath);
		}

		ffmpegArgs.push('-map', '0:a');
		if (hasCover) {
			ffmpegArgs.push('-map', '1:0', '-c:v', 'copy', '-disposition:v:0', 'attached_pic');
		}
		ffmpegArgs.push('-c:a', 'copy');

		ffmpegArgs.push('-metadata', `title=${songTitle}`);
		ffmpegArgs.push('-metadata', `artist=${artistName}`);
		ffmpegArgs.push('-metadata', `album=${albumName}`);
		
		if (cleanLyrics) {
			if (ext === '.mp3') {
				ffmpegArgs.push('-metadata', `lyrics=${cleanLyrics}`);
				ffmpegArgs.push('-metadata', `USLT=${cleanLyrics}`);
			} else {
				ffmpegArgs.push('-metadata', `lyrics=${cleanLyrics}`);
			}
		}

		ffmpegArgs.push(finalOutputPath);

		const ffmpegProc = spawn('ffmpeg', ffmpegArgs);

		let finished = false;
		const handleFinish = (code, err) => {
			if (finished) return;
			finished = true;
			if (code === 0) {
				log(`Successfully downloaded and metadata merged! Saved to ${finalFilename}`);
			} else {
				log(`ffmpeg failed/unavailable (code ${code}, err: ${err ? err.message : 'none'}). Falling back to copying raw audio...`, 'WARN');
				try {
					fs.copyFileSync(actualTempAudioPath, finalOutputPath);
					log(`Fallback: Raw audio file copied to ${finalOutputPath}`);
				} catch (copyErr) {
					log(`Fallback copy failed: ${copyErr.message}`, 'ERROR');
				}
			}

			if (fs.existsSync(finalOutputPath) && lyrics) {
				try {
					const lrcPath = path.join(targetDir, `${sanitizedArtist} - ${sanitizedTitle}.lrc`);
					fs.writeFileSync(lrcPath, lyrics, 'utf8');
					log(`Successfully wrote LRC file to ${lrcPath}`);
				} catch (lrcErr) {
					log(`Failed to write LRC file: ${lrcErr.message}`, 'WARN');
				}
			}

			cleanup(actualTempAudioPath, tempCoverPath);
		};

		ffmpegProc.on('error', (err) => {
			handleFinish(null, err);
		});

		ffmpegProc.on('close', (code) => {
			handleFinish(code, null);
		});

	} catch (err) {
		log(`Download process failed: ${err.stack}`, 'ERROR');
		cleanup(tempAudioPath, tempCoverPath);
		cleanup(tempAudioPath + '.m4a', tempCoverPath);
		cleanup(tempAudioPath + '.mp3', tempCoverPath);
		cleanup(tempAudioPath + '.flac', tempCoverPath);
	}
}

function cleanup(audioPath, coverPath) {
	try {
		if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
	} catch (e) {}
	try {
		if (fs.existsSync(coverPath)) fs.unlinkSync(coverPath);
	} catch (e) {}
}

main();
