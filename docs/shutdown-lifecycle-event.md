# shutdown コマンド実行時にライフサイクル切断イベントを確実に発火させる方法

## 背景

AWS IoT Core のライフサイクルイベント（`$aws/events/presence/disconnected/{clientId}`）は、デバイスが IoT Core への MQTT 接続を **正常に切断（DISCONNECT パケット送信）** したときに自動発火する。

Greengrass v2 は `greengrass.service` が停止する際に MQTT DISCONNECT を IoT Core へ送るため、**`sudo systemctl stop greengrass` では切断イベントは自動的に発火する**。

しかし、以下のケースでは発火しない・遅延する：

| ケース | 動作 |
|--------|------|
| `sudo systemctl stop greengrass` | ✅ 即時発火 |
| `sudo shutdown` / `sudo poweroff` | ⚠️ systemd の停止順序次第（後述） |
| 電源断・強制終了 (`kill -9`) | ❌ keepalive タイムアウト後に発火（最大 20 分） |

---

## 方法: `greengrass-shutdown.service` を作成

```ini
# /etc/systemd/system/greengrass-shutdown.service
[Unit]
Description=Greengrass shutdown notifier
# ↓ 起動は greengrass の後 → 停止は greengrass の前（逆順）
After=greengrass.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/bin/true
ExecStop=/usr/local/bin/greengrass-shutdown.sh

[Install]
# greengrass.service が起動するときにこのサービスも起動する
WantedBy=greengrass.service
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable greengrass-shutdown.service
# 次回 greengrass 起動時から自動的に start される（WantedBy=greengrass.service のため）
# 今すぐ有効にしたい場合のみ以下を実行:
# sudo systemctl start greengrass-shutdown.service
```

---
