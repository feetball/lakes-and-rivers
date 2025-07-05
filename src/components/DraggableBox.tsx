'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface DraggableBoxProps {
  children: React.ReactNode;
  title?: string;
  initialPosition?: { x: number; y: number };
  className?: string;
  id: string;
  usePortal?: boolean; // Option to render outside map container
}

const DraggableBox: React.FC<DraggableBoxProps> = ({ 
  children, 
  title, 
  initialPosition = { x: 0, y: 0 }, 
  className = '',
  id,
  usePortal = true // Default to using portal to avoid Leaflet interference
}) => {
  const [position, setPosition] = useState(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [mounted, setMounted] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Load saved position from localStorage
  useEffect(() => {
    setMounted(true);
    const savedPosition = localStorage.getItem(`draggable-${id}-position`);
    if (savedPosition) {
      try {
        const parsed = JSON.parse(savedPosition);
        setPosition(parsed);
      } catch (e) {
        console.warn('Failed to parse saved position for', id);
      }
    }
  }, [id]);

  // Save position to localStorage
  const savePosition = (pos: { x: number; y: number }) => {
    localStorage.setItem(`draggable-${id}-position`, JSON.stringify(pos));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    console.log('DraggableBox handleMouseDown called', { id, target: e.target, title });
    
    // Only start dragging if clicking on the title bar or if no title
    const target = e.target as HTMLElement;
    
    // Don't drag if user is interacting with form controls
    if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'BUTTON' || target.tagName === 'LABEL') {
      console.log('Click on form element, not dragging');
      return;
    }
    
    // Don't drag if clicking inside form controls
    if (target.closest('input') || target.closest('select') || target.closest('button') || target.closest('label')) {
      console.log('Click inside form element, not dragging');
      return;
    }
    
    if (title && !target.classList.contains('drag-handle') && !target.closest('.drag-handle')) {
      console.log('Click not on drag handle, returning');
      return;
    }
    
    console.log('Starting drag for:', id);
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
    e.preventDefault();
    e.stopPropagation();
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    
    const newPosition = {
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    };
    
    // Keep within viewport bounds
    const element = boxRef.current;
    if (element) {
      const rect = element.getBoundingClientRect();
      const maxX = window.innerWidth - rect.width;
      const maxY = window.innerHeight - rect.height;
      
      newPosition.x = Math.max(0, Math.min(maxX, newPosition.x));
      newPosition.y = Math.max(0, Math.min(maxY, newPosition.y));
    }
    
    setPosition(newPosition);
  };

  const handleMouseUp = () => {
    if (isDragging) {
      setIsDragging(false);
      savePosition(position);
    }
  };

  // Attach global mouse event listeners when dragging
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = 'none'; // Prevent text selection
      document.body.style.cursor = 'grabbing';
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      };
    }
  }, [isDragging, dragStart, position]);

  const draggableElement = (
    <div
      ref={boxRef}
      className={`absolute bg-white rounded-lg shadow-lg border ${className} ${
        isDragging ? 'shadow-2xl' : ''
      } ${title ? '' : 'cursor-grab active:cursor-grabbing'}`}
      style={{
        left: position.x,
        top: position.y,
        zIndex: isDragging ? 10000 : 9999, // Much higher z-index to override Leaflet
        cursor: title ? 'default' : (isDragging ? 'grabbing' : 'grab'),
        userSelect: 'none',
        pointerEvents: 'auto', // Ensure pointer events work
      }}
      onMouseDown={title ? undefined : handleMouseDown}
    >
      {title && (
        <div
          className="drag-handle px-3 py-2 bg-gray-100 rounded-t-lg border-b border-gray-200 cursor-grab active:cursor-grabbing select-none hover:bg-gray-200"
          onMouseDown={handleMouseDown}
          style={{ pointerEvents: 'auto' }} // Ensure the handle is clickable
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700 pointer-events-none">{title}</span>
            <div className="flex space-x-1 pointer-events-none">
              <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
              <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
              <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
            </div>
          </div>
        </div>
      )}
      <div className={title ? 'p-3' : 'p-4'}>
        {children}
      </div>
    </div>
  );

  // If not mounted yet, don't render anything
  if (!mounted) return null;

  // Use portal to render outside the map container if requested
  if (usePortal && typeof document !== 'undefined') {
    return createPortal(draggableElement, document.body);
  }

  return draggableElement;
};

export default DraggableBox;
