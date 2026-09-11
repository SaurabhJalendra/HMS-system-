import React, { useState } from 'react';

const Header = ({ user, onLogout, onToggleSidebar }: any) => {
  const [showUserMenu, setShowUserMenu] = useState(false);

  return React.createElement(
    'header',
    { style: { backgroundColor: '#F3F3F3', borderBottom: '1px solid #C8C8C8', padding: '4px 8px' } },
    React.createElement(
      'div',
      { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
      React.createElement(
        'div',
        { style: { display: 'flex', alignItems: 'center' } },
        React.createElement(
          'button',
          {
            onClick: onToggleSidebar,
            style: {
              color: '#000000',
              backgroundColor: 'transparent',
              border: 'none',
              padding: '4px 8px',
              cursor: 'pointer',
              fontSize: '14px',
              marginRight: '8px'
            },
            onMouseOver: (e) => e.target.style.backgroundColor = '#D0D0D0',
            onMouseOut: (e) => e.target.style.backgroundColor = 'transparent'
          },
          '☰'
        ),
        React.createElement(
          'h1',
          { style: { fontSize: '14px', fontWeight: '600', color: '#000000', margin: 0 } },
          '🏥 ZenHosp Desktop'
        )
      ),
      React.createElement(
        'div',
        { style: { position: 'relative' } },
        React.createElement(
          'button',
          {
            onClick: () => setShowUserMenu(!showUserMenu),
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: '#000000',
              backgroundColor: 'transparent',
              border: '1px solid #C8C8C8',
              padding: '4px 8px',
              cursor: 'pointer',
              fontSize: '13px'
            },
            onMouseOver: (e) => e.target.style.backgroundColor = '#E8E8E8',
            onMouseOut: (e) => e.target.style.backgroundColor = 'transparent'
          },
          React.createElement(
            'div',
            { style: { width: '24px', height: '24px', backgroundColor: '#0078D4', borderRadius: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF', fontSize: '12px', fontWeight: '600' } },
            user?.fullName?.charAt(0) || user?.username?.charAt(0) || 'U'
          ),
          React.createElement(
            'span',
            { style: { fontSize: '13px' } },
            user?.fullName || user?.username || 'User'
          ),
          React.createElement(
            'span',
            { style: { color: '#666666', fontSize: '10px' } },
            '▼'
          )
        ),
        showUserMenu && React.createElement(
          'div',
          { style: { position: 'absolute', right: 0, top: '100%', marginTop: '4px', width: '180px', backgroundColor: '#FFFFFF', border: '1px solid #C8C8C8', padding: '4px 0', zIndex: 50, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' } },
          React.createElement(
            'div',
            { style: { padding: '8px 12px', fontSize: '12px', color: '#000000', borderBottom: '1px solid #C8C8C8' } },
            React.createElement(
              'p',
              { style: { fontWeight: '600', margin: 0, marginBottom: '2px' } },
              user?.fullName || user?.username || 'User'
            ),
            React.createElement(
              'p',
              { style: { color: '#666666', margin: 0, fontSize: '11px' } },
              user?.role || 'User'
            )
          ),
          React.createElement(
            'button',
            {
              onClick: onLogout,
              style: {
                width: '100%',
                textAlign: 'left',
                padding: '6px 12px',
                fontSize: '13px',
                color: '#000000',
                backgroundColor: 'transparent',
                border: 'none',
                cursor: 'pointer'
              },
              onMouseOver: (e) => e.target.style.backgroundColor = '#F3F3F3',
              onMouseOut: (e) => e.target.style.backgroundColor = 'transparent'
            },
            'Sign out'
          )
        )
      )
    )
  );
};

export default Header;
