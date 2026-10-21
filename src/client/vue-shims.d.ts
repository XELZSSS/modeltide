// TypeScript 7 exposes no JS compiler API, so `.vue` single-file components are compiled
// and typed by Vite's own pipeline only. This shim keeps the TypeScript module graph
// resolvable when a `.ts` module imports a `.vue` component.
declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<object, object, Record<string, unknown>>;
  export default component;
}
