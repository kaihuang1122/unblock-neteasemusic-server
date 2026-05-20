# 將 `UnblockNeteaseMusic` 從單純的「代理」轉變為「無感背景音樂收集器」。

## 階段一：修改 Dockerfile (建置層)

目標：滿足「加入 Node.js、最新版 yt-dlp」，並將「轉檔必須的 ffmpeg」一併打包，最後將預設參數寫死。

打開專案根目錄的 `Dockerfile`，進行以下修改：

1. **安裝依賴套件：** 在 Alpine 的 `apk add` 指令中，補上 `nodejs`, `python3`, `ffmpeg` (用於合併 metadata) 與 `wget`。
2. **植入最新版 yt-dlp：** 在 `RUN` 指令中加入我們之前測試成功的下載指令。
3. **修改啟動指令 (CMD)：** 將預設參數寫入，讓它開機就用指定的設定跑。

**Dockerfile 修改重點範例：**

```dockerfile
# ... (保留原有的基礎設定) ...

# 1. 安裝系統依賴
RUN apk update && apk add --no-cache \
    nodejs \
    python3 \
    ffmpeg \
    wget \
    ca-certificates

# 2. 下載最新版 yt-dlp 並給予權限
RUN wget https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -O /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# ... (保留原本的 npm install 等步驟) ...

# 3. 暴露 8080 埠號 (Docker run 時對應的內部埠號)
EXPOSE 8080

# 4. 寫死預設參數 (使用 ytdlp 與 bilibili)
CMD ["node", "app.js", "-p", "8080", "-o", "ytdlp", "bilibili"]

```

---

## 階段二：修改源碼 (預設值層)

為了確保不管使用者怎麼啟動，程式的預設邏輯都是您要的：

1. 找到處理命令列參數的檔案（通常是 `src/config.js` 或 `app.js` 的頂部）。
2. 將 `source`（來源）陣列的預設值強行修改為 `['ytdlp', 'bilibili']`。
*(即使 Dockerfile 寫了 CMD，在程式碼層級也寫死可以雙重保險)*。

---

## 階段三：實作 Background Downloader (核心任務)

這是計畫中最重要的一環。為了不阻塞原本的音樂串流，我們將採用「主程式觸發，新腳本接手」的低耦合設計。

### 1. 建立獨立的背景腳本 (`src/downloader.js`)

在源碼目錄新建一個腳本，專門處理下載與合併。它需要接收三個參數：`songId` (網易雲歌曲 ID)、`songName` (歌名)、`audioUrl` (最終播放的音源網址，無論是網易雲原生還是 yt-dlp 找到的)。

這個腳本的執行流程：

* **Step A: 獲取 Metadata**
* 向網易雲 API (`[https://music.163.com/api/v3/song/detail](https://music.163.com/api/v3/song/detail)`) 發送請求獲取歌手、專輯名、封面圖片 URL。
* 向網易雲 API (`[https://music.163.com/api/song/lyric](https://music.163.com/api/song/lyric)`) 獲取歌詞。
* **關鍵：** 請求 Header 必須帶入 `X-Real-IP: 118.8.8.8` (或任何中國大陸 IP) 以防止被阻擋。


* **Step B: 下載素材**
* 將封面圖片下載為 `/tmp/${songId}.jpg`。
* 將 `audioUrl` 下載為 `/tmp/${songId}_raw.m4a` (或根據 header 判斷副檔名)。


* **Step C: ffmpeg 合併與存檔**
* 使用 `child_process.spawn` 呼叫本機的 `ffmpeg`。
* 利用 ffmpeg 的 `-c copy` 參數，將封面、標籤寫入音檔，**不重新編碼以維持原格式與極致速度**。
* 將成品輸出到掛載的目錄（例如 `/data/${歌手}-${歌名}.m4a`）。
* 清除 `/tmp` 裡的暫存檔。



### 2. 在主程式埋設「攔截器 / 觸發點」

您要求「不管網易雲是否成功都要」，代表我們必須在「最終決定回傳播放網址」的地方埋 Hook。

打開 `src/app.js`（或 `src/request.js`，尋找處理 `/song/url` API 回應的地方）：

* 找到程式決定 `url = matchedUrl`（替換成功）或是 `url = originalUrl`（原生可播放）的邏輯斷點。
* 在那裡加入非同步的 Fork 呼叫：

```javascript
const { fork } = require('child_process');

// 當伺服器決定好音源 URL 後...
// 假設您已有變數: songId, songName, finalAudioUrl

// 啟動背景子行程 (不使用 await，讓它自己跑，不阻塞主流程)
fork('./src/downloader.js', [songId, songName, finalAudioUrl]);

```

---

## 階段四：部署與執行建議

當您修改完源碼並重新 `docker build -t my-unblock-server .` 後，啟動時請務必**掛載一個 Volume** 來保存下載的歌曲。

```bash
docker run -d \
  --name unblock-server \
  -p 8080:8080 \
  -v "C:\您的本機路徑\儲存的音樂:/data" \
  my-unblock-server

```

*(您的 `downloader.js` 最後輸出的路徑必須寫死或指向 `/data/`，這樣歌曲才會出現在您的 Windows 資料夾裡。)*