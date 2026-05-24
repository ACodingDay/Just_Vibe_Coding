export type RiskLevel = 'Low' | 'Medium' | 'High'
export type CleanType = 'DeleteFiles' | 'EmptyDirectory' | 'RunCommand' | 'EmptyRecycleBin' | 'SendToTrash'
export type RuleCategory = 'SystemClean' | 'BrowserClean' | 'AdvancedClean' | 'DevClean' | 'AppClean' | 'UserCustom'

export interface BaseRule {
  id: string
  name: string
  category: RuleCategory
  description: string
  paths: string[]
  patterns: string[]
  risk_level: RiskLevel
  default_enabled: boolean
  is_interactive: boolean
  clean_type: CleanType
  clean_command: string | null
}

export interface ScanResult {
  rule_id: string
  file_count: number
  total_size: number
}

export interface CleanResult {
  rule_id: string
  files_cleaned: number
  bytes_freed: number
  errors: string[]
}

export type ScanPageState = 'idle' | 'scanning' | 'scanned' | 'cleaning' | 'cleaned'

export const CATEGORY_LABELS: Record<RuleCategory, string> = {
  SystemClean: '系统清理',
  BrowserClean: '浏览器清理',
  AdvancedClean: '高级清理',
  DevClean: '开发工具',
  AppClean: '应用清理',
  UserCustom: '自定义',
}

export const RISK_LABELS: Record<RiskLevel, string> = {
  Low: '低',
  Medium: '中',
  High: '高',
}
