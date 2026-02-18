// src/lib/animations.js
// Reusable Framer Motion variants for consistent animations across the app

/**
 * Container variant - used for parent elements that contain staggered children
 * (cards, lists, grid items, etc.)
 */
export const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.07,     // delay between each child's animation start
      delayChildren: 0.1,        // small delay before the first child starts
    },
  },
};

/**
 * Standard item/card variant - subtle slide-up + fade
 * Most commonly used for task cards, list items, stat cards, etc.
 */
export const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: {
      duration: 0.4,
      ease: "easeOut",
    },
  },
};

/**
 * Page-level fade-in (good for full page wrappers or main content sections)
 */
export const pageFadeVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.5, ease: "easeOut" },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.3 },
  },
};

/**
 * Modal / Dialog animation - scale + fade
 * Use with AnimatePresence for exit animation
 */
export const modalVariants = {
  hidden: { opacity: 0, scale: 0.88, y: 20 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      type: "spring",
      damping: 25,
      stiffness: 300,
      duration: 0.35,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.88,
    y: 20,
    transition: { duration: 0.2, ease: "easeIn" },
  },
};

/**
 * Card hover / interaction feedback
 * Use with whileHover / whileTap on motion components
 */
export const cardHoverVariants = {
  rest: {
    scale: 1,
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
    transition: { duration: 0.2 },
  },
  hover: {
    scale: 1.02,
    boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
    transition: { duration: 0.2 },
  },
  tap: {
    scale: 0.98,
    transition: { duration: 0.1 },
  },
};

/**
 * Button / icon subtle scale on hover/tap
 */
export const buttonScaleVariants = {
  rest: { scale: 1 },
  hover: { scale: 1.05 },
  tap: { scale: 0.96 },
};

/**
 * Slide in from left (sidebar, notifications, etc.)
 */
export const slideInLeft = {
  hidden: { x: -60, opacity: 0 },
  visible: {
    x: 0,
    opacity: 1,
    transition: { duration: 0.45, ease: "easeOut" },
  },
};

/**
 * Slide in from right (drawers, side panels)
 */
export const slideInRight = {
  hidden: { x: 60, opacity: 0 },
  visible: {
    x: 0,
    opacity: 1,
    transition: { duration: 0.45, ease: "easeOut" },
  },
};

/**
 * Quick bounce / attention animation (new task badge, notification dot, etc.)
 */
export const bounceIn = {
  hidden: { scale: 0 },
  visible: {
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 400,
      damping: 10,
    },
  },
};

export const fadeInUp = {
  hidden: { y: 15, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { duration: 0.5, ease: "easeOut" },
  },
};

export const fadeInDown = {
  hidden: { y: -15, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { duration: 0.5, ease: "easeOut" },
  },
};
