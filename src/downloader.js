const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { spawn } = require('child_process');
const os = require('os');
const { getSettings } = require('./settings');
const { pipeline } = require('stream');

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

function downloadOnce(url, destPath) {
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

		let finished = false;
		const req = client.get(url, { headers, timeout: 30000 }, (res) => {
			if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
				const redirectUrl = new URL(res.headers.location, url).href;
				finished = true;
				return downloadOnce(redirectUrl, destPath).then(resolve).catch(reject);
			}
			if (res.statusCode !== 200 && res.statusCode !== 206) {
				finished = true;
				return reject(new Error(`Failed to download, status: ${res.statusCode}`));
			}

			const fileStream = fs.createWriteStream(destPath);
			pipeline(res, fileStream, (err) => {
				if (finished) return;
				finished = true;
				if (err) {
					fs.unlink(destPath, () => {});
					reject(err);
				} else {
					resolve(res.headers);
				}
			});
		});

		req.on('error', (err) => {
			if (finished) return;
			finished = true;
			reject(err);
		});

		req.on('timeout', () => {
			if (finished) return;
			finished = true;
			req.destroy();
			reject(new Error('Request timeout'));
		});
	});
}

// Download utility with redirect, timeout, stream pipelines and auto retries
async function downloadFile(url, destPath, retries = 3) {
	let lastError;
	for (let i = 0; i < retries; i++) {
		try {
			if (i > 0) {
				log(`Retrying download (attempt ${i + 1}/${retries})...`, 'WARN');
				await new Promise(resolve => setTimeout(resolve, 1000));
			}
			return await downloadOnce(url, destPath);
		} catch (err) {
			lastError = err;
			log(`Download attempt ${i + 1} failed: ${err.message}`, 'WARN');
		}
	}
	throw lastError;
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

function generateLyricText(original, translated, dynamic, addTranslation) {
	if (!original) return '';

	const timeRegex = /\[\d+:\d+(?:\.\d+)?\]/g;
	const originalLines = original.split('\n');

	if (!dynamic) {
		// Static lyrics: remove timestamps
		const cleanOriginalLines = originalLines.map(line => line.replace(timeRegex, '').trim()).filter(line => line);
		if (!translated || !addTranslation) {
			return cleanOriginalLines.join('\n');
		}

		const translatedLines = translated.split('\n');
		const translationMap = new Map();
		for (const line of translatedLines) {
			const matches = line.match(timeRegex);
			if (!matches) continue;
			const text = line.replace(timeRegex, '').trim();
			if (!text) continue;
			for (const time of matches) {
				translationMap.set(time, text);
			}
		}

		const merged = [];
		for (const line of originalLines) {
			const matches = line.match(timeRegex);
			const cleanOriginal = line.replace(timeRegex, '').trim();
			if (!cleanOriginal) continue;
			merged.push(cleanOriginal);

			if (matches) {
				let translation = '';
				for (const time of matches) {
					if (translationMap.has(time)) {
						translation = translationMap.get(time);
						break;
					}
				}
				if (translation) {
					merged.push(translation);
				}
			}
		}
		return merged.join('\n');
	} else {
		// Dynamic lyrics: keep timestamps
		if (!translated || !addTranslation) {
			return original;
		}

		const translatedLines = translated.split('\n');
		const translationMap = new Map();
		for (const line of translatedLines) {
			const matches = line.match(timeRegex);
			if (!matches) continue;
			const text = line.replace(timeRegex, '').trim();
			if (!text) continue;
			for (const time of matches) {
				translationMap.set(time, text);
			}
		}

		const merged = [];
		for (const line of originalLines) {
			const matches = line.match(timeRegex);
			if (!matches) {
				merged.push(line);
				continue;
			}

			const originalText = line.replace(timeRegex, '').trim();
			let translation = '';
			for (const time of matches) {
				if (translationMap.has(time)) {
					translation = translationMap.get(time);
					break;
				}
			}

			merged.push(line);
			if (translation && originalText) {
				merged.push(translation);
			}
		}
		return merged.join('\n');
	}
}

function parseSyltLyrics(original, translated, addTranslation) {
	if (!original) return [];
	const originalLines = original.split('\n');
	const timeRegex = /\[\d+:\d+(?:\.\d+)?\]/;
	const timeRegexExec = /\[(\d+):(\d+)(?:\.(\d+))?\]/g;

	const translationMap = new Map();
	if (translated && addTranslation) {
		const translatedLines = translated.split('\n');
		for (const line of translatedLines) {
			timeRegexExec.lastIndex = 0;
			const matches = line.match(/\[\d+:\d+(?:\.\d+)?\]/g);
			if (!matches) continue;
			const text = line.replace(/\[\d+:\d+(?:\.\d+)?\]/g, '').trim();
			if (!text) continue;
			for (const time of matches) {
				translationMap.set(time, text);
			}
		}
	}

	const syncLyrics = [];
	for (const line of originalLines) {
		timeRegexExec.lastIndex = 0;
		const matches = [];
		let match;
		while ((match = timeRegexExec.exec(line)) !== null) {
			const min = parseInt(match[1], 10);
			const sec = parseInt(match[2], 10);
			const msPart = match[3] ? match[3].padEnd(3, '0').slice(0, 3) : '000';
			const ms = parseInt(msPart, 10);
			const totalMs = (min * 60 + sec) * 1000 + ms;
			// Extract the raw time string matching this specific match
			const rawTime = match[0];
			matches.push({ time: totalMs, rawTime });
		}

		if (matches.length === 0) continue;

		const originalText = line.replace(/\[\d+:\d+(?:\.\d+)?\]/g, '').trim();
		if (!originalText) continue;

		let translation = '';
		for (const m of matches) {
			if (translationMap.has(m.rawTime)) {
				translation = translationMap.get(m.rawTime);
				break;
			}
		}

		for (const m of matches) {
			syncLyrics.push({ time: m.time, text: originalText });
			if (translation) {
				syncLyrics.push({ time: m.time, text: translation });
			}
		}
	}

	syncLyrics.sort((a, b) => a.time - b.time);
	return syncLyrics;
}

function writeSyltToMp3(filePath, syncLyrics) {
	if (!syncLyrics || syncLyrics.length === 0) return;
	try {
		const data = fs.readFileSync(filePath);
		if (data.slice(0, 3).toString() !== 'ID3') {
			console.log('Not a valid ID3v2 tag, skipping SYLT injection');
			return;
		}

		const tagSize = ((data[6] & 0x7F) << 21) |
		                ((data[7] & 0x7F) << 14) |
		                ((data[8] & 0x7F) << 7) |
		                (data[9] & 0x7F);

		let offset = 10;
		let insertOffset = 10;
		while (offset < 10 + tagSize) {
			if (data[offset] === 0) {
				insertOffset = offset;
				break;
			}
			const frameId = data.slice(offset, offset + 4).toString('ascii');
			if (!/^[A-Z0-9]{4}$/.test(frameId)) {
				insertOffset = offset;
				break;
			}
			const frameSize = data.readUInt32BE(offset + 4);
			offset += 10 + frameSize;
		}
		if (offset >= 10 + tagSize) {
			insertOffset = 10 + tagSize;
		}

		const bodyChunks = [];
		// Encoding: UTF-8 (0x03)
		bodyChunks.push(Buffer.from([0x03]));
		// Language: eng (3 bytes)
		bodyChunks.push(Buffer.from('eng', 'ascii'));
		// Timestamp format: milliseconds (0x02)
		bodyChunks.push(Buffer.from([0x02]));
		// Content type: lyrics (0x01)
		bodyChunks.push(Buffer.from([0x01]));
		// Content descriptor: null-terminated empty string (0x00)
		bodyChunks.push(Buffer.from([0x00]));

		for (const item of syncLyrics) {
			bodyChunks.push(Buffer.from(item.text, 'utf8'));
			bodyChunks.push(Buffer.from([0x00]));
			const timeBuf = Buffer.alloc(4);
			timeBuf.writeUInt32BE(item.time);
			bodyChunks.push(timeBuf);
		}

		const bodyBuf = Buffer.concat(bodyChunks);

		const frameHeader = Buffer.alloc(10);
		frameHeader.write('SYLT', 0, 4, 'ascii');
		frameHeader.writeUInt32BE(bodyBuf.length, 4);

		const newFrameBytes = Buffer.concat([frameHeader, bodyBuf]);

		const newTagSize = tagSize + newFrameBytes.length;
		const headerCopy = Buffer.from(data.slice(0, 10));
		headerCopy[6] = (newTagSize >> 21) & 0x7F;
		headerCopy[7] = (newTagSize >> 14) & 0x7F;
		headerCopy[8] = (newTagSize >> 7) & 0x7F;
		headerCopy[9] = newTagSize & 0x7F;

		const finalBuf = Buffer.concat([
			headerCopy,
			data.slice(10, insertOffset),
			newFrameBytes,
			data.slice(insertOffset)
		]);

		fs.writeFileSync(filePath, finalBuf);
		console.log(`Successfully injected SYLT frame of size ${newFrameBytes.length} bytes`);
	} catch (e) {
		console.error('Failed to write SYLT to MP3:', e);
	}
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

	const settings = getSettings();
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

	let originalLrc = '';
	let translatedLrc = '';

	// Try to fetch lyrics
	if (settings.downloadLyrics !== false) {
		try {
			const lyricRes = await fetchJson(`https://music.163.com/api/song/lyric?id=${songId}&lv=-1&kv=-1&tv=-1`);
			if (lyricRes) {
				originalLrc = lyricRes.lrc && lyricRes.lrc.lyric ? lyricRes.lrc.lyric : '';
				translatedLrc = lyricRes.tlyric && lyricRes.tlyric.lyric ? lyricRes.tlyric.lyric : '';
				
				// Fallback: If original lyric is empty but translated lyric is available, treat translated as main lyric
				if (!originalLrc && translatedLrc) {
					originalLrc = translatedLrc;
					translatedLrc = '';
				}
			}
		} catch (err) {
			log(`Failed to fetch lyrics: ${err.message}`, 'WARN');
		}
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

		// Generate lyric texts based on settings and file extension
		if (originalLrc) {
			if (settings.downloadLrcFile !== false) {
				lyrics = generateLyricText(
					originalLrc,
					translatedLrc,
					settings.lrcFileDynamic !== false,
					settings.lrcFileAddTranslation !== false && settings.addTranslation !== false
				);
			}

			if (settings.downloadEmbedLyrics !== false) {
				const useStaticOnly = (ext === '.mp3' && settings.mp3BothStaticDynamic && settings.embedLyricDynamic !== false);
				cleanLyrics = generateLyricText(
					originalLrc,
					translatedLrc,
					useStaticOnly ? false : (settings.embedLyricDynamic !== false),
					settings.embedLyricAddTranslation !== false && settings.addTranslation !== false
				);
			}
		}
		
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

		if (ext === '.mp3') {
			ffmpegArgs.push('-id3v2_version', '3');
			if (hasCover) {
				ffmpegArgs.push('-metadata:s:v', 'title=Album cover', '-metadata:s:v', 'comment=Cover (front)');
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
				
				// Inject SYLT frame if mp3, mp3BothStaticDynamic is true, and embedLyricDynamic is true
				if (ext === '.mp3' && settings.mp3BothStaticDynamic && settings.embedLyricDynamic !== false && originalLrc) {
					try {
						const syncItems = parseSyltLyrics(
							originalLrc,
							translatedLrc,
							settings.embedLyricAddTranslation !== false && settings.addTranslation !== false
						);
						writeSyltToMp3(finalOutputPath, syncItems);
					} catch (syltErr) {
						log(`Failed to inject SYLT: ${syltErr.message}`, 'WARN');
					}
				}
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
