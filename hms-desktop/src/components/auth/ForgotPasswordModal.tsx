import React, { useState } from 'react';
import authService from '../../lib/api/services/authService';
import PasswordVisibilityIcon from './PasswordVisibilityIcon';

const ForgotPasswordModal = ({ isOpen, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    username: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Clear error when user starts typing
    if (error) setError('');
    if (success) setSuccess('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validation
    if (!formData.username || !formData.newPassword || !formData.confirmPassword) {
      setError('❌ Please fill in all fields');
      return;
    }

    if (formData.newPassword.length < 6) {
      setError('❌ New password must be at least 6 characters long');
      return;
    }

    if (formData.newPassword !== formData.confirmPassword) {
      setError('❌ Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      // Call the forgot password API
      await authService.forgotPassword(formData.username, formData.newPassword);
      
      setSuccess('✅ Password reset successfully! You can now login with your new password.');
      
      // Reset form
      setFormData({
        username: '',
        newPassword: '',
        confirmPassword: ''
      });

      // Close modal after 2 seconds
      setTimeout(() => {
        onSuccess && onSuccess();
        onClose();
      }, 2000);

    } catch (err) {
      if (err.response?.status === 404) {
        setError('❌ Username not found. Please check your username and try again.');
      } else if (err.response?.status === 400) {
        setError(`❌ ${err.response.data.message}`);
      } else {
        setError('❌ Failed to reset password. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setFormData({
        username: '',
        newPassword: '',
        confirmPassword: ''
      });
      setError('');
      setSuccess('');
      onClose();
    }
  };

  if (!isOpen) return null;

  return React.createElement(
    'div',
    {
      style: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }
    },
    React.createElement(
      'div',
      {
        style: {
          backgroundColor: 'white',
          padding: '30px',
          borderRadius: '8px',
          width: '90%',
          maxWidth: '400px',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
        }
      },
      // Header
      React.createElement(
        'div',
        {
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px'
          }
        },
        React.createElement(
          'h3',
          { style: { margin: 0, color: '#333', fontSize: '20px' } },
          '🔓 Reset Password'
        ),
        React.createElement(
          'button',
          {
            onClick: handleClose,
            disabled: loading,
            style: {
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: loading ? 'not-allowed' : 'pointer',
              color: '#666',
              padding: '0',
              width: '30px',
              height: '30px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }
          },
          '×'
        )
      ),

      // Form
      React.createElement(
        'form',
        { onSubmit: handleSubmit },
        React.createElement(
          'div',
          { style: { marginBottom: '20px' } },
          React.createElement(
            'label',
            { style: { display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#333' } },
            'Username *'
          ),
          React.createElement('input', {
            type: 'text',
            name: 'username',
            value: formData.username,
            onChange: handleInputChange,
            required: true,
            disabled: loading,
            placeholder: 'Enter your username',
            style: {
              width: '100%',
              padding: '10px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '14px',
              boxSizing: 'border-box'
            }
          })
        ),

        // New Password
        React.createElement(
          'div',
          { style: { marginBottom: '20px' } },
          React.createElement(
            'label',
            { style: { display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#333' } },
            'New Password *'
          ),
          React.createElement(
            'div',
            { style: { position: 'relative' } },
            React.createElement('input', {
              type: showNewPassword ? 'text' : 'password',
              name: 'newPassword',
              value: formData.newPassword,
              onChange: handleInputChange,
              required: true,
              disabled: loading,
              placeholder: 'Enter new password (min 6 characters)',
              style: {
                width: '100%',
                padding: '10px 35px 10px 10px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box'
              }
            }),
            React.createElement(
              'button',
              {
                type: 'button',
                onClick: () => setShowNewPassword(!showNewPassword),
                disabled: loading,
                'aria-label': showNewPassword ? 'Hide new password' : 'Show new password',
                title: showNewPassword ? 'Hide password' : 'Show password',
                style: {
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '16px',
                  color: '#666',
                  padding: '0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }
              },
              React.createElement(PasswordVisibilityIcon, { visible: showNewPassword })
            )
          )
        ),

        // Confirm Password
        React.createElement(
          'div',
          { style: { marginBottom: '20px' } },
          React.createElement(
            'label',
            { style: { display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#333' } },
            'Confirm New Password *'
          ),
          React.createElement(
            'div',
            { style: { position: 'relative' } },
            React.createElement('input', {
              type: showConfirmPassword ? 'text' : 'password',
              name: 'confirmPassword',
              value: formData.confirmPassword,
              onChange: handleInputChange,
              required: true,
              disabled: loading,
              placeholder: 'Confirm new password',
              style: {
                width: '100%',
                padding: '10px 35px 10px 10px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box'
              }
            }),
            React.createElement(
              'button',
              {
                type: 'button',
                onClick: () => setShowConfirmPassword(!showConfirmPassword),
                disabled: loading,
                'aria-label': showConfirmPassword ? 'Hide confirm password' : 'Show confirm password',
                title: showConfirmPassword ? 'Hide password' : 'Show password',
                style: {
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '16px',
                  color: '#666',
                  padding: '0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }
              },
              React.createElement(PasswordVisibilityIcon, { visible: showConfirmPassword })
            )
          )
        ),

        // Error Message
        error && React.createElement(
          'div',
          {
            style: {
              backgroundColor: '#f8d7da',
              color: '#721c24',
              padding: '10px',
              borderRadius: '4px',
              marginBottom: '15px',
              fontSize: '14px'
            }
          },
          error
        ),

        // Success Message
        success && React.createElement(
          'div',
          {
            style: {
              backgroundColor: '#d4edda',
              color: '#155724',
              padding: '10px',
              borderRadius: '4px',
              marginBottom: '15px',
              fontSize: '14px'
            }
          },
          success
        ),

        // Buttons
        React.createElement(
          'div',
          {
            style: {
              display: 'flex',
              gap: '10px',
              justifyContent: 'flex-end'
            }
          },
          React.createElement(
            'button',
            {
              type: 'button',
              onClick: handleClose,
              disabled: loading,
              style: {
                padding: '10px 20px',
                border: '1px solid #6c757d',
                borderRadius: '4px',
                backgroundColor: 'white',
                color: '#6c757d',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '14px'
              }
            },
            'Cancel'
          ),
          React.createElement(
            'button',
            {
              type: 'submit',
              disabled: loading,
              style: {
                padding: '10px 20px',
                border: 'none',
                borderRadius: '4px',
                backgroundColor: loading ? '#6c757d' : '#007bff',
                color: 'white',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: 'bold'
              }
            },
            loading ? 'Resetting...' : 'Reset Password'
          )
        )
      )
    )
  );
};

export default ForgotPasswordModal;
