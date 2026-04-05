/**
 * DraggableSection
 * -----------------
 * A reusable wrapper that makes a full page section drag-and-droppable
 * using @hello-pangea/dnd (same API as react-beautiful-dnd).
 *
 * Usage:
 *   <DraggableSectionList
 *     order={order}
 *     onMoveSection={moveSection}
 *     isDark={isDark}
 *   >
 *     {(sectionId) => <YourSection key={sectionId} id={sectionId} />}
 *   </DraggableSectionList>
 */

import React from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { GripVertical } from 'lucide-react';
import { motion } from 'framer-motion';

/* ── Drag handle icon ──────────────────────────────────────────────── */
export function DragHandle({ isDark, className = '' }) {
  return (
    <span
      className={`drag-handle ${className}`}
      title="Drag to reorder section"
      aria-label="Drag handle"
    >
      <GripVertical
        size={16}
        style={{ color: isDark ? '#64748b' : '#94a3b8' }}
      />
    </span>
  );
}

/* ── Single draggable section ──────────────────────────────────────── */
export function DraggableSection({ sectionId, index, children, isDark }) {
  return (
    <Draggable draggableId={sectionId} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={`draggable-section w-full min-w-0${
            snapshot.isDragging ? ' dnd-section-dragging' : ''
          }`}
          style={{
            ...provided.draggableProps.style,
            /* Ensure dragging doesn't break layout */
            marginBottom: 0,
          }}
        >
          {/* Pass drag handle props to children via render prop */}
          {typeof children === 'function'
            ? children({ dragHandleProps: provided.dragHandleProps, isDragging: snapshot.isDragging })
            : children}
        </div>
      )}
    </Draggable>
  );
}

/* ── List of draggable sections ────────────────────────────────────── */
export function DraggableSectionList({
  droppableId = 'page-sections',
  order,
  onMoveSection,
  isDark,
  children,
  className = '',
  gap = '1.25rem',
}) {
  const handleDragEnd = (result) => {
    if (!result.destination) return;
    const from = result.source.index;
    const to   = result.destination.index;
    if (from === to) return;
    onMoveSection(from, to);
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <Droppable droppableId={droppableId} direction="vertical">
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`w-full min-w-0 ${className}${
              snapshot.isDraggingOver ? ' dnd-dropzone-over' : ''
            }`}
            style={{ display: 'flex', flexDirection: 'column', gap }}
          >
            {order.map((sectionId, index) => (
              <DraggableSection
                key={sectionId}
                sectionId={sectionId}
                index={index}
                isDark={isDark}
              >
                {(dragProps) => children(sectionId, dragProps, index)}
              </DraggableSection>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
}
