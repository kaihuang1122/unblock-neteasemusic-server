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

---

## 啟動方法 (Startup Methods)

本專案強烈建議使用 **Docker** 進行部署。

### 1. 構建 Docker 映像檔

在專案根目錄下，執行以下指令以構建包含 `ffmpeg` 與 `yt-dlp` 的 Docker 映像檔：

```bash
docker build -t unblock-neteasemusic-collector .
```

### 2. 運行容器 (推薦方式)

為確保下載的音樂、歌詞與日誌能夠持久化儲存到您的本機，啟動時**必須掛載 `/data` 目錄**，並對應雙連接埠 `8080:8081`（以保證 HTTPS 握手與解鎖正常運作）：

```bash
docker run -d \
  --name new-unblock-server \
  -p 8080:8080 \
  -p 8081:8081 \
  -v "C:\您的本機儲存路徑\音樂檔案:/data" \
  unblock-neteasemusic-collector
```

* **掛載路徑**：您本機掛載的目錄中將會產出：
  - `<歌手> - <歌名>.m4a` / `.mp3` (內嵌封面與純歌詞的音檔)
  - `<歌手> - <歌名>.lrc` (滾動時間軸歌詞)
  - `download.log` (下載器執行日誌)

### 3. 常見客戶端代理設定

啟動代理伺服器後，您可以在客戶端（如 Windows 官方客戶端、Android 官方客戶端等）將 **HTTP 代理** 設定為本機或伺服器的 `IP:8080`，即可完美享受無阻礙聽歌與全自動背景音樂收集。
