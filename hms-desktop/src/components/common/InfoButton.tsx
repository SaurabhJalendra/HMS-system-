import React, { useState, useRef, useEffect } from 'react';

const InfoButton = ({ 
  title = "Information", 
  content = "No information available", 
  position = "top", 
  size = "sm",
  variant = "subtle",
  className = "",
  icon = null,
}: {
  title?: string;
  content?: string;
  position?: string;
  size?: string;
  variant?: string;
  className?: string;
  icon?: React.ReactNode;
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [computedPosition, setComputedPosition] = useState(position);
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (!isVisible || !wrapperRef.current) return;
    try {
      const rect = wrapperRef.current.getBoundingClientRect();
      const viewportTopSpace = rect.top;
      const viewportBottomSpace = window.innerHeight - rect.bottom;
      const neededSpace = 120; // conservative height for tooltip + gap

      if (position === 'top' && viewportTopSpace < neededSpace) {
        setComputedPosition('bottom');
      } else if (position === 'bottom' && viewportBottomSpace < neededSpace) {
        setComputedPosition('top');
      } else if (position === 'left' || position === 'right') {
        setComputedPosition(position);
      } else {
        setComputedPosition(position);
      }
    } catch (_e) {
      setComputedPosition(position);
    }
  }, [isVisible, position]);

  const getPositionClasses = () => {
    switch (computedPosition) {
      case 'top':
        return 'bottom-full left-1/2 -translate-x-1/2 mb-2';
      case 'bottom':
        return 'top-full left-1/2 -translate-x-1/2 mt-2';
      case 'left':
        return 'right-full top-1/2 -translate-y-1/2 mr-2';
      case 'right':
        return 'left-full top-1/2 -translate-y-1/2 ml-2';
      default:
        return 'bottom-full left-1/2 -translate-x-1/2 mb-2';
    }
  };

  const getIconSize = () => {
    switch (size) {
      case 'xs':
        return 'w-4 h-4';
      case 'sm':
        return 'w-4.5 h-4.5';
      case 'md':
        return 'w-5 h-5';
      case 'lg':
        return 'w-6 h-6';
      default:
        return 'w-4.5 h-4.5';
    }
  };

  const getButtonClasses = () => {
    const base = 'inline-flex items-center justify-center text-gray-700 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 rounded-full';
    const sizeMap = { xs: 'p-0.5', sm: 'p-1', md: 'p-1.5', lg: 'p-2' };
    const pad = sizeMap[size] || sizeMap.sm;
    if (variant === 'info') return `${base} text-blue-600 hover:text-blue-700 ${pad}`;
    if (variant === 'primary') return `${base} text-white hover:text-gray-100 ${pad}`;
    return `${base} ${pad}`;
  };

  const getTooltipSize = () => {
    switch (size) {
      case 'xs':
        return 'text-[11px] px-2.5 py-1.5 max-w-md min-w-[200px]';
      case 'sm':
        return 'text-xs px-3 py-2 max-w-xl min-w-[280px]';
      case 'md':
        return 'text-sm px-3.5 py-2.5 max-w-2xl min-w-[320px]';
      case 'lg':
        return 'text-base px-4 py-3 max-w-3xl min-w-[360px]';
      default:
        return 'text-xs px-3 py-2 max-w-xl min-w-[280px]';
    }
  };

  return React.createElement(
    'div',
    { ref: wrapperRef, className: `relative inline-flex align-middle ${className}` },
    React.createElement(
      'button',
      {
        type: 'button',
        onMouseEnter: () => setIsVisible(true),
        onMouseLeave: () => setIsVisible(false),
        onFocus: () => setIsVisible(true),
        onBlur: () => setIsVisible(false),
        onClick: () => setIsVisible(!isVisible),
        className: getButtonClasses(),
        'aria-label': 'Show information'
      },
      icon
        ? React.createElement('span', { className: getIconSize() }, icon)
        : React.createElement(
            'svg',
            { className: `${getIconSize()}`, viewBox: '0 0 20 20', fill: 'currentColor', 'aria-hidden': true },
            React.createElement('path', { d: 'M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z', className: 'fill-current opacity-10' }),
            React.createElement('path', { d: 'M9 8.75a1 1 0 1 1 2 0v5.5a1 1 0 1 1-2 0v-5.5Zm1-4.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5Z', className: 'fill-current' })
          )
    ),

    isVisible && React.createElement(
      'div',
      {
        className: `absolute z-[60] ${getPositionClasses()} translate-y-0 transition-opacity duration-150 ease-out`,
        role: 'tooltip',
        onMouseEnter: () => setIsVisible(true),
        onMouseLeave: () => setIsVisible(false)
      },
      React.createElement(
        'div',
        { className: `relative select-text bg-gray-900/95 text-white rounded-md shadow-2xl ring-1 ring-black/10 border border-gray-800/60 ${getTooltipSize()} leading-5 tracking-normal break-words` },
        React.createElement('div', {
          className: `absolute w-2 h-2 bg-gray-900/95 border border-gray-800/60 rotate-45 ${
            computedPosition === 'top' ? 'top-full left-1/2 -translate-x-1/2 -mt-1' :
            computedPosition === 'bottom' ? 'bottom-full left-1/2 -translate-x-1/2 -mb-1' :
            computedPosition === 'left' ? 'left-full top-1/2 -translate-y-1/2 -ml-1' :
            'right-full top-1/2 -translate-y-1/2 -mr-1'
          }`
        }),
        React.createElement(
          'div',
          null,
          title && React.createElement('div', { className: 'font-semibold mb-1 text-white' }, title),
          typeof content === 'string' 
            ? React.createElement('p', { className: 'leading-5 text-white/95' }, content)
            : content
        )
      )
    )
  );
};

export default InfoButton;
