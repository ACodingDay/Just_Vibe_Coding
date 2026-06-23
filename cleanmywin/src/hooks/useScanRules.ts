import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { toast } from 'sonner'
import type { BaseRule, ScanResult, CleanResult, ScanPageState } from '@/types/scan'

interface UserRulePrefs {
  enabled_ids: string[]
  custom_rules: BaseRule[]
}

export function useScanRules() {
  const [baseRules, setBaseRules] = useState<BaseRule[]>([])
  const [enabledIds, setEnabledIds] = useState<Set<string>>(new Set())
  const [scanResults, setScanResults] = useState<Map<string, ScanResult>>(new Map())
  const [cleanResults, setCleanResults] = useState<Map<string, CleanResult>>(new Map())
  const [pageState, setPageState] = useState<ScanPageState>('idle')
  const initialized = useRef(false)

  // 合并后的完整规则列表
  // 内部规则页面仅展示 base rules，自定义规则在 CustomPage 展示
  const rules = baseRules

  // 初始化：加载 base_rules.json + 用户偏好
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    Promise.all([
      fetch('/base_rules.json').then((r) => r.json()),
      invoke<UserRulePrefs>('get_user_rule_prefs'),
    ])
      .then(([base, prefs]) => {
        setBaseRules(base)

        if (prefs.enabled_ids.length > 0) {
          // 使用持久化的勾选状态
          setEnabledIds(new Set(prefs.enabled_ids))
        } else {
          // 首次使用，使用默认启用
          const defaults = new Set<string>(
            base.filter((r: BaseRule) => r.default_enabled).map((r: BaseRule) => r.id)
          )
          setEnabledIds(defaults)
        }
      })
      .catch(() => {})
  }, [])

  // 持久化勾选状态
  const persistEnabled = useCallback((ids: Set<string>) => {
    invoke('save_enabled_ids', { ids: Array.from(ids) }).catch(() => {})
  }, [])

  const toggleRule = useCallback(
    (id: string) => {
      const rule = rules.find((r) => r.id === id)
      if (!rule) return

      const doToggle = () => {
        setEnabledIds((prev) => {
          const next = new Set(prev)
          if (next.has(id)) {
            next.delete(id)
          } else {
            next.add(id)
          }
          persistEnabled(next)
          return next
        })
      }

      // 取消勾选 或 非高风险规则 → 直接切换
      if (enabledIds.has(id) || !rule.is_interactive) {
        doToggle()
        return
      }

      // 高风险规则首次勾选 → sonner toast 确认
      toast.warning(`确定启用 "${rule.name}" ？`, {
        description: '此操作属于高风险操作，启用后清理可能造成不可逆影响。',
        action: {
          label: '确定',
          onClick: doToggle,
        },
        cancel: {
          label: '取消',
          onClick: () => {},
        },
        duration: Infinity,
      })
    },
    [rules, enabledIds, persistEnabled]
  )

  const toggleAll = useCallback(
    (checked: boolean) => {
      if (checked) {
        const safeIds = new Set(
          rules.filter((r) => !r.is_interactive).map((r) => r.id)
        )
        setEnabledIds(safeIds)
        persistEnabled(safeIds)
      } else {
        const empty = new Set<string>()
        setEnabledIds(empty)
        persistEnabled(empty)
      }
    },
    [rules, persistEnabled]
  )

  const startScan = useCallback(async () => {
    setPageState('scanning')
    try {
      const ids = Array.from(enabledIds)
      const results = await invoke<ScanResult[]>('scan_rules', {
        baseRules: rules,
        enabledIds: ids,
      })
      const map = new Map<string, ScanResult>()
      for (const r of results) {
        map.set(r.rule_id, r)
      }
      setScanResults(map)
      setCleanResults(new Map())
      setPageState('scanned')
    } catch {
      setPageState('idle')
    }
  }, [enabledIds, rules])

  const startClean = useCallback(async () => {
    const interactiveEnabled = rules.filter(
      (r) => r.is_interactive && enabledIds.has(r.id)
    )

    const doClean = async () => {
      setPageState('cleaning')
      try {
        const ids = Array.from(enabledIds)
        const results = await invoke<CleanResult[]>('clean_rules', {
          baseRules: rules,
          enabledIds: ids,
        })
        const map = new Map<string, CleanResult>()
        for (const r of results) {
          map.set(r.rule_id, r)
        }
        setCleanResults(map)
        setPageState('cleaned')
      } catch {
        setPageState('scanned')
      }
    }

    if (interactiveEnabled.length > 0) {
      const names = interactiveEnabled.map((r) => r.name).join('、')
      toast.warning('确定执行高风险清理？', {
        description: `即将执行：${names}。此操作不可逆。`,
        action: {
          label: '确定清理',
          onClick: doClean,
        },
        cancel: {
          label: '取消',
          onClick: () => {},
        },
        duration: Infinity,
      })
    } else {
      await doClean()
    }
  }, [enabledIds, rules])

  const totalSize = useMemo(() => {
    let sum = 0
    for (const r of scanResults.values()) {
      if (enabledIds.has(r.rule_id)) {
        sum += r.total_size
      }
    }
    return sum
  }, [scanResults, enabledIds])

  return {
    rules,
    enabledIds,
    scanResults,
    cleanResults,
    pageState,
    totalSize,
    toggleRule,
    toggleAll,
    startScan,
    startClean,
  }
}
