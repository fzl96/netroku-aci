// Sites, racks, and devices are shown together on every inventory page — a
// device row embeds its rack name, a rack card embeds its site — so a write
// to any one of them can make any of the three reads stale. One shared tag
// keeps that cascade correct without hand-maintaining which purposes touch
// which other purposes' caches.
export const INVENTORY_CACHE_SECONDS = 28_800
export const INVENTORY_TAG = 'inventory:all'
