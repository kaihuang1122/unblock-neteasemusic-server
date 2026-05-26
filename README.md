# UnblockNeteaseMusic (Collector Edition)

這是基於 UnblockNeteaseMusic 核心開發的**音樂收集與下載增強版本**。本專案在解鎖客戶端變灰歌曲的同時，提供了非同步背景下載、封面與歌詞封裝、獨立滾動歌詞檔案生成等完整收集鏈。

---

## 核心新增 Feature (增強功能)

1. **非同步背景下載 (Background Downloader)**
   - 不影響原本客戶端的音樂串流與撥放體驗。
   - 每當客戶端播放歌曲（不論是解鎖替換的歌曲，還是網易雲原生的免費與 VIP 歌曲），皆會無條件觸發背景下載器，非同步擷取最高品質的音訊流。

2. **下載去重邏輯 (Deduplication Check)**
   - 在啟動下載前，會自動讀取並檢查 `/data/download.log` 的歷史紀錄。
   - 若該首歌曲先前已成功處理，將自動跳過 (Skipping)，以防重複下載消耗網路流量。

3. **滾動時間軸歌詞存檔 (`.lrc` 檔案生成)**
   - 音檔成功儲存後，會自動在音檔同目錄下產出同名、帶有 `[mm:ss.xx]` 時間戳記的外掛 `.lrc` 歌詞檔案。
   - 適合支援外掛歌詞的電腦或手機播放器顯示滾動歌詞。

4. **正則歌詞清洗 (Clean Lyrics Filter)**
   - 使用正則表達式 `/\[\d+:\d+(?:\.\d+)?\]/g` 剔除所有時間戳記，生成「純淨版文字歌詞」用於內嵌。

5. **音檔標籤與封面內嵌 (Metadata & Cover Embedding)**
   - 調用本機 `ffmpeg` 將「專輯封面圖片」與清洗後的「純淨版文字歌詞」封裝寫入至 `.m4a` 或 `.mp3` 音檔的 Metadata 中。
   - 設有 Robust Fallback：若環境中 `ffmpeg` 異常，將自動降級複製原始音檔，並仍能產出獨立 `.lrc` 檔案。

6. **安全性憑證動態生成 (Dynamic Certificate Generation)**
   - 專案已移除所有內置的靜態憑證檔案，改為在容器初次啟動時，由內置的 `openssl` 自動生成專屬且隨機的自簽署 Root CA 與 `*.music.163.com` 憑證配對，杜絕預設金鑰洩漏風險。

---

## 啟動方法 (Startup Methods)

本專案強烈建議使用 **Docker** 進行部署。

### 方式 A：使用 Docker Compose (推薦)

1. 確保專案目錄下有 `docker-compose.yml` 檔案。
2. 執行以下命令啟動服務：
   ```bash
   docker-compose up -d --build
   ```
3. 啟動後，專案目錄下會自動建立兩個目錄：
   - `./cert`：存放動態生成的憑證（包含 `ca.crt`、`server.crt`、`server.key` 等）。
   - `./data`：存放下載的音訊檔案、`.lrc` 歌詞以及 `download.log` 日誌檔案。

---

### 方式 B：使用 Docker CLI 命令

1. **構建 Docker 映像檔**：
   ```bash
   docker build -t unblock-neteasemusic-collector .
   ```

2. **運行容器**（必須掛載 `/data` 與 `/app/cert` 目錄）：
   ```bash
   docker run -d \
     --name new-unblock-server \
     -p 8080:8080 \
     -p 8081:8081 \
     -v "C:\您的本機儲存路徑\音樂檔案:/data" \
     -v "C:\您的本機儲存路徑\憑證檔案:/app/cert" \
     unblock-neteasemusic-collector
   ```

---

## 安全性升級與憑證信任指南 (Certificate Trust Guide)

為了讓您的客戶端能夠成功解鎖並通過 HTTPS 代理，您需要在運行代理的設備上信任生成的 Root CA 憑證。

當服務首次啟動後，請至您掛載的憑證目錄（如本機的 `./cert` 資料夾）中找到 **`ca.crt`**（或 `server.crt`），並依您的作業系統進行以下設定：

### Windows 用戶
1. 在本地掛載的 `cert` 目錄中，連按兩下 **`ca.crt`**。
2. 點擊 **「安裝憑證...」** (Install Certificate...)。
3. 選擇 **「本機電腦」** (Local Machine)，然後點擊下一步。
4. 選擇 **「將所有憑證放入以下的存放區」** (Place all certificates in the following store)。
5. 點擊「瀏覽」，選擇 **「受信任的根憑證授權單位」** (Trusted Root Certification Authorities)，然後點擊確定。
6. 點擊下一步，最後點擊完成。

### macOS 用戶
1. 開啟 **「鑰匙圈存取」** (Keychain Access)。
2. 將 **`ca.crt`** 拖放到「系統」或「登入」鑰匙圈中。
3. 連按兩下剛剛導入的憑證，展開 **「信任」** (Trust) 選項。
4. 將 **「使用此憑證時」** (When using this certificate) 設定為 **「永遠信任」** (Always Trust)。

### iOS 用戶
1. 將 **`ca.crt`** 傳送到 iOS 設備（可透過 AirDrop、郵件附件，或在 Safari 下載）。
2. 至「設定」->「已下載描述檔」安裝該憑證描述檔。
3. 至「設定」->「一般」->「關於本機」->「憑證信任設定」。
4. 找到剛剛安裝的 "UnblockNeteaseMusic Root CA"，並**開啟完全信任切換開關**。

### Android 用戶
1. 將 **`ca.crt`** 複製到 Android 設備儲存空間中。
2. 至「設定」->「安全性與隱私」->「更多安全性設定」->「加密與憑證」->「安裝憑證」->「CA 憑證」（路徑依各家 UI 可能有些微差異）。
3. 選擇 `ca.crt` 並確認安裝。

---

## 常見客戶端代理設定

啟動代理伺服器並完成憑證信任後，您可以在客戶端（如 Windows 官方客戶端、Android 官方客戶端等）將 **HTTP 代理** 設定為本機或伺服器的 `IP:8080`，即可完美享受無阻礙聽歌與全自動背景音樂收集。
