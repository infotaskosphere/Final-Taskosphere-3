/**
 * DraggableCard
 * -------------
 * Reusable card-level drag-and-drop using @hello-pangea/dnd.
 * Cards can be reordered within a section or moved between sections.
 *
 * Usage (same section reorder):
 *   <DraggableCardList
 *     droppableId="section-id"
 *     items={cardItems}          // [{ id, ...data }]
 *     onMoveCard={handleMove}    // (fromIndex, toIndex, sourceId, destId) => void
 *     renderCard={(item, dragHandleProps, isDragging) => <YourCard ... />}
 *   />
 *
 * Usage (multi-section — wrap multiple DraggableCardLists in one DragDropContext):
 *   <MultiSectionCardDnD
 *     sections={[{ id, items }]}
 *     onMoveCard={handleMove}
 *     renderCard={...}
 *   />
 */

import React from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { GripVertical } from 'lucide-react';

/* ── Single draggable card ─────────────────────────────────────────── */
function DraggableCardItem({ item, index, renderCard, isDark }) {
  return (
    <Draggable draggableId={String(item.id)} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={`draggable-card w-full min-w-0${
            snapshot.isDragging ? ' dnd-card-dragging' : ''
          }`}
          style={provided.draggableProps.style}
        >
          {renderCard(item, provided.dragHandleProps, snapshot.isDragging, isDark)}
        </div>
      )}
    </Draggable>
  );
}

/* ── Droppable card list ───────────────────────────────────────────── */
export function DraggableCardList({
  droppableId,
  items = [],
  onMoveCard,
  renderCard,
  isDark,
  direction = 'vertical',
  className = '',
  gap = '0.75rem',
}) {
  const handleDragEnd = (result) => {
    if (!result.destination) return;
    const from = result.source.index;
    const to   = result.destination.index;
    if (from === to) return;
    onMoveCard(from, to, result.source.droppableId, result.destination.droppableId);
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <Droppable droppableId={droppableId} direction={direction}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`w-full min-w-0 ${className}${
              snapshot.isDraggingOver ? ' dnd-dropzone-over' : ''
            }`}
            style={{ display: 'flex', flexDirection: direction === 'horizontal' ? 'row' : 'column', gap, flexWrap: direction === 'horizontal' ? 'wrap' : undefined }}
          >
            {items.map((item, index) => (
              <DraggableCardItem
                key={item.id}
                item={item}
                index={index}
                renderCard={renderCard}
                isDark={isDark}
              />
            ))}
            {provided.placeholder}
            {items.length === 0 && (
              <div className="dnd-placeholder flex items-center justify-center text-slate-400 dark:text-slate-600 text-xs font-medium">
                Drop cards here
              </div>
            )}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
}

/* ── Drag handle for cards ────────────────────────────────────────── */
export function CardDragHandle({ dragHandleProps, isDark, className = '' }) {
  return (
    <span
      {...dragHandleProps}
      className={`drag-handle flex-shrink-0 ${className}`}
      title="Drag to reorder"
      aria-label="Drag card handle"
    >
      <GripVertical
        size={14}
        style={{ color: isDark ? '#64748b' : '#94a3b8' }}
      />
    </span>
  );
}

export default DraggableCardList;
