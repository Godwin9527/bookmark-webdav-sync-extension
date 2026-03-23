# 执行计划：将当前项目上传到 GitHub 并补充项目说明

- 日期：2026-03-23
- 主题：github-publish
- 内部执行等级：L
- 关联需求：`docs/requirements/2026-03-23-github-publish.md`

## 1. 分阶段执行

### Phase 1：文档与运行产物准备
- 生成 requirement 文档
- 生成 execution plan
- 生成 skeleton receipt 与 intent contract

### Phase 2：补充 README
- 基于现有代码梳理项目简介
- 写入功能特性、安装使用、配置说明、开发结构、截图占位
- 保持内容与代码行为一致

### Phase 3：连接 GitHub 并上传
- 检查当前 git 远程配置
- 使用 `gh repo create` 创建公开仓库
- 设置 `origin`
- 推送 `master` 到远程并建立 upstream

### Phase 4：校验与清理
- 校验 `git remote -v`
- 校验 `git status`
- 校验 GitHub 仓库信息
- 写入 phase 回执与 cleanup 回执

## 2. 所有权边界
- 文档整理：本地文件修改
- GitHub 仓库创建：通过 `gh` 对用户账号产生外部可见变更
- Git 推送：将当前仓库内容发布到新建远程仓库

## 3. 验证命令
- `gh auth status`
- `git config --get remote.origin.url`
- `git remote -v`
- `git status --short`
- `gh repo view <repo> --json name,url,visibility,defaultBranchRef`

## 4. 回滚规则
- 若 README 编写有误，仅回退本地文档改动
- 若仓库创建成功但推送失败，不做强制覆盖；保留仓库并修复后再推送
- 不使用 destructive git 命令处理异常

## 5. 清理要求
- 仅保留 requirement、plan、runtime receipts、README 这些必要产物
- 不生成多余临时文件
- 输出 cleanup receipt，说明无额外临时文件残留
