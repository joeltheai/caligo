import {
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
  const sound = createNode('sound', 80, 140)
  const lpf = createNode('lpf', 340, 140)
  const room = createNode('room', 600, 140)
  sound.params.mode = 'note'
  sound.params.pattern = '<c3 eb3 g3 bb3>*4'
  sound.params.synth = 'sawtooth'
  lpf.params.cutoff = 1800
  room.params.size = 0.45
  return {
    nodes: [sound, lpf, room],
    edges: [createEdge(sound.id, lpf.id), createEdge(lpf.id, room.id)],
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

export function connect(graph: PatchGraph, from: string, to: string): string | null {
  if (from === to) return 'cannot self-connect'
  const a = graph.nodes.find((n) => n.id === from)
  const b = graph.nodes.find((n) => n.id === to)
  if (!a || !b) return 'missing node'
  if (a.kind === 'sound' && b.kind === 'sound') return 'cannot connect sound to sound'
  // single-input modules: replace existing inbound edge
  graph.edges = graph.edges.filter((e) => e.to !== to)
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

/** Walk each enabled sound forward through effects (disabled nodes bypass). */
export function compileGraph(graph: PatchGraph): { code: string; chains: string[] } {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]))
  const chains: string[] = []

  function forward(id: string, code: string, seen = new Set<string>()): string {
    if (seen.has(id)) return code
    seen.add(id)
    const outs = outgoing(graph, id)
    if (!outs.length) return code
    // follow first cable for now (simple serial chains)
    const next = byId.get(outs[0].to)
    if (!next) return code
    const nextCode = next.on && next.kind !== 'sound' ? applyEffect(next.kind, next.params, code) : code
    return forward(next.id, nextCode, seen)
  }

  for (const n of graph.nodes) {
    if (n.kind !== 'sound' || !n.on) continue
    chains.push(forward(n.id, soundExpr(n)))
  }

  const unique = [...new Set(chains)]
  if (!unique.length) return { code: '', chains: [] }
  const code = unique.length === 1 ? unique[0] : `stack(${unique.join(', ')})`
  return { code, chains: unique }
}
