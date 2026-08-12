/// <reference types="svelte" />
/// <reference types="vite/client" />

declare module '@strudel/web' {
  export function initStrudel(options?: {
    prebake?: () => unknown
    [key: string]: unknown
  }): Promise<unknown>
  export function evaluate(code: string): Promise<unknown>
  export function hush(): void
  export function samples(src: string, baseUrl?: string): Promise<unknown>
}

declare module '@strudel/webaudio' {
  export function registerSynthSounds(): Promise<unknown> | unknown
  export function registerZZFXSounds(): Promise<unknown> | unknown
  export function aliasBank(path: string): Promise<unknown>
  export function samples(
    sampleMap: string | Record<string, unknown>,
    baseUrl?: string,
    options?: { prebake?: boolean; tag?: string },
  ): Promise<unknown>
}

declare module '@strudel/soundfonts' {
  export function registerSoundfonts(): Promise<unknown> | unknown
}

declare module 'vite-plugin-bundle-audioworklet' {
  import type { Plugin } from 'vite'
  export default function bundleAudioWorkletPlugin(): Plugin
}
