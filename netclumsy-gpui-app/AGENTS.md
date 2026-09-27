# Memory

## Project Overview
See @README.md for project overview and @package.json for available npm/pnpm commands for this project.

## Code Style Guidelines
- Use descriptive variable names
- Follow existing patterns in the codebase
- Extract complex conditions into meaningful boolean variables

## Architecture Notes
Add important architectural decisions and patterns here.

- **UI 框架**：gpui-kit 0.6（crates.io，伞形入口：`gpui_kit::*` 即 GPUI，组件在 `gpui_kit::component`）。GPUI 本体来自配套发布的 `gpui-pre-*` 系列，不要直接依赖 zed 主仓。
- **过滤器配置模型**：`config.txt` 是过滤表达式的唯一事实来源（与上游 clumsy 一致）。预设启动时读入，界面输入框恒只读（`readonly(true)` 只挡键入，预设回填走程序化 `set_value`）。**路线图**：下一版本新增配置编辑页（Tab 页内编辑并保存 config.txt），届时放开只读限制。
- **错误反馈层级**：引擎错误为类型化 `EngineError`（engine/mod.rs）；UI 用常驻错误通知（`autohide(false)` + `id::<EngineError>()` 去重），成功启动自动清除；设备打开失败的通知点击可提权重启（`elevate::elevate_self`）。状态栏不承载错误文案。
- **单实例互斥**：`main.rs` 在命令行解析之后、提权检查之前调 `single_instance::try_acquire()`——命名互斥体 `Global\NETCLUMSY_IS_RUNNING_MUTEX` 判重（对应原版 checkIsRunning；改用互斥体是单实例惯用原语，语义等价）。放在提权前是为了避免已有实例时还弹一次 UAC。WinDivert 每包只投一个句柄，双实例会劈裂流量，因此内核对象创建失败也按 fail-closed 拒绝启动；句柄持有到进程退出由系统回收。

## Common Workflows
Document frequently used workflows and commands here.
