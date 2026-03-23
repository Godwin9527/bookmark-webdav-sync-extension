# Bookmark WebDAV Sync

一个基于 Chrome Extension Manifest V3 的书签同步扩展，用 WebDAV 作为远端存储，支持本地书签备份、双向同步、强制推送与强制拉取。

## 功能特性

- 使用 WebDAV 存储书签快照，无需自建专用同步服务
- 支持单向备份：本地书签覆盖上传到云端
- 支持双向同步：基于基线快照执行三路合并
- 支持首次无基线时的联合合并，尽量避免数据丢失
- 支持强制推送与强制拉取
- 支持定时备份、定时同步
- 支持崩溃恢复：在本地重写书签前保存待恢复数据
- popup 面板可直接测试 WebDAV 连接并查看最近操作时间

## 项目结构

```text
.
├─ manifest.json              # 扩展清单
├─ background.js              # Service Worker 入口与消息分发
├─ lib/
│  ├─ webdav-client.js        # WebDAV 请求封装
│  ├─ bookmark-manager.js     # Chrome 书签读写封装
│  ├─ storage-helper.js       # chrome.storage.local 封装
│  ├─ merge-utils.js          # 三路合并与无基线合并
│  └─ sync-engine.js          # 同步引擎核心
├─ popup/
│  ├─ popup.html              # 扩展弹窗界面
│  ├─ popup.css               # 弹窗样式
│  └─ popup.js                # 弹窗交互逻辑
└─ icons/                     # 扩展图标
```

## 工作方式

### 1. 单向备份
读取本地 Chrome 书签树，序列化后写入 WebDAV 目录下的 `bookmarks.json`。

### 2. 双向同步
- 读取本地书签树
- 读取云端 `bookmarks.json`
- 读取本地保存的 base snapshot
- 有基线时执行三路合并
- 无基线时执行联合合并
- 合并完成后同时更新本地、云端与新的基线快照

### 3. 强制操作
- `Push`：本地覆盖云端
- `Pull`：云端覆盖本地

## 安装使用

### 1. 下载项目
可直接克隆仓库到本地：

```bash
git clone <your-repo-url>
```

### 2. 加载扩展
1. 打开 Chrome 浏览器
2. 进入 `chrome://extensions/`
3. 开启右上角“开发者模式”
4. 点击“加载已解压的扩展程序”
5. 选择当前项目根目录

### 3. 配置 WebDAV
在扩展弹窗中填写：

- `WebDAV 地址`
- `用户名`
- `密码`
- `存储路径`，默认是 `/bookmark-sync/`

保存前可先点击“测试连接”。

### 4. 开始同步
可根据需求使用以下方式：

- 开启“单向备份”并设置备份间隔
- 开启“双向同步”并设置同步间隔
- 手动点击“立即备份”或“立即同步”
- 在确认后执行“推送到云端”或“从云端拉取”

## 书签数据格式

云端默认保存为 JSON 文件：

```json
{
  "version": 1,
  "timestamp": 1710000000000,
  "roots": {
    "bar": { "children": [] },
    "other": { "children": [] }
  }
}
```

## 开发说明

### 技术栈
- 原生 JavaScript
- Chrome Extensions Manifest V3
- Chrome Bookmarks API
- Chrome Storage API
- Chrome Alarms API
- WebDAV

### 本地开发
这是一个纯前端浏览器扩展项目，不依赖 npm 构建流程。修改代码后，通常只需要在扩展管理页重新加载扩展即可。

### 核心实现说明
- `background.js` 负责定时任务、消息路由、启动恢复
- `lib/sync-engine.js` 负责备份、同步、拉取、推送主流程
- `lib/merge-utils.js` 负责三路合并与无基线并集合并
- `lib/bookmark-manager.js` 负责书签树读取与重建
- `lib/storage-helper.js` 负责设置、基线、状态与锁管理

## 注意事项

- 当前密码仅保存在 `chrome.storage.local` 中，并做了轻量混淆，不属于强安全加密
- `Pull` 会清除本地现有书签并以云端数据重建，操作前请确认
- `Push` 会覆盖云端现有数据，适合明确以本地为准的场景
- 扩展默认通过 `http://*/*` 和 `https://*/*` 访问 WebDAV 服务，请确保服务地址可信

## 截图

> 暂未补充截图，可在后续添加 popup 界面截图、连接设置截图、同步状态截图。

## 后续可扩展方向

- 增加更安全的凭证保护方案
- 为同步冲突提供更细粒度的可视化提示
- 增加导入/导出书签快照功能
- 支持更多同步状态诊断信息

## License

当前仓库未单独声明 License。如需开源分发，建议补充明确的许可证文件。
