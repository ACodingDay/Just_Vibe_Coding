export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const val = bytes / Math.pow(1024, i)
  return `${val.toFixed(val < 10 ? 1 : 0)} ${units[i]}`
}

/** 拆分字节数为数值和单位，方便分别渲染和动画 */
export function formatBytesParts(bytes: number): { value: number; unit: string } {
  if (bytes === 0) return { value: 0, unit: 'B' }
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const val = bytes / Math.pow(1024, i)
  return { value: parseFloat(val.toFixed(1)), unit: units[i] }
}
