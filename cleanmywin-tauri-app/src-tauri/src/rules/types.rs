use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// 风险等级
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum RiskLevel {
    Low,
    Medium,
    High,
}

/// 清理类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum CleanType {
    /// 按 glob 匹配删除文件
    DeleteFiles,
    /// 清空目标目录内容
    EmptyDirectory,
    /// 执行系统命令
    RunCommand,
    /// 清空回收站
    EmptyRecycleBin,
    /// 移入回收站（send2trash）
    SendToTrash,
}

/// 规则分类
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum RuleCategory {
    /// 系统清理
    SystemClean,
    /// 浏览器清理
    BrowserClean,
    /// 高级清理
    AdvancedClean,
    /// 开发工具
    DevClean,
    /// 应用清理
    AppClean,
    /// 用户自定义
    UserCustom,
}

/// 扫描规则定义
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BaseRule {
    pub id: String,
    pub name: String,
    pub category: RuleCategory,
    pub description: String,
    pub paths: Vec<String>,
    pub patterns: Vec<String>,
    pub risk_level: RiskLevel,
    pub default_enabled: bool,
    pub is_interactive: bool,
    pub clean_type: CleanType,
    pub clean_command: Option<String>,
}

/// 扫描结果（每条规则）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanResult {
    pub rule_id: String,
    pub file_count: u64,
    pub total_size: u64,
}

/// 清理结果（每条规则）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CleanResult {
    pub rule_id: String,
    pub files_cleaned: u64,
    pub bytes_freed: u64,
    pub errors: Vec<String>,
}

/// 展开路径中的环境变量占位符

/// 单个扫描文件项（分组流式传给前端）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanFileItem {
    pub rule_id: String,
    pub rule_name: String,
    pub path: String,
    pub size: u64,
}

/// 累计清理统计
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CleanupStats {
    pub total_count: u64,
    pub total_bytes: u64,
}

pub fn expand_path(raw: &str) -> PathBuf {
    let mut s = raw.to_string();

    if let Some(home) = dirs::home_dir() {
        s = s.replace("%USERPROFILE%", &home.to_string_lossy());
    }
    if let Some(local) = dirs::data_local_dir() {
        s = s.replace("%LOCALAPPDATA%", &local.to_string_lossy());
    }
    if let Ok(windir) = std::env::var("windir") {
        s = s.replace("%windir%", &windir);
    }
    if let Ok(drive) = std::env::var("SystemDrive") {
        s = s.replace("%systemdrive%", &drive);
    }

    PathBuf::from(s)
}
