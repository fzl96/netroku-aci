export interface NodeStatusFields {
  role?: string | null
  fabricSt?: string | null
  state?: string | null
}

function normalized(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}

export function isNodeOnline(node: NodeStatusFields): boolean {
  const fabricSt = normalized(node.fabricSt)
  if (fabricSt === 'active') return true

  return normalized(node.role) === 'controller' && normalized(node.state) === 'in-service'
}
