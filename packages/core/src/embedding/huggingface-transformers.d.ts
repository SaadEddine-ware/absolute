// Ambient module declaration for @huggingface/transformers.
//
// The package is an optionalDependency of @absolute/core — it is NOT
// shipped or installed by default (its transitive onnxruntime-node has a
// fatal postinstall on Linux; see local-provider.ts). The local provider
// imports it dynamically only when actually used.
//
// This declaration tells TypeScript the module exists and is typed `any`,
// so `import('@huggingface/transformers')` compiles WITHOUT the real
// package being installed. When the real package IS installed, this
// ambient declaration is more permissive (`any`) and does not conflict
// with its shipped types — tsc has already loaded the module's own types
// in that case, and `any` is compatible with everything.
//
// This file must never be shipped in dist when no bundling conflict with
// the real package types; tsup marks the package external, and the public
// surface of @absolute/core never exposes transformers types, so the
// bundled d.ts does not reference this module.
declare module '@huggingface/transformers' {
  const mod: any;
  export = mod;
}