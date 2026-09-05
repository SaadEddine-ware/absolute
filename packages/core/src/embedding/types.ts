export interface EmbeddingProvider {
  readonly modelId: string;
  readonly dimensions: number;
  embed(text: string): Promise<Float32Array>;
}
