<script setup lang="ts">
import SafeLink from "@/client/components/ui/safe-link.vue";
import { FALLBACK_DASH } from "@/shared/config/ui";
import { cn } from "@/client/utils/cn";

/**
 * A ranking row's name. `rank` is the row's position in the delivered ranking, which is what makes the table's order
 * explicit rather than implied, and `href` turns the name into the link to its detail page — a row that has no id to link
 * to keeps plain text, because a dead link is worse than none.
 */
defineProps<{ name: string; title?: string; rank?: number | null; href?: string }>();

const NAME_CLASS = "flex-1 min-w-0 ui-body font-medium break-words md:truncate";
const LINK_CLASS = cn(
  NAME_CLASS,
  "ui-motion focus-visible:underline focus-visible:outline-none hoverable:hover:underline",
);
</script>

<template>
  <div class="flex min-w-0 items-center gap-2">
    <span v-if="rank != null" class="w-6 shrink-0 text-right ui-meta tabular-nums">{{ rank }}</span>
    <SafeLink v-if="href" :href="href" :class="LINK_CLASS" v-tooltip="title ?? name">
      {{ name || FALLBACK_DASH }}
    </SafeLink>
    <p v-else :class="NAME_CLASS" v-tooltip="title ?? name">{{ name || FALLBACK_DASH }}</p>
    <slot name="suffix" />
  </div>
</template>
