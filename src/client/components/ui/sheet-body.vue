/** The scrolling content area of a sheet: capped to 70vh so the header stays on screen and the body scrolls alone. */
<template>
  <div class="flex max-h-[70vh] flex-col gap-5 overflow-y-auto p-5">
    <slot />
  </div>
</template>
