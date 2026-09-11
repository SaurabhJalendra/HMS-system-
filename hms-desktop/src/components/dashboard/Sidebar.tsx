import React from 'react';

const Sidebar = ({ modules, activeModule, onModuleChange, collapsed, onToggle }: any) => {
  return React.createElement(
    'div',
    { 
      style: {
        backgroundColor: '#E8E8E8',
        color: '#000000',
        width: collapsed ? '48px' : '200px',
        borderRight: '1px solid #C8C8C8',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.2s ease'
      }
    },
    React.createElement(
      'div',
      { style: { padding: '4px' } },
      React.createElement(
        'button',
        {
          onClick: onToggle,
          style: {
            color: '#000000',
            backgroundColor: 'transparent',
            border: 'none',
            padding: '4px 8px',
            cursor: 'pointer',
            fontSize: '14px'
          },
          onMouseOver: (e) => e.target.style.backgroundColor = '#D0D0D0',
          onMouseOut: (e) => e.target.style.backgroundColor = 'transparent'
        },
        collapsed ? '☰' : '✕'
      )
    ),
    React.createElement(
      'nav',
      { style: { marginTop: '4px', flex: 1 } },
      Object.entries(modules).map(([key, module]) => {
        const isActive = activeModule === key;
        return React.createElement(
          'button',
          {
            key: key,
            onClick: () => onModuleChange(key),
            style: {
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              padding: '6px 8px',
              textAlign: 'left',
              backgroundColor: isActive ? '#0078D4' : 'transparent',
              color: isActive ? '#FFFFFF' : '#000000',
              border: 'none',
              borderRight: isActive ? '3px solid #005A9E' : 'none',
              cursor: 'pointer',
              fontSize: '13px',
              fontFamily: 'inherit'
            },
            onMouseOver: (e) => {
              if (!isActive) {
                e.target.style.backgroundColor = '#D0D0D0';
              }
            },
            onMouseOut: (e) => {
              if (!isActive) {
                e.target.style.backgroundColor = 'transparent';
              }
            }
          },
          React.createElement(
            'span',
            { style: { fontSize: '16px', marginRight: '8px' } },
            module.icon
          ),
          !collapsed && React.createElement(
            'span',
            { style: { fontWeight: isActive ? '600' : '400' } },
            module.name
          )
        );
      })
    )
  );
};

export default Sidebar;
