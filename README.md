# 台股 AI 監控台 v0.5.0 Web

手機優先的靜態網站與 PWA。

正式網址：https://under855.github.io/twstock-ai-monitor/

## 本機預覽

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

從 http://127.0.0.1:8000 開啟；正式 PWA 使用 HTTPS。

## GitHub Pages

使用 main 分支的根目錄（/）發布，`.nojekyll` 停用 Jekyll。更新檔案並推送至 main 後，GitHub Pages 自動部署。

`manifest.webmanifest`、`sw.js` 及圖示使用相對路徑，支援專案子路徑。
行情及新聞依賴外部公開來源；其可用性與跨來源限制獨立於網站部署。
