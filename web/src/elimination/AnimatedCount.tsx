import { AnimatePresence, motion } from "motion/react";

export function AnimatedCount({ value, reducedMotion }: { readonly value: number; readonly reducedMotion: boolean }) {
  if (reducedMotion) return <span className="animated-count" aria-live="polite">{value}</span>;
  return <span className="animated-count" aria-live="polite">
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span key={value} initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -24, opacity: 0 }} transition={{ duration: .24 }}>{value}</motion.span>
    </AnimatePresence>
  </span>;
}
