<script setup lang="ts">
import { ref } from "vue";
import { cn } from "@/client/utils/cn";
import { useSheetLock } from "./use-sheet-lock";

/**
 * A modal sheet: the overlay, the panel, and the lock that keeps the page behind it out of reach (scroll lock, `inert`
 * on the rest of the app, focus trap — all in use-sheet-lock.ts). Teleported to <body> so the scroller that owns the
 * page content can never clip it.
 */
const props = defineProps<{ open: boolean; label: string }>();
const emit = defineEmits<{ close: [] }>();

const panelRef = ref<HTMLDivElement | null>(null);

useSheetLock({ open: () => props.open, panel: panelRef, onClose: () => emit("close") });
</script>

<template>
  <Teleport to="body">
    <Transition name="ui-fade" appear>
      <div v-if="open" class="fixed inset-0 z-40 bg-scrim" aria-hidden="true" @click="emit('close')" />
    </Transition>
    <Transition name="ui-sheet" appear>
      <div v-if="open" class="pointer-events-none fixed inset-0 z-50 flex items-end justify-center md:items-center">
        <div
          ref="panelRef"
          role="dialog"
          aria-modal="true"
          :aria-label="label"
          tabindex="-1"
          :class="
            cn(
              // Bottom sheets are flush with the viewport edge, so the panel itself has to absorb the home-indicator
              // inset; `sheet-body`'s own padding is inside it and would leave the last row in the gesture area.
              'pointer-events-auto w-full max-w-md ui-overlay rounded-b-none pb-[env(safe-area-inset-bottom,0px)] focus:outline-none md:rounded-b-xl md:pb-0',
            )
          "
        >
          <slot />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
