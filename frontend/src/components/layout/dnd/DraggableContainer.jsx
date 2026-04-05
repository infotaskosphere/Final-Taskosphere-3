/**
 * DraggableContainer
 * ------------------
 * Top-level DragDropContext wrapper for multi-list / cross-section drag.
 * Provides a single onDragEnd handler for moving cards across sections.
 *
 * Usage:
 *   <DraggableContainer onDragEnd={handleDragEnd}>
 *     <DropZone droppableId="section-a" ... />
 *     <DropZone droppableId="section-b" ... />
 *   </DraggableContainer>
 */

import React from 'react';
import { DragDropContext } from '@hello-pangea/dnd';

export function DraggableContainer({ children, onDragEnd }) {
  const handleDragEnd = (result) => {
    if (!result.destination) return;
    if (
      result.destination.droppableId === result.source.droppableId &&
      result.destination.index === result.source.index
    ) return;
    if (typeof onDragEnd === 'function') {
      onDragEnd({
        itemId:     result.draggableId,
        fromList:   result.source.droppableId,
        fromIndex:  result.source.index,
        toList:     result.destination.droppableId,
        toIndex:    result.destination.index,
        raw:        result,
      });
    }
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      {children}
    </DragDropContext>
  );
}

export default DraggableContainer;
