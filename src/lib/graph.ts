import {
  arpNoteCode,
  chordNoteCode,
  defaultArpData,
  defaultChordData,
} from './chord-engine'
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
  const chord = createNode('chord', -210.079, -38.916)
  const arp = createNode('arp', 305.304, -60.429)
  const voice = createNode('voice', 296.032, 406.809)
  const sound = createNode('sound', -123.484, 452.742)
  const lpf = createNode('lpf', 534.571, 338.862)
  const delay = createNode('delay', 832.037, 311.507)

  chord.chord = defaultChordData()
  Object.assign(chord.chord, {
    current: 53,
    selected: 53,
    page: 48,
    prog: [59, 58, 57, 53, 48, 49, 50, 51],
    progLen: 4,
    progOn: true,
    transpose: 0,
    strum: 0,
    hold: 0.9,
    mappingMode: 'memory',
    bank: 'init',
    keys: true,
    midi: false,
    latch: false,
  })

  const arpData = defaultArpData()
  const firstPattern = arpData.patterns[0]
  firstPattern.lanes.note = [1, 3, 6, 4, 7, ...Array(27).fill(9)]
  firstPattern.len.note = 5
  firstPattern.div.note = 1
  firstPattern.rate = '1/16'
  firstPattern.linkLen = false
  firstPattern.retrig = true
  firstPattern.chordMode = false
  firstPattern.swing = 0
  firstPattern.globalGate = 1
  Object.assign(arpData, structuredClone(firstPattern), { pattern: 0, tab: 'note' })
  arp.arp = arpData

  voice.params.synth = 'sawtooth'
  voice.params.attack = 0
  voice.params.release = 0.05
  sound.params.mode = 'sample'
  sound.params.pattern = 'bd sd bd sd'
  sound.params.bank = ''
  sound.params.synth = ''
  sound.on = false
  lpf.params.cutoff = 2780
  delay.params.time = 0
  delay.params.feedback = 0.08
  return {
    nodes: [chord, arp, voice, sound, lpf, delay],
    edges: [
      createEdge(chord.id, arp.id),
      createEdge(arp.id, voice.id),
      createEdge(voice.id, lpf.id),
      createEdge(lpf.id, delay.id),
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

/** true when everything arriving here is notes, so picking a synth for it makes sense */
function carriesNotes(graph: PatchGraph, id: string, seen = new Set<string>()): boolean {
  if (seen.has(id)) return false
  seen.add(id)
  const node = graph.nodes.find((n) => n.id === id)
  if (!node) return false
  if (node.kind === 'chord' || node.kind === 'arp' || node.kind === 'voice') return true
  if (node.kind === 'sound') return node.params.mode === 'note'
  const sources = incoming(graph, id)
  return sources.length > 0 && sources.every((e) => carriesNotes(graph, e.from, seen))
}

export function connect(graph: PatchGraph, from: string, to: string): string | null {
  if (from === to) return 'cannot self-connect'
  const a = graph.nodes.find((n) => n.id === from)
  const b = graph.nodes.find((n) => n.id === to)
  if (!a || !b) return 'missing node'
  if (NODE_TYPES[b.kind].inputs < 1) return 'no input on target'
  if (b.kind === 'arp') {
    if (a.kind !== 'chord') return 'ARP only takes a CHORDS input'
    if (incoming(graph, to).length) return 'ARP already has a chord input'
  }
  // a synth choice would otherwise overwrite the sample name of any drums passing through
  if (b.kind === 'voice' && !carriesNotes(graph, from)) return 'VOICE only takes notes (CHORDS / ARP)'
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
  const bank = String(node.params.bank ?? '')
  let code: string
  if (mode === 'note') {
    code = `note("${escapeMini(pattern)}")`
    if (synth) code += `.s("${escapeMini(synth)}")`
    else code += `.s("sawtooth")`
  } else {
    code = `s("${escapeMini(pattern)}")`
  }
  if (bank) code += `.bank("${escapeMini(bank)}")`
  return code
}

function applyEffect(kind: NodeKind, params: Record<string, string | number>, code: string): string {
  switch (kind) {
    case 'voice':
      return `${code}.s("${escapeMini(String(params.synth ?? 'sawtooth'))}").attack(${Number(
        params.attack,
      )}).release(${Number(params.release)})`
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
    } else if (node.kind === 'chord') {
      expr = node.on && node.chord ? chordNoteCode(node.chord) || null : null
    } else if (node.kind === 'arp') {
      // the arp reads the upstream chord's notes rather than its audio
      const source = incoming(graph, id)
        .map((e) => byId.get(e.from))
        .find((n) => n?.kind === 'chord' && n.on)
      expr = node.on && node.arp ? arpNoteCode(node.arp, source?.chord ?? null) || null : null
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
