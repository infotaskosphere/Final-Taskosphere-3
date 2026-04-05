/**
 * DropZone
 * ---------
 * A standalone visual drop target for use with @hello-pangea/dnd.
 * Renders an animated placeholder that highlights when a draggable hovers over it.
 *
 * Usage:
 *   <DropZone droppableId="zone-1" isDark={isDark}>
 *     {(isOver) => <p>{isOver ? 'Release to drop' : 'Drag here'}</p>}
 *   </DropZone>
 */

import React from 'react';
import { Droppable } from '@hello-pangea/dnd';
import { motion, AnimatePresence } from 'framer-motion';

export function DropZone({
  droppableId,
  isDark,
  children,
  className = '',
  minHeight = 80,
  label = 'Drop here',
}) {
  return (
    <Droppable droppableId={droppableId}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.droppableProps}
          className={`
            relative rounded-xl transition-all duration-200
            ${snapshot.isDraggingOver
              ? isDark
                ? 'bg-blue-900/20 border-2 border-dashed border-blue-500/50'
                : 'bg-blue-50/80 border-2 border-dashed border-blue-300/70'
              : isDark
                ? 'bg-slate-800/40 border-2 border-dashed border-slate-600/40'
                : 'bg-slate-50/60 border-2 border-dashed border-slate-200/60'
            }
            ${className}
          `}
          style={{ minHeight }}
        >
          {/* Drop indicator label */}
          <AnimatePresence>
            {snapshot.isDraggingOver && (
              <motion.div
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                className="absolute inset-0 flex items-center justify-center pointer-events-none"
              >
                <span
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full ${
                    isDark
                      ? 'bg-blue-900/60 text-blue-300'
                      : 'bg-blue-100 text-blue-600'
                  }`}
                >
                  {label}
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Children */}
          {typeof children === 'function'
            ? children(snapshot.isDraggingOver)
            : children}

          {provided.placeholder}
        </div>
      )}
    </Droppable>
  );
}

export default DropZone;
