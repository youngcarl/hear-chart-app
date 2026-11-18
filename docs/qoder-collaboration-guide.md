# 用 Qoder 协作开发：队友操作说明

适用于「听见图表 / Hear Chart」仓库：[youngcarl/hear-chart-app](https://github.com/youngcarl/hear-chart-app)。

本文以 **Qoder IDE + GitHub + 终端** 为主；其他版本界面可能不同，Git 命令流程相同。每个人在自己的电脑上工作，GitHub 用于同步版本，不是实时共同编辑同一份本地文件。

## 先记住这条流程

**领取任务 → 同步 main → 新建个人任务分支 → 用 Qoder 修改 → 检查差异和测试 → commit → push → PR → 审核合并 → 再同步 main。**

| 动作 | 实际含义 |
| --- | --- |
| 接受 Qoder 修改 / 保存文件 | 改动在本机，还没有形成 Git 提交 |
| Stage / git add | 选择哪些改动进入下一次提交 |
| Commit / git commit | 在本机保存一个可追踪的版本 |
| Push / git push | 将本地提交上传到 GitHub 分支 |
| Pull Request（PR） | 请求把任务分支的修改合并到 main |
| Merge | 合并代码；不会自动更新其他人的本地文件，也不等于部署网站 |

团队约定：**一项任务一个分支，一个 PR 聚焦一件事，main 由维护者审核合并。** 本文是协作约定，不代表仓库已强制启用分支保护。

## 1. 首次准备：每台电脑做一次

### 1.1 获得协作权限

1. 将自己的 GitHub 用户名发给仓库维护者。
2. 维护者在仓库 **Settings → Collaborators → Add people** 邀请你。
3. 接受 GitHub 的邀请，再开始向本仓库推送。

仓库公开意味着可以浏览和克隆，不意味着所有人都有写入权限。每人用自己的 GitHub 账号；Qoder 登录和 GitHub 推送认证是两回事。[GitHub 邀请说明](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/repository-access-and-collaboration/inviting-collaborators-to-a-personal-repository)

### 1.2 安装并检查工具

准备 Git、Node.js **22.12+（22 系列）**、npm 和 Qoder IDE。在终端检查：

```bash
git --version
node --version
npm --version
```

Windows PowerShell 若提示 `npm.ps1` 被执行策略阻止，将本文中的 `npm` 换成 `npm.cmd` 即可，无需修改系统执行策略。GitHub 推送首次需要认证时，使用自己的账号完成浏览器登录；GitHub 账号密码不能当作 HTTPS Git 推送密码输入。

### 1.3 下载项目，在 Qoder 中打开

在你希望存放项目的父目录执行：

```bash
git clone https://github.com/youngcarl/hear-chart-app.git
cd hear-chart-app
```

已有这个克隆目录时，直接打开并同步，跳过重复 clone。Qoder IDE 选择 **File → Open Folder**，打开刚下载的 `hear-chart-app` 文件夹，而不是它的父目录。

按 **Ctrl+Shift+P（Windows/Linux）或 Cmd+Shift+P（macOS）** 打开命令面板，搜索 **Terminal: Create New Terminal** 创建内置终端。后续命令都在项目根目录执行，那里应能看到 `package.json`、`src` 和 `README.md`。[Qoder 快速开始](https://docs.qoder.com/quick-start) · [内置终端](https://docs.qoder.com/user-guide/editor/terminal)

检查打开的是正确仓库：

```bash
git remote -v
git status
```

`origin` 应指向 `https://github.com/youngcarl/hear-chart-app.git`。

### 1.4 配置自己的提交身份

将引号内内容替换成你自己的信息再执行；这里只设置当前仓库，不影响其他项目：

```bash
git config user.name "你的 GitHub 用户名"
git config user.email "你在 GitHub 绑定或提供的 noreply 邮箱"
```

提交身份不是登录凭据。若不想公开真实邮箱，可在 GitHub 的 **Settings → Emails** 复制你自己的 noreply 邮箱，不能照抄其他人的邮箱。

### 1.5 安装依赖并运行

```bash
npm ci
npm run dev
```

打开终端显示的本地网址。开发服务会占用这个终端；需要运行 Git 命令时另开一个终端，或按 **Ctrl+C** 停止服务。

首次运行的验收：能打开页面、切换样例；点击或按键后能尝试播放。浏览器音频需要用户操作，中文语音是否可用取决于系统和浏览器。项目当前不需要模型 API Key。

## 2. 每开始一项任务：先同步，再建分支

先在 Issue 或团队沟通中确认任务和负责人，尽量避免两个人同时大改同一模块。

```bash
git status
```

**继续前应显示 working tree clean。** 若有修改，先在所属任务分支提交保存，或者请维护者协助处理；不要带着未保存的工作随意切分支。

```bash
git switch main
git pull --ff-only origin main
git switch -c fix/xiaoming-data-validation
npm ci
```

这里的 `fix/xiaoming-data-validation` 是示例；请换成你的名字和任务，并在后续命令中使用同一个分支名。建议格式：

- `fix/名字-问题`：修复问题。
- `feat/名字-功能`：新增功能。
- `docs/名字-主题`：文档改进。

`git pull --ff-only` 会在本地和远端历史分叉时停下，不会擅自生成合并提交。若报错，按第 7 节处理。[Git pull 说明](https://git-scm.com/docs/git-pull)

如果上次任务还没结束，直接切回自己的原任务分支继续；不需要再次运行 `git switch -c` 创建同名分支。

## 3. 用 Qoder 改代码

### 3.1 先理解，再修改

在 AI Chat 中先用 **Ask** 理解相关模块，再切 **Agent** 请求修改；可以用 `@` 附上相关文件。发送请求前用 `git branch --show-current` 确认自己不在 main。

可复制给 Qoder，替换方括号内容：

> 当前任务是 [问题或功能]，验收标准是 [具体可观察的结果]。请先阅读 README、已知问题和相关源码，确认当前在我的任务分支。仅修改完成这项任务所需的文件，保留其他人的改动。先说明涉及模块，再实施修改；完成后运行 npm run build，列出真实执行结果及尚未测试的内容。未经我确认，不执行 commit、push、合并或部署，不修改凭据，不引入无关依赖。

本项目的例子：

> 修复粘贴数据的校验：拒绝 Infinity、NaN 和 12abc 等混杂数值，对错误行给出清楚提示；保持现有样例和正常输入可用。先查看现有解析规则，避免误伤合法数据。完成后运行 npm run build，并列出正常、错误和边界输入的测试结果。

接受 Agent 的修改仅表示接纳本地改动，**不是 Git 提交**。涉及终端命令时先看清作用，按当前 Qoder 执行策略确认。

### 3.2 查看差异并测试

Qoder 左侧 **Source Control → Changes** 中点击文件即可查看差异；也可使用终端：

```bash
git status
git diff
npm test
npm run test:e2e
npm run build
```

每次提交前至少检查：

- [ ] 只修改当前任务需要的内容，没有顺带重写无关模块。
- [ ] `npm test`、`npm run test:e2e` 与 `npm run build` 实际通过。
- [ ] 在 `npm run dev` 页面手动验证本次功能及相邻功能。
- [ ] 涉及声音、键盘或无障碍时，实际测试相应行为；未测的写明“未执行”。
- [ ] 没有 API Key、密码、个人资料、`.env`、日志、`node_modules` 或 `dist`。
- [ ] 有意变更依赖时，核对并一并提交 `package.json` 与 `package-lock.json`；日常安装用 `npm ci`，不随意升级依赖。

`npm test` 使用 Vitest 跑纯函数与事件逻辑测试（解析、统计、声音调度、语音取消、快捷键）；`npm run test:e2e` 用 Playwright 驱动本机 Chrome 做表单和导览交互回归（CI 使用 ubuntu-latest 自带的 Chrome）。构建通过只证明类型检查和打包成功，不等于音频、读屏或真实用户验收通过。

## 4. 保存版本并上传任务分支

推荐在 Qoder **Source Control → Changes** 中仅对本任务文件选择 **Stage Changes**，再核对 **Staged Changes**。[Qoder 审阅与提交](https://docs.qoder.com/user-guide/editor/review-and-commit)

或者用终端精确选择文件；以下是“只修改解析文件”的例子：

```bash
git add src/lib/parse.ts
git diff --cached
git diff --cached --check
git commit -m "fix: 严格校验粘贴数据"
git push -u origin fix/xiaoming-data-validation
```

实际改了多个相关文件，就逐个暂存，避免漏掉所需修改。提交后运行 `git status` 检查是否还有遗漏。

如果暂存了不该提交的内容，可以用 `git restore --staged .` 取消暂存后重新选择；它不会丢掉工作区修改。

首次 push 后 GitHub 上才有这个分支。后续在同一分支提交新修改，执行 `git push` 即可。日常流程不需要向 main 直接 push，也不需要强制推送。

## 5. 创建 PR，请维护者审核

推送成功后，打开 [仓库](https://github.com/youngcarl/hear-chart-app)，点击 **Compare & pull request**。

若没有横幅，进入 **Pull requests → New pull request**，选择：

- **base：main**，表示准备合入哪里。
- **compare：你的任务分支**，表示改动来自哪里。

填写说明后创建 PR。[GitHub PR 说明](https://docs.github.com/en/pull-requests/how-tos/create-pull-requests/creating-a-pull-request)

可复制这个模板：

```markdown
## 目的
解决什么问题？关联 Issue（如有）：

## 修改
- 改了哪些模块：
- 哪些内容没有改：

## 验证
- npm run build：通过 / 失败 / 未执行
- 手动操作步骤与结果：
- 键盘、音频或读屏测试：
- 未执行的测试：

## 风险或需要审核的地方
是否改变输入规则、依赖或用户交互？
```

仓库中的 **Build** 工作流在 PR、main 推送和 `feat/**` 分支推送时运行，依次执行 `npm ci`、`npm test`、`npm run build`、`npm run test:e2e`（Playwright + 系统 Chrome）。其他命名的任务分支在创建 PR 后也会触发。在 PR 的检查区域查看结果，失败时打开日志，修复后重新提交。

维护者检查差异、构建结果和必要的功能测试，再合并。这里不会自动完成网站部署；部署需另外安排。

### 审核要求修改时

仍在原任务分支修改、测试、暂存并提交：

```bash
git commit -m "fix: 按审核意见调整输入提示"
git push
```

上面的 commit 以已经暂存修改为前提。新的提交会进入同一个尚未合并的 PR，无需再建重复 PR。合并完成后的新需求则另开分支和 PR。

## 6. 同步其他人的更新

### 情况 A：自己的 PR 已合并，准备做下一项任务

先保存当前工作并确认工作区干净：

```bash
git status
git switch main
git pull --ff-only origin main
npm ci
git switch -c feat/xiaoming-next-task
```

替换新的分支名；已合并的旧任务分支可以暂时保留，不影响继续开发。

### 情况 B：自己的 PR 还没合并，但 main 已有队友的新代码

在自己的任务分支先提交保存当前改动，确保工作区干净，再执行：

```bash
git branch --show-current
git fetch origin
git merge --no-edit origin/main
```

无冲突时继续：

```bash
npm ci
npm run build
git push
```

这会把 main 的更新合入你的任务分支，不会把你的代码直接推到 main。合并后还需要重新进行本次功能的手动验证。

### 出现冲突怎么办

Git 会列出冲突文件，Qoder 也会显示相关标记。不要机械地对所有文件选择“保留我方”或“保留对方”。

1. 用 `git status` 确认哪些文件冲突。
2. 结合双方需求编辑最终内容；不确定时找修改该文件的队友一起确认。
3. 清除冲突标记后逐个暂存已解决文件。
4. 依赖文件有冲突时，先确认需要保留的依赖，再生成一致的锁文件；不以随意删除锁文件作为解决方法。
5. 运行 `npm ci`、`npm run build`，完成手动验证。
6. 用 `git diff --cached` 核对合并结果，再 `git commit -m "merge: 同步 main 并解决冲突"`、`git push`。

仅在上面的 merge 正进行且需要撤销此次合并时，使用 `git merge --abort` 返回合并前状态；这依赖你在合并前已保存工作并保持工作区干净。[Git merge 说明](https://git-scm.com/docs/git-merge)

## 7. 常见问题

| 现象 | 处理方法 |
| --- | --- |
| Permission denied / 403 | 检查邀请是否接受、当前 GitHub 登录是否为受邀账号、origin 是否正确；无需改成维护者账号 |
| not a git repository | 终端不在项目目录；回到克隆的项目根目录 |
| branch already exists | 用 git switch 切回已有分支，或为新任务换一个唯一分支名 |
| main 的 pull --ff-only 报分叉 | 先运行 git status 和 git log --oneline --graph --all -12，保留现有提交，请维护者协助迁移误提交；不要强制覆盖 main |
| push 报 non-fast-forward | 远端任务分支有你本地没有的提交；先 fetch，在本地任务分支合并对应远端任务分支、解决冲突并重测，再 push；与维护者确认同一分支是否被他人更新 |
| 切分支提示本地修改会被覆盖 | 先在所属任务分支提交保存，或请维护者协助保留修改；不要用丢弃修改的命令强行切换 |
| npm ci 因锁文件不一致失败 | 检查是否同步了 package.json 和 package-lock.json，或合并未完成；确认原因后处理依赖，不盲删锁文件 |
| 本地正常但 CI 失败 | 打开该次 Build 日志，检查实际错误、遗漏文件及路径大小写；本地构建通过不能替代远端结果 |
| PR 已合并，但本机没变化 | 在干净工作区切到 main 并 pull，然后 npm ci；GitHub 合并不会自动刷新本机 |
| 修改没在页面生效 | 确认文件已保存、开发服务运行在当前克隆目录、浏览器打开的是终端显示的网址 |

遇到不确定的冲突或分叉，保留当前文件和提交，把错误文字与 `git status` 发给维护者。避免用 `reset --hard`、`clean -fd` 或强制推送“修复”不了解的问题。

## 8. 去哪里领下一项任务

- [项目归纳](project-overview.md)：了解目标用户和当前边界。
- [已知问题](known-limitations.md)：适合优先拆分修复任务。
- [改进路线图](roadmap.md)：选择后续功能。
- [仓库 Issues](https://github.com/youngcarl/hear-chart-app/issues)：记录具体需求、负责人和验收标准。

建议优先修复输入校验、摘要边界和播放控制，再扩展截图识别。做完一项先让队友复核，再开始下一项。

---

**日常口诀：改前同步，分支开发；改后测试，检查差异；提交推送，PR 审核；合并之后，全员同步。**
