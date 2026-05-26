const http = require('http');
const fs = require('fs');
const path = require('path');
const { getSettings, saveSettings } = require('./settings');

const dataDir = fs.existsSync('/data') ? '/data' : path.join(__dirname, '..', 'data');
const logFile = path.join(dataDir, 'download.log');

// Get last 30 lines of download.log
function getLogs() {
	try {
		if (fs.existsSync(logFile)) {
			const content = fs.readFileSync(logFile, 'utf8');
			const lines = content.trim().split('\n');
			return lines.slice(-30).reverse(); // latest logs at top
		}
	} catch (e) {
		console.error('Failed to read logs:', e.message);
	}
	return [];
}

const htmlPage = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>UnblockNeteaseMusic - 控制台</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-gradient: linear-gradient(135deg, #0d0d1e 0%, #06060c 100%);
            --card-bg: rgba(22, 22, 40, 0.6);
            --card-border: rgba(255, 255, 255, 0.08);
            --accent-cyan: #00f2fe;
            --accent-purple: #9b51e0;
            --accent-blue: #0070f3;
            --text-primary: #f5f5f7;
            --text-secondary: #8e8e93;
            --success-color: #34c759;
            --glow-cyan: rgba(0, 242, 254, 0.25);
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: 'Outfit', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background: var(--bg-gradient);
            color: var(--text-primary);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
            overflow-x: hidden;
        }

        .dashboard-container {
            width: 100%;
            max-width: 950px;
            display: grid;
            grid-template-columns: 1fr;
            gap: 24px;
            animation: fadeIn 0.8s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @media (min-width: 768px) {
            .dashboard-container {
                grid-template-columns: 1.2fr 1.8fr;
            }
            .header-row {
                grid-column: span 2;
            }
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .header-row {
            text-align: center;
            margin-bottom: 10px;
        }

        .logo-title {
            font-size: 2.5rem;
            font-weight: 700;
            letter-spacing: -0.5px;
            background: linear-gradient(120deg, var(--accent-cyan), var(--accent-purple));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            text-shadow: 0 4px 30px rgba(0, 242, 254, 0.2);
            margin-bottom: 8px;
        }

        .logo-subtitle {
            color: var(--text-secondary);
            font-size: 1rem;
            font-weight: 300;
            letter-spacing: 0.5px;
        }

        /* Glassmorphism Card Style */
        .card {
            background: var(--card-bg);
            border: 1px solid var(--card-border);
            border-radius: 24px;
            padding: 32px;
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
            transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
        }

        .card:hover {
            border-color: rgba(255, 255, 255, 0.12);
            transform: translateY(-2px);
            box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
        }

        .card-title {
            font-size: 1.35rem;
            font-weight: 600;
            margin-bottom: 24px;
            display: flex;
            align-items: center;
            gap: 12px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.06);
            padding-bottom: 14px;
        }

        .card-title::before {
            content: '';
            display: inline-block;
            width: 4px;
            height: 18px;
            background: linear-gradient(to bottom, var(--accent-cyan), var(--accent-blue));
            border-radius: 2px;
        }

        /* Control Toggles */
        .control-group {
            display: flex;
            flex-direction: column;
            gap: 18px;
        }

        .control-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 18px;
            background: rgba(255, 255, 255, 0.02);
            border-radius: 16px;
            border: 1px solid rgba(255, 255, 255, 0.02);
            transition: all 0.25s cubic-bezier(0.25, 0.8, 0.25, 1);
        }

        .control-item:hover {
            background: rgba(255, 255, 255, 0.04);
            border-color: rgba(255, 255, 255, 0.06);
            transform: scale(1.01);
        }

        .control-info {
            display: flex;
            flex-direction: column;
            gap: 6px;
            max-width: 75%;
        }

        .control-label {
            font-weight: 600;
            font-size: 1.05rem;
            color: var(--text-primary);
        }

        .control-desc {
            font-size: 0.85rem;
            color: var(--text-secondary);
            font-weight: 300;
            line-height: 1.4;
        }

        /* iOS Switch Toggle */
        .switch {
            position: relative;
            display: inline-block;
            width: 52px;
            height: 28px;
            flex-shrink: 0;
        }

        .switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }

        .slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: #2c2c2e;
            transition: .35s cubic-bezier(0.25, 0.8, 0.25, 1);
            border-radius: 34px;
        }

        .slider:before {
            position: absolute;
            content: "";
            height: 22px;
            width: 22px;
            left: 3px;
            bottom: 3px;
            background-color: #ffffff;
            transition: .35s cubic-bezier(0.25, 0.8, 0.25, 1);
            border-radius: 50%;
            box-shadow: 0 3px 7px rgba(0,0,0,0.3);
        }

        input:checked + .slider {
            background: linear-gradient(135deg, var(--accent-cyan), var(--accent-blue));
            box-shadow: 0 0 12px var(--glow-cyan);
        }

        input:checked + .slider:before {
            transform: translateX(24px);
        }

        /* Log console */
        .log-console {
            background: rgba(12, 12, 22, 0.95);
            border: 1px solid rgba(255, 255, 255, 0.05);
            border-radius: 16px;
            padding: 22px;
            height: 420px;
            overflow-y: auto;
            font-family: 'Courier New', Courier, monospace;
            font-size: 0.85rem;
            line-height: 1.6;
            color: #c9d1d9;
            box-shadow: inset 0 4px 20px rgba(0, 0, 0, 0.6);
        }

        .log-line {
            margin-bottom: 10px;
            word-break: break-all;
            white-space: pre-wrap;
            border-left: 3px solid transparent;
            padding-left: 10px;
            transition: all 0.15s ease;
        }

        .log-line:hover {
            background: rgba(255, 255, 255, 0.03);
        }

        .log-line.info { border-color: var(--accent-cyan); color: #c9d1d9; }
        .log-line.warn { border-color: #f0883e; color: #f0883e; }
        .log-line.error { border-color: #ff7b72; color: #ff7b72; }

        .empty-logs {
            color: var(--text-secondary);
            text-align: center;
            padding-top: 170px;
            font-weight: 300;
        }

        /* Toast notifications */
        .toast {
            position: fixed;
            bottom: 30px;
            left: 50%;
            transform: translateX(-50%) translateY(100px);
            background: rgba(20, 120, 240, 0.9);
            color: white;
            padding: 14px 32px;
            border-radius: 30px;
            font-size: 0.95rem;
            font-weight: 500;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4), 0 0 20px rgba(20, 120, 240, 0.3);
            transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            opacity: 0;
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            z-index: 1000;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .toast.show {
            transform: translateX(-50%) translateY(0);
            opacity: 1;
        }

        /* Scrollbar styling */
        ::-webkit-scrollbar {
            width: 6px;
            height: 6px;
        }
        ::-webkit-scrollbar-track {
            background: rgba(255, 255, 255, 0.01);
        }
        ::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.1);
            border-radius: 3px;
        }
        ::-webkit-scrollbar-thumb:hover {
            background: rgba(255, 255, 255, 0.2);
        }
    </style>
</head>
<body>
    <div class="dashboard-container">
        <div class="header-row">
            <h1 class="logo-title">UnblockNeteaseMusic</h1>
            <p class="logo-subtitle">背景音樂收集器管理面板 (Collector Edition)</p>
        </div>

        <!-- Settings Card -->
        <div class="card">
            <h2 class="card-title">功能設定</h2>
            <div class="control-group">
                <div class="control-item">
                    <div class="control-info">
                        <span class="control-label">音樂背景下載</span>
                        <span class="control-desc">自動非同步下載客戶端播放的歌曲</span>
                    </div>
                    <label class="switch">
                        <input type="checkbox" id="downloadEnabled" checked>
                        <span class="slider"></span>
                    </label>
                </div>

                <div class="control-item">
                    <div class="control-info">
                        <span class="control-label">依歌手建立資料夾</span>
                        <span class="control-desc">在下載目錄下，以歌手姓名分門別類</span>
                    </div>
                    <label class="switch">
                        <input type="checkbox" id="byArtist">
                        <span class="slider"></span>
                    </label>
                </div>

                <div class="control-item">
                    <div class="control-info">
                        <span class="control-label">依專輯建立資料夾</span>
                        <span class="control-desc">在下載目錄下，以專輯名稱分門別類</span>
                    </div>
                    <label class="switch">
                        <input type="checkbox" id="byAlbum">
                        <span class="slider"></span>
                    </label>
                </div>
            </div>
        </div>

        <!-- Logs Card -->
        <div class="card">
            <h2 class="card-title">下載執行日誌</h2>
            <div class="log-console" id="logConsole">
                <div class="empty-logs">載入日誌中...</div>
            </div>
        </div>
    </div>

    <div class="toast" id="toast">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
        <span id="toastMsg">設定儲存成功</span>
    </div>

    <script>
        const elements = {
            downloadEnabled: document.getElementById('downloadEnabled'),
            byArtist: document.getElementById('byArtist'),
            byAlbum: document.getElementById('byAlbum'),
            logConsole: document.getElementById('logConsole'),
            toast: document.getElementById('toast'),
            toastMsg: document.getElementById('toastMsg')
        };

        // Fetch settings
        async function fetchSettings() {
            try {
                const res = await fetch('/api/settings');
                if (res.ok) {
                    const data = await res.json();
                    elements.downloadEnabled.checked = data.downloadEnabled;
                    elements.byArtist.checked = data.byArtist;
                    elements.byAlbum.checked = data.byAlbum;
                }
            } catch (err) {
                showToast('讀取設定失敗', true);
            }
        }

        // Save settings
        async function saveSettings() {
            const data = {
                downloadEnabled: elements.downloadEnabled.checked,
                byArtist: elements.byArtist.checked,
                byAlbum: elements.byAlbum.checked
            };
            try {
                const res = await fetch('/api/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                if (res.ok) {
                    showToast('設定已更新且已自動套用');
                } else {
                    showToast('更新設定失敗', true);
                }
            } catch (err) {
                showToast('更新設定失敗', true);
            }
        }

        // Fetch logs
        async function fetchLogs() {
            try {
                const res = await fetch('/api/logs');
                if (res.ok) {
                    const logs = await res.json();
                    if (!logs || logs.length === 0) {
                        elements.logConsole.innerHTML = '<div class="empty-logs">尚無下載紀錄</div>';
                        return;
                    }
                    
                    let html = '';
                    logs.forEach(line => {
                        let logClass = 'info';
                        if (line.includes('[WARN]')) logClass = 'warn';
                        else if (line.includes('[ERROR]')) logClass = 'error';
                        
                        html += \`<div class="log-line \${logClass}">\${escapeHtml(line)}</div>\`;
                    });
                    
                    elements.logConsole.innerHTML = html;
                }
            } catch (err) {
                // Ignore background polling errors silently
            }
        }

        function escapeHtml(text) {
            return text
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        }

        let toastTimeout;
        function showToast(msg, isError = false) {
            elements.toastMsg.innerText = msg;
            elements.toast.style.background = isError ? 'rgba(248, 81, 73, 0.95)' : 'rgba(20, 120, 240, 0.95)';
            elements.toast.style.boxShadow = isError ? '0 10px 25px rgba(0, 0, 0, 0.3), 0 0 15px rgba(248, 81, 73, 0.4)' : '0 10px 25px rgba(0, 0, 0, 0.3), 0 0 15px rgba(20, 120, 240, 0.4)';
            elements.toast.classList.add('show');
            clearTimeout(toastTimeout);
            toastTimeout = setTimeout(() => {
                elements.toast.classList.remove('show');
            }, 3000);
        }

        // Attach event listeners
        elements.downloadEnabled.addEventListener('change', saveSettings);
        elements.byArtist.addEventListener('change', saveSettings);
        elements.byAlbum.addEventListener('change', saveSettings);

        // Initial calls
        fetchSettings().then(() => {
            fetchLogs();
            setInterval(fetchLogs, 3000);
        });
    </script>
</body>
</html>`;

function startDashboard(port = 8888) {
	const server = http.createServer((req, res) => {
		const url = req.url;
		const method = req.method;

		if (url === '/' && method === 'GET') {
			res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
			res.end(htmlPage);
		} else if (url === '/api/settings' && method === 'GET') {
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify(getSettings()));
		} else if (url === '/api/settings' && method === 'POST') {
			let body = '';
			req.on('data', chunk => { body += chunk; });
			req.on('end', () => {
				try {
					const newSettings = JSON.parse(body);
					saveSettings(newSettings);
					res.writeHead(200, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ success: true, settings: getSettings() }));
				} catch (e) {
					res.writeHead(400, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ success: false, error: 'Invalid JSON' }));
				}
			});
		} else if (url === '/api/logs' && method === 'GET') {
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify(getLogs()));
		} else {
			res.writeHead(404, { 'Content-Type': 'text/plain' });
			res.end('Not Found');
		}
	});

	server.listen(port, '0.0.0.0', () => {
		console.log(`[Dashboard] Server running @ http://0.0.0.0:${port}`);
	});

	return server;
}

module.exports = {
	startDashboard
};
