import React, { useState } from 'react';

const LoginForm = ({ onLogin, isLoading, logoUrl, hospitalName }) => {
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });
  const [error, setError] = useState('');

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    setError(''); // Clear error when user types
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.username || !formData.password) {
      setError('Please fill in all fields');
      return;
    }

    const result = await onLogin(formData);
    if (!result.success) {
      setError(result.message);
    }
  };

  return React.createElement(
    'div',
    { style: { maxWidth: '400px', width: '100%', display: 'flex', flexDirection: 'column', gap: '16px', backgroundColor: '#FFFFFF', border: '1px solid #C8C8C8', padding: '24px' } },
    React.createElement(
      'div',
      { style: { textAlign: 'center' } },
      logoUrl
        ? React.createElement('img', {
            src: logoUrl,
            alt: hospitalName || 'Hospital logo',
            style: { maxWidth: '180px', maxHeight: '72px', objectFit: 'contain', marginBottom: '12px' },
          })
        : null,
      React.createElement(
        'h2',
        { style: { fontSize: '18px', fontWeight: '600', color: '#000000', margin: 0, marginBottom: '8px' } },
        hospitalName || 'ZenHosp Desktop'
      ),
      React.createElement(
        'p',
        { style: { fontSize: '13px', color: '#666666', margin: 0 } },
        'Sign in to your account'
      )
    ),
    React.createElement(
      'form',
      { style: { display: 'flex', flexDirection: 'column', gap: '12px' }, onSubmit: handleSubmit },
      React.createElement(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
        React.createElement(
          'div',
          null,
          React.createElement(
            'label',
            { htmlFor: 'username', style: { display: 'block', fontSize: '13px', fontWeight: '500', color: '#000000', marginBottom: '4px' } },
            'Username'
          ),
          React.createElement(
            'input',
            {
              id: 'username',
              name: 'username',
              type: 'text',
              required: true,
              value: formData.username,
              onChange: handleInputChange,
              style: { width: '100%', padding: '6px 8px', border: '1px solid #C8C8C8', fontSize: '13px', backgroundColor: '#FFFFFF' },
              placeholder: 'Enter your username'
            }
          )
        ),
        React.createElement(
          'div',
          null,
          React.createElement(
            'label',
            { htmlFor: 'password', style: { display: 'block', fontSize: '13px', fontWeight: '500', color: '#000000', marginBottom: '4px' } },
            'Password'
          ),
          React.createElement(
            'input',
            {
              id: 'password',
              name: 'password',
              type: 'password',
              required: true,
              value: formData.password,
              onChange: handleInputChange,
              style: { width: '100%', padding: '6px 8px', border: '1px solid #C8C8C8', fontSize: '13px', backgroundColor: '#FFFFFF' },
              placeholder: 'Enter your password'
            }
          )
        )
      ),
      error && React.createElement(
        'div',
        { style: { color: '#C4281C', fontSize: '12px', textAlign: 'center', padding: '4px', backgroundColor: '#FFF4F4', border: '1px solid #FFB3B3' } },
        error
      ),
      React.createElement(
        'div',
        null,
        React.createElement(
          'button',
          {
            type: 'submit',
            disabled: isLoading,
            style: {
              width: '100%',
              padding: '6px 12px',
              border: '1px solid',
              borderColor: isLoading ? '#C8C8C8' : '#005A9E',
              fontSize: '13px',
              fontWeight: '400',
              color: '#FFFFFF',
              backgroundColor: isLoading ? '#C8C8C8' : '#0078D4',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              boxShadow: isLoading ? 'none' : 'inset 0 1px 0 0 rgba(255, 255, 255, 0.2)'
            },
            onMouseOver: (e) => {
              if (!isLoading) {
                e.target.style.backgroundColor = '#005A9E';
              }
            },
            onMouseOut: (e) => {
              if (!isLoading) {
                e.target.style.backgroundColor = '#0078D4';
              }
            }
          },
          isLoading ? 'Signing in...' : 'Sign in'
        )
      )
    )
  );
};

export default LoginForm;
