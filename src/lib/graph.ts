import {
  NODE_TYPES,
  createEdge,
  createNode,
  type GraphEdge,
  type GraphNode,
  type NodeKind,
} from './types'

export interface PatchGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export function defaultPatch(): PatchGraph {
  const drums = createNode('sound', 80, 80)
  const lead = createNode('sound', 80, 240)
  const lpf = createNode('lpf', 340, 160)
  const room = createNode('room', 600, 160)
  drums.params.mode = 'sample'
  drums.params.pattern = 'bd sd'
  drums.params.synth = ''
  lead.params.mode = 'note'
  lead.params.pattern = '<c3 eb3 g3 bb3>*4'
  lead.params.synth = 'sawtooth'
  lpf.params.cutoff = 1800
  room.params.size = 0.45
  return {
    nodes: [drums, lead, lpf, room],
    // both sounds mix into the same filter → reverb
    edges: [
      createEdge(drums.id, lpf.id),
      createEdge(lead.id, lpf.id),
      createEdge(lpf.id, room.id),
    ],
  }
}

export function addNode(graph: PatchGraph, kind: NodeKind, x: number, y: number): GraphNode {
  const node = createNode(kind, x, y)
  graph.nodes = [...graph.nodes, node]
  return node
}

export function removeNode(graph: PatchGraph, id: string) {
  graph.nodes = graph.nodes.filter((n) => n.id !== id)
  graph.edges = graph.edges.filter((e) => e.from !== id && e.to !== id)
}

function reaches(graph: PatchGraph, from: string, target: string, seen = new Set<string>()): boolean {
  if (from === target) return true
  if (seen.has(from)) return false
  seen.add(from)
  return outgoing(graph, from).some((e) => reaches(graph, e.to, target, seen))
}

export function connect(graph: PatchGraph, from: string, to: string): string | null {
  if (from === to) return 'cannot self-connect'
  const a = graph.nodes.find((n) => n.id === from)
  const b = graph.nodes.find((n) => n.id === to)
  if (!a || !b) return 'missing node'
  if (a.kind === 'sound' && b.kind === 'sound') return 'cannot connect sound to sound'
  if (NODE_TYPES[b.kind].inputs < 1) return 'no input on target'
  if (graph.edges.some((e) => e.from === from && e.to === to)) return 'already connected'
  // connecting to→from would close a cycle once the new edge exists
  if (reaches(graph, to, from)) return 'cannot create a cycle'
  // multiple inbound cables mix (stack) at the target
  graph.edges = [...graph.edges, createEdge(from, to)]
  return null
}

export function incoming(graph: PatchGraph, id: string) {
  return graph.edges.filter((e) => e.to === id)
}

export function outgoing(graph: PatchGraph, id: string) {
  return graph.edges.filter((e) => e.from === id)
}

function escapeMini(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function soundExpr(node: GraphNode): string {
  const pattern = String(node.params.pattern ?? 'bd')
  const mode = String(node.params.mode ?? 'sample')
  const synth = String(node.params.synth ?? '')
  if (mode === 'note') {
    let code = `note("${escapeMini(pattern)}")`
    if (synth) code += `.s("${escapeMini(synth)}")`
    else code += `.s("sawtooth")`
    return code
  }
  return `s("${escapeMini(pattern)}")`
}

function applyEffect(kind: NodeKind, params: Record<string, string | number>, code: string): string {
  switch (kind) {
    case 'gain':
      return `${code}.gain(${Number(params.amount)})`
    case 'lpf':
      return `${code}.lpf(${Number(params.cutoff)})`
    case 'delay':
      return `${code}.delay(${Number(params.time)}).delayfeedback(${Number(params.feedback)})`
    case 'room':
      return `${code}.room(${Number(params.size)})`
    case 'crush':
      return `${code}.crush(${Number(params.bits)})`
    case 'pan':
      return `${code}.pan(${Number(params.pos)})`
    default:
      return code
  }
}

function mix(parts: string[]): string {
  const unique = [...new Set(parts.filter(Boolean))]
  if (!unique.length) return ''
  return unique.length === 1 ? unique[0] : `stack(${unique.join(', ')})`
}

/** Compile the patch: sounds layer; multiple cables into a module mix via stack. */
export function compileGraph(graph: PatchGraph): { code: string; chains: string[] } {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]))
  const memo = new Map<string, string | null>()

  function signalAt(id: string, stack = new Set<string>()): string | null {
    if (memo.has(id)) return memo.get(id)!
    if (stack.has(id)) return null
    stack.add(id)

    const node = byId.get(id)
    if (!node) {
      memo.set(id, null)
      return null
    }

    let expr: string | null = null

    if (node.kind === 'sound') {
      expr = node.on ? soundExpr(node) : null
    } else {
      const sources = incoming(graph, id)
        .map((e) => signalAt(e.from, stack))
        .filter((s): s is string => Boolean(s))
      const mixed = mix(sources)
      if (!mixed) expr = null
      else if (node.on) expr = applyEffect(node.kind, node.params, mixed)
      else expr = mixed
    }

    stack.delete(id)
    memo.set(id, expr)
    return expr
  }

  // terminals: nodes with signal and no outbound cable (each branch still contributes)
  const chains: string[] = []
  for (const n of graph.nodes) {
    if (outgoing(graph, n.id).length) continue
    const sig = signalAt(n.id)
    if (sig) chains.push(sig)
  }

  return { code: mix(chains), chains }
}
