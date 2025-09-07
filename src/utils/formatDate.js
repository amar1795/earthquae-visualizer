export function formatTimestamp(ms) {
  if (!ms) return 'N/A'
  const d = new Date(ms)
  return d.toLocaleString()
}

export default { formatTimestamp }
