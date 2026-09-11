import React from 'react';

const PasswordVisibilityIcon = ({ visible }: { visible: boolean }) =>
  React.createElement(
    'svg',
    {
      width: 20,
      height: 20,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 2,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': true
    },
    visible
      ? [
          React.createElement('path', {
            key: 'hidden-eye',
            d: 'M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 4.2A10.8 10.8 0 0112 4c6.5 0 10 8 10 8a18.5 18.5 0 01-2.1 3.2M6.6 6.6C3.7 8.5 2 12 2 12s3.5 8 10 8a10.7 10.7 0 005.4-1.5'
          })
        ]
      : [
          React.createElement('path', {
            key: 'eye',
            d: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12'
          }),
          React.createElement('circle', { key: 'pupil', cx: 12, cy: 12, r: 3 })
        ]
  );

export default PasswordVisibilityIcon;
