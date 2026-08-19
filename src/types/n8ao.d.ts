declare module 'n8ao' {
  import type * as THREE from 'three';
  import { Pass } from 'postprocessing';

  export interface N8AOConfiguration {
    aoSamples: number;
    aoRadius: number;
    aoTones: number;
    denoiseSamples: number;
    denoiseRadius: number;
    distanceFalloff: number;
    intensity: number;
    denoiseIterations: number;
    renderMode: 0 | 1 | 2 | 3 | 4;
    biasOffset: number;
    biasMultiplier: number;
    color: THREE.Color;
    gammaCorrection: boolean;
    depthBufferType: 1 | 2 | 3;
    screenSpaceRadius: boolean;
    halfRes: boolean;
    depthAwareUpsampling: boolean;
    colorMultiply: boolean;
    transparencyAware: boolean;
    accumulate: boolean;
    neuralDenoise: boolean;
    stencil?: boolean;
  }

  export type N8AOQualityMode =
    | 'Performance' | 'Low' | 'Medium' | 'High' | 'Ultra'
    | 'Neural-Low' | 'Neural-Medium' | 'Neural-High';

  export class N8AOPostPass extends Pass {
    constructor(scene: THREE.Scene, camera: THREE.Camera, width?: number, height?: number);
    configuration: N8AOConfiguration;
    setQualityMode(mode: N8AOQualityMode): void;
    setSize(width: number, height: number): void;
    setDisplayMode(mode: 'Combined' | 'AO' | 'No AO' | 'Split' | 'Split AO'): void;
    enableAllSampling(): void;
  }

  export class N8AOPass {
    constructor(scene: THREE.Scene, camera: THREE.Camera, width?: number, height?: number);
    configuration: N8AOConfiguration;
    setQualityMode(mode: N8AOQualityMode): void;
    setSize(width: number, height: number): void;
  }
}
