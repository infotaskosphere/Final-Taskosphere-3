import React, { Suspense } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Outlet, useLocation } from "react-router-dom";
import { pageTransition } from "@/lib/animations.js";
import { ContentLoader } from "@/components/ui/GifLoader.jsx";

/**
 * Route-level motion only.
 *
 * This component owns navigation motion for the whole application. Feature
 * components should keep their own hover, tap, modal, progress, and status
 * animations; those are interaction feedback, not page transitions.
 */
export function PageTransition({ children, standalone = false }) {
  const location = useLocation();

  return (
    <motion.div
      key={location.pathname}
      className={`taskosphere-page-transition${standalone ? " taskosphere-page-transition--standalone" : ""}`}
      {...pageTransition}
    >
      {children}
    </motion.div>
  );
}

export function AnimatedOutlet() {
  const location = useLocation();

  return (
    <AnimatePresence mode="sync" initial={false}>
      <PageTransition key={location.pathname}>
        <Suspense fallback={<ContentLoader />}>
          <Outlet />
        </Suspense>
      </PageTransition>
    </AnimatePresence>
  );
}
