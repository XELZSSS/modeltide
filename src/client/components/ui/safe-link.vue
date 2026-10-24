<script setup lang="ts">
/**
 * A link that stays a link. Same-origin clicks are handed to the router so an in-app jump does not reload the bundle;
 * modified clicks (new tab, download, middle button) are left to the browser, which is what keeps cursor and
 * middle-click behaviour intact despite the interception.
 */
import { navigate } from "@/client/router";
import { isInternalHref } from "@/shared/utils/url";

const props = defineProps<{ href: string; target?: string; rel?: string }>();
const emit = defineEmits<{ click: [event: MouseEvent] }>();

function onClick(event: MouseEvent): void {
  emit("click", event);
  if (event.defaultPrevented) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
  const anchor = event.currentTarget as HTMLAnchorElement;
  if (anchor.target && anchor.target !== "_self") return;
  if (anchor.hasAttribute("download")) return;
  if (!isInternalHref(props.href, window.location.origin)) return;
  event.preventDefault();
  navigate(props.href);
}
</script>

<template>
  <a :href="href" :target="target" :rel="rel" @click="onClick">
    <slot />
  </a>
</template>
