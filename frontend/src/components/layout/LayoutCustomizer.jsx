import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { GripVertical, RotateCcw, X } from 'lucide-react';

const COLORS = { deepBlue: '#0D3B66', mediumBlue: '#1F6FB2' };

/**
 * LayoutCustomizer
 * A slide-in right panel that lets the user drag sections to reorder them.
 *
 * Props:
 *   isOpen         {boolean}   - whether the panel is visible
 *   onClose        {function}  - called when user dismisses the panel
 *   order          {string[]}  - current section IDs in order
 *   sectionLabels  {object}    - map of sectionId → { name, icon, desc }
 *   onDragEnd      {function}  - called with (fromIndex, toIndex) after drop
 *   onReset        {function}  - called when user clicks Reset
 *   isDark         {boolean}   - dark mode flag
 */
export default function LayoutCustomizer({
  isOpen,
  onClose,
  order,
  sectionLabels,
  onDragEnd,
  onReset,
  isDark,
}) {
  const handleDragEnd = (result) => {
    if (!result.destination) return;
    if (result.destination.index === result.source.index) return;
    onDragEnd(result.source.index, result.destination.index);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[9998] flex justify-end"
          style={{ background: 'rgba(7,15,30,0.5)', backdropFilter: 'blur(6px)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            initial={{ x: 340 }}
            animate={{ x: 0 }}
            exit={{ x: 340 }}
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            className={`w-80 h-full shadow-2xl flex flex-col ${isDark ? 'bg-slate-900' : 'bg-white'}`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* ── Header ── */}
            <div
              className="px-5 py-4 flex items-center justify-between"
              style={{
                background: `linear-gradient(135deg, ${COLORS.deepBlue}, ${COLORS.mediumBlue})`,
                borderBottom: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
              }}
            >
              <div>
                <p className="text-white font-bold text-base">Customize Layout</p>
                <p className="text-blue-200 text-xs mt-0.5">Drag sections to reorder</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={onReset}
                  className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-white/15 text-white hover:bg-white/25 transition-all"
                >
                  <RotateCcw size={11} /> Reset
                </button>
                <button
                  onClick={onClose}
                  className="w-7 h-7 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center transition-all"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>

            {/* ── Drag list ── */}
            <div className="p-4 flex-1 overflow-y-auto">
              <p
                className={`text-xs font-semibold uppercase tracking-wider mb-3 ${
                  isDark ? 'text-slate-400' : 'text-slate-400'
                }`}
              >
                Section Order
              </p>

              <DragDropContext onDragEnd={handleDragEnd}>
                <Droppable droppableId="layout-sections">
                  {(provided) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className="space-y-2"
                    >
                      {order.map((sectionId, index) => {
                        const label = sectionLabels[sectionId] || {
                          name: sectionId,
                          icon: '📦',
                          desc: '',
                        };
                        return (
                          <Draggable
                            key={sectionId}
                            draggableId={sectionId}
                            index={index}
                          >
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                                  snapshot.isDragging
                                    ? isDark
                                      ? 'bg-blue-900/40 border-blue-600 shadow-xl'
                                      : 'bg-blue-50 border-blue-300 shadow-xl'
                                    : isDark
                                    ? 'bg-slate-800 border-slate-700'
                                    : 'bg-white border-slate-200'
                                }`}
                              >
                                {/* Drag handle */}
                                <div
                                  {...provided.dragHandleProps}
                                  className={`cursor-grab active:cursor-grabbing p-1 rounded ${
                                    isDark
                                      ? 'text-slate-400 hover:text-slate-200'
                                      : 'text-slate-300 hover:text-slate-500'
                                  }`}
                                >
                                  <GripVertical size={16} />
                                </div>

                                <span className="text-lg">{label.icon}</span>

                                <div className="flex-1 min-w-0">
                                  <p
                                    className={`text-sm font-semibold ${
                                      isDark ? 'text-slate-100' : 'text-slate-800'
                                    }`}
                                  >
                                    {label.name}
                                  </p>
                                  <p
                                    className={`text-xs truncate ${
                                      isDark ? 'text-slate-400' : 'text-slate-400'
                                    }`}
                                  >
                                    {label.desc}
                                  </p>
                                </div>

                                <span
                                  className={`text-xs font-bold px-1.5 py-0.5 rounded-md flex-shrink-0 ${
                                    isDark
                                      ? 'bg-slate-700 text-slate-300'
                                      : 'bg-slate-100 text-slate-500'
                                  }`}
                                >
                                  #{index + 1}
                                </span>
                              </div>
                            )}
                          </Draggable>
                        );
                      })}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            </div>

            {/* ── Footer ── */}
            <div
              className="px-4 py-3"
              style={{
                borderTop: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
              }}
            >
              <p
                className={`text-xs text-center ${
                  isDark ? 'text-slate-500' : 'text-slate-400'
                }`}
              >
                Changes save automatically · refreshes remembered
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
