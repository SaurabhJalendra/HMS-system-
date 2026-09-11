import React, { useState } from 'react';
import userService from '../../lib/api/services/userService';
import PasswordVisibilityIcon from './PasswordVisibilityIcon';

const ChangePasswordModal = ({ isOpen, onClose, onSuccess }: any) => {
  const [formData, setFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
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
    if (!formData.currentPassword || !formData.newPassword || !formData.confirmPassword) {
      setError('All fields are required');
      return;
    }

    if (formData.newPassword.length < 6) {
      setError('New password must be at least 6 characters long');
      return;
    }

    if (formData.newPassword !== formData.confirmPassword) {
      setError('New password and confirm password do not match');
      return;
    }

    if (formData.currentPassword === formData.newPassword) {
      setError('New password must be different from current password');
      return;
    }

    setLoading(true);

    try {
      await userService.changePassword(formData.currentPassword, formData.newPassword);
      setSuccess('Password changed successfully!');
      
      // Reset form
      setFormData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });

      // Call success callback after a delay
      setTimeout(() => {
        onSuccess && onSuccess();
        onClose();
      }, 2000);

    } catch (error) {
      console.error('Password change error:', error);
      setError(error.response?.data?.message || 'Failed to change password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setFormData({
        currentPassword: '',
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
      className: 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50',
      onClick: handleClose
    },
    React.createElement(
      'div',
      {
        className: 'bg-white rounded-lg p-6 w-full max-w-md mx-4',
        onClick: (e) => e.stopPropagation()
      },
      React.createElement(
        'div',
        { className: 'flex justify-between items-center mb-4' },
        React.createElement(
          'h2',
          { className: 'text-xl font-semibold text-gray-900' },
          '🔐 Change Password'
        ),
        React.createElement(
          'button',
          {
            onClick: handleClose,
            disabled: loading,
            className: 'text-gray-400 hover:text-gray-600 disabled:opacity-50'
          },
          '✕'
        )
      ),

      React.createElement(
        'form',
        { onSubmit: handleSubmit },
        React.createElement(
          'div',
          { className: 'space-y-4' },
          // Current Password
          React.createElement(
            'div',
            null,
            React.createElement(
              'label',
              { className: 'block text-sm font-medium text-gray-700 mb-1' },
              'Current Password'
            ),
            React.createElement(
              'div',
              { className: 'relative' },
              React.createElement(
                'input',
                {
                  type: showCurrentPassword ? 'text' : 'password',
                  name: 'currentPassword',
                  value: formData.currentPassword,
                  onChange: handleInputChange,
                  required: true,
                  disabled: loading,
                  className: 'w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50',
                  placeholder: 'Enter current password'
                }
              ),
              React.createElement(
                'button',
                {
                  type: 'button',
                  onClick: () => setShowCurrentPassword(!showCurrentPassword),
                  disabled: loading,
                  'aria-label': showCurrentPassword ? 'Hide current password' : 'Show current password',
                  title: showCurrentPassword ? 'Hide password' : 'Show password',
                  className: 'absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 disabled:opacity-50'
                },
                React.createElement(PasswordVisibilityIcon, { visible: showCurrentPassword })
              )
            )
          ),

          // New Password
          React.createElement(
            'div',
            null,
            React.createElement(
              'label',
              { className: 'block text-sm font-medium text-gray-700 mb-1' },
              'New Password'
            ),
            React.createElement(
              'div',
              { className: 'relative' },
              React.createElement(
                'input',
                {
                  type: showNewPassword ? 'text' : 'password',
                  name: 'newPassword',
                  value: formData.newPassword,
                  onChange: handleInputChange,
                  required: true,
                  disabled: loading,
                  className: 'w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50',
                  placeholder: 'Enter new password (min 6 characters)'
                }
              ),
              React.createElement(
                'button',
                {
                  type: 'button',
                  onClick: () => setShowNewPassword(!showNewPassword),
                  disabled: loading,
                  'aria-label': showNewPassword ? 'Hide new password' : 'Show new password',
                  title: showNewPassword ? 'Hide password' : 'Show password',
                  className: 'absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 disabled:opacity-50'
                },
                React.createElement(PasswordVisibilityIcon, { visible: showNewPassword })
              )
            )
          ),

          // Confirm Password
          React.createElement(
            'div',
            null,
            React.createElement(
              'label',
              { className: 'block text-sm font-medium text-gray-700 mb-1' },
              'Confirm New Password'
            ),
            React.createElement(
              'div',
              { className: 'relative' },
              React.createElement(
                'input',
                {
                  type: showConfirmPassword ? 'text' : 'password',
                  name: 'confirmPassword',
                  value: formData.confirmPassword,
                  onChange: handleInputChange,
                  required: true,
                  disabled: loading,
                  className: 'w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50',
                  placeholder: 'Confirm new password'
                }
              ),
              React.createElement(
                'button',
                {
                  type: 'button',
                  onClick: () => setShowConfirmPassword(!showConfirmPassword),
                  disabled: loading,
                  'aria-label': showConfirmPassword ? 'Hide confirm password' : 'Show confirm password',
                  title: showConfirmPassword ? 'Hide password' : 'Show password',
                  className: 'absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 disabled:opacity-50'
                },
                React.createElement(PasswordVisibilityIcon, { visible: showConfirmPassword })
              )
            )
          )
        ),

        // Error Message
        error && React.createElement(
          'div',
          { className: 'mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md' },
          error
        ),

        // Success Message
        success && React.createElement(
          'div',
          { className: 'mt-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-md' },
          success
        ),

        // Buttons
        React.createElement(
          'div',
          { className: 'flex justify-end space-x-3 mt-6' },
          React.createElement(
            'button',
            {
              type: 'button',
              onClick: handleClose,
              disabled: loading,
              className: 'px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50'
            },
            'Cancel'
          ),
          React.createElement(
            'button',
            {
              type: 'submit',
              disabled: loading,
              className: 'px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center'
            },
            loading && React.createElement(
              'svg',
              {
                className: 'animate-spin -ml-1 mr-2 h-4 w-4 text-white',
                xmlns: 'http://www.w3.org/2000/svg',
                fill: 'none',
                viewBox: '0 0 24 24'
              },
              React.createElement(
                'circle',
                {
                  className: 'opacity-25',
                  cx: '12',
                  cy: '12',
                  r: '10',
                  stroke: 'currentColor',
                  strokeWidth: '4'
                }
              ),
              React.createElement(
                'path',
                {
                  className: 'opacity-75',
                  fill: 'currentColor',
                  d: 'M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'
                }
              )
            ),
            loading ? 'Changing...' : 'Change Password'
          )
        )
      )
    )
  );
};

export default ChangePasswordModal;
