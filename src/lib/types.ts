import { DRUM_BANKS } from './banks'

export type PortKind = 'audio'

export type NodeKind = 'sound' | 'gain' | 'lpf' | 'delay' | 'room' | 'crush' | 'pan'

export type FieldType = 'text' | 'number' | 'select'

export interface FieldDef {
  key: string
  label: string
  type: FieldType
  min?: number
  max?: number
  step?: number
  options?: { value: string; label: string }[]
  default: string | number
}

export interface NodeTypeDef {
  kind: NodeKind
  title: string
  accent: string
  cable: string
  inputs: number
  outputs: number
  fields: FieldDef[]
}

export interface GraphNode {
  id: string
  kind: NodeKind
  x: number
  y: number
  on: boolean
  params: Record<string, string | number>
}

export interface GraphEdge {
  id: string
  from: string
  to: string
}

export const NODE_TYPES: Record<NodeKind, NodeTypeDef> = {
  sound: {
    kind: 'sound',
    title: 'SOUND',
    accent: '#c9a227',
    cable: '#888',
    inputs: 0,
    outputs: 1,
    fields: [
      {
        key: 'mode',
        label: 'mode',
        type: 'select',
        options: [
          { value: 'sample', label: 'sample' },
          { value: 'note', label: 'note' },
        ],
        default: 'sample',
      },
      { key: 'pattern', label: 'pat', type: 'text', default: 'bd sd' },
      {
        key: 'bank',
        label: 'bank',
        type: 'select',
        options: [
          { value: '', label: '(default)' },
          ...DRUM_BANKS.map((b) => ({ value: b, label: b })),
        ],
        default: '',
      },
      {
        key: 'synth',
        label: 'synth',
        type: 'select',
        options: [
          { value: '', label: '(sample)' },
          { value: 'sawtooth', label: 'saw' },
          { value: 'square', label: 'sqr' },
          { value: 'triangle', label: 'tri' },
          { value: 'sine', label: 'sin' },
          { value: 'piano', label: 'piano' },
          { value: 'gm_piano', label: 'gm piano' },
          { value: 'gm_epiano1', label: 'gm epiano' },
          { value: 'gm_vibraphone', label: 'gm vibes' },
          { value: 'zzfx', label: 'zzfx' },
          { value: 'z_sawtooth', label: 'z saw' },
          { value: 'z_noise', label: 'z noise' },
        ],
        default: '',
      },
    ],
  },
  gain: {
    kind: 'gain',
    title: 'GAIN',
    accent: '#5a8f6a',
    cable: '#888',
    inputs: 1,
    outputs: 1,
    fields: [{ key: 'amount', label: 'amt', type: 'number', min: 0, max: 2, step: 0.01, default: 0.8 }],
  },
  lpf: {
    kind: 'lpf',
    title: 'LPF',
    accent: '#4a7a9a',
    cable: '#888',
    inputs: 1,
    outputs: 1,
    fields: [{ key: 'cutoff', label: 'cut', type: 'number', min: 40, max: 12000, step: 10, default: 1200 }],
  },
  delay: {
    kind: 'delay',
    title: 'DELAY',
    accent: '#7a5a9a',
    cable: '#888',
    inputs: 1,
    outputs: 1,
    fields: [
      { key: 'time', label: 'time', type: 'number', min: 0, max: 1, step: 0.01, default: 0.25 },
      { key: 'feedback', label: 'fb', type: 'number', min: 0, max: 1, step: 0.01, default: 0.4 },
    ],
  },
  room: {
    kind: 'room',
    title: 'ROOM',
    accent: '#9a6a4a',
    cable: '#888',
    inputs: 1,
    outputs: 1,
    fields: [{ key: 'size', label: 'size', type: 'number', min: 0, max: 2, step: 0.01, default: 0.6 }],
  },
  crush: {
    kind: 'crush',
    title: 'CRUSH',
    accent: '#9a4a4a',
    cable: '#888',
    inputs: 1,
    outputs: 1,
    fields: [{ key: 'bits', label: 'bits', type: 'number', min: 1, max: 16, step: 0.5, default: 4 }],
  },
  pan: {
    kind: 'pan',
    title: 'PAN',
    accent: '#6a6a7a',
    cable: '#888',
    inputs: 1,
    outputs: 1,
    fields: [{ key: 'pos', label: 'pos', type: 'number', min: -1, max: 1, step: 0.01, default: 0 }],
  },
}

export const PALETTE: NodeKind[] = ['sound', 'gain', 'lpf', 'delay', 'room', 'crush', 'pan']

let seq = 1
export function uid(prefix = 'n') {
  return `${prefix}${seq++}`
}

export function createNode(kind: NodeKind, x: number, y: number): GraphNode {
  const def = NODE_TYPES[kind]
  const params: Record<string, string | number> = {}
  for (const f of def.fields) params[f.key] = f.default
  return { id: uid('n'), kind, x, y, on: true, params }
}

export function createEdge(from: string, to: string): GraphEdge {
  return { id: uid('e'), from, to }
}
