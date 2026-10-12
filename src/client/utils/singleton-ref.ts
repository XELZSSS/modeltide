import { ref, type Ref } from "vue";

export function singletonRef<T>(current: () => T, subscribe: (update: (v: T) => void) => void): () => Ref<T> {
  const value = ref(current()) as Ref<T>;
  let subscribed = false;
  return () => {
    if (!subscribed) {
      subscribed = true;
      subscribe((v) => {
        value.value = v;
      });
    }
    return value;
  };
}
