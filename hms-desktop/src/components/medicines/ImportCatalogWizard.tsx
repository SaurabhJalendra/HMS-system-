import React, { useState } from 'react';
import medicineService from '../../lib/api/services/medicineService';

const ImportCatalogWizard = ({ onBack, onSuccess, user, isAuthenticated }) => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      const extension = selectedFile.name.toLowerCase().split('.').pop();
      
      if (['xlsx', 'xls'].includes(extension || '')) {
        setFile(selectedFile);
        setError('');
      } else {
        setError('Only Excel files (.xlsx or .xls) are accepted.');
        setFile(null);
        e.target.value = '';
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Check authentication before making API call
    if (!isAuthenticated || !user) {
      setError('Please log in to import medicines');
      setLoading(false);
      return;
    }
    
    if (!file) {
      setError('Please select a file to upload');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await medicineService.importCatalog(file);
      
      if (response.success) {
        let successMessage = `Successfully imported ${response.data.importedCount || response.data.imported.length} medicines`;
        if (response.data.deletedCount > 0) {
          successMessage += `. ${response.data.deletedCount} medicines not in file were removed.`;
        }
        setSuccess(successMessage);
        
        // Show warnings separately (not as errors)
        const allMessages = [];
        if (response.data.errors && response.data.errors.length > 0) {
          allMessages.push(...response.data.errors);
        }
        if (response.data.warnings && response.data.warnings.length > 0) {
          // Warnings are informational, show them but don't treat as errors
          allMessages.push(...response.data.warnings);
        }
        
        if (allMessages.length > 0) {
          setError(`Some issues occurred: ${allMessages.join(', ')}`);
        }
        
        // Call success callback after a delay to show the message
        setTimeout(() => {
          onSuccess && onSuccess(response.data);
        }, 2000);
      } else {
        setError(response.message || 'Import failed');
      }
    } catch (err) {
      console.error('Import error:', err);
      
      // Check for network/connection errors
      if (err.code === 'ERR_NETWORK' || err.message === 'Network Error' || !err.response) {
        setError('Cannot connect to backend server. Please ensure the backend server is running on http://localhost:3000');
      } else if (err.response?.status === 400) {
        setError(err.response?.data?.message || 'Invalid file format or data. Please check the file and try again.');
      } else if (err.response?.status === 500) {
        setError(err.response?.data?.message || 'Server error occurred. Please check the backend logs.');
      } else {
        setError(err.response?.data?.message || 'Error importing catalog. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return React.createElement(
    'div',
    { className: 'min-h-screen bg-gray-50 py-8 px-4' },
    React.createElement(
      'div',
      { className: 'max-w-2xl mx-auto' },
      // Header
      React.createElement(
        'div',
        { className: 'mb-8' },
        React.createElement(
          'button',
          {
            onClick: onBack,
            className: 'text-blue-600 hover:text-blue-800 mb-4 flex items-center'
          },
          React.createElement('span', { className: 'mr-2' }, '←'),
          'Back to Medicine Management'
        ),
        React.createElement(
          'h1',
          { className: 'text-3xl font-bold text-gray-900' },
          'Import Medicine Catalog'
        ),
        React.createElement(
          'p',
          { className: 'text-gray-600 mt-2' },
          'Upload an Excel file containing medicine information to bulk import medicines into the system.'
        )
      ),

      // Form
      React.createElement(
        'div',
        { className: 'bg-white rounded-lg shadow-md p-6' },
        React.createElement(
          'form',
          { onSubmit: handleSubmit },
          // File upload section
          React.createElement(
            'div',
            { className: 'mb-6' },
            React.createElement(
              'label',
              { className: 'block text-sm font-medium text-gray-700 mb-2' },
              'Select File'
            ),
            React.createElement(
              'div',
              { className: 'border-2 border-dashed border-gray-300 rounded-lg p-6 text-center' },
              React.createElement(
                'input',
                {
                  type: 'file',
                  onChange: handleFileChange,
                  accept: '.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel',
                  className: 'hidden',
                  id: 'file-upload'
                }
              ),
              React.createElement(
                'label',
                {
                  htmlFor: 'file-upload',
                  className: 'cursor-pointer'
                },
                React.createElement(
                  'div',
                  { className: 'text-gray-500' },
                  React.createElement(
                    'svg',
                    {
                      className: 'mx-auto h-12 w-12 text-gray-400',
                      stroke: 'currentColor',
                      fill: 'none',
                      viewBox: '0 0 48 48'
                    },
                    React.createElement(
                      'path',
                      {
                        d: 'M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02',
                        strokeWidth: 2,
                        strokeLinecap: 'round',
                        strokeLinejoin: 'round'
                      }
                    )
                  ),
                  React.createElement(
                    'p',
                    { className: 'mt-2' },
                    file ? file.name : 'Click to upload or drag and drop'
                  ),
                  React.createElement(
                    'p',
                    { className: 'text-xs text-gray-400 mt-1' },
                    'Excel (.xlsx or .xls) only, up to 10MB'
                  )
                )
              )
            )
          ),

          // File format instructions
          React.createElement(
            'div',
            { className: 'mb-6 p-4 bg-blue-50 rounded-lg' },
            React.createElement(
              'h3',
              { className: 'text-sm font-medium text-blue-800 mb-2' },
              'Expected File Format'
            ),
            React.createElement(
              'div',
              { className: 'text-sm text-blue-700' },
              React.createElement('p', { className: 'mb-2 font-medium' }, 'Required Excel columns (they may appear in any order):'),
              React.createElement('ul', { className: 'list-disc list-inside ml-4' },
                React.createElement('li', null, 'Medicine Name (required)'),
                React.createElement('li', null, 'Generic Name (required)'),
                React.createElement('li', null, 'Manufacturer (required)'),
                React.createElement('li', null, 'Category (required)'),
                React.createElement('li', null, 'Price (required)'),
                React.createElement('li', null, 'Stock Quantity (required)'),
                React.createElement('li', null, 'Low Stock Threshold (required)')
              ),
              React.createElement('p', { className: 'mt-2' }, 'Optional columns: ATC Code, Therapeutic Class, Expiry Date. Values are mapped by column header, not column position.')
            )
          ),

          // Error/Success messages
          error && React.createElement(
            'div',
            { className: 'mb-4 p-4 bg-red-50 border border-red-200 rounded-lg' },
            React.createElement(
              'p',
              { className: 'text-red-800' },
              error
            )
          ),

          success && React.createElement(
            'div',
            { className: 'mb-4 p-4 bg-green-50 border border-green-200 rounded-lg' },
            React.createElement(
              'p',
              { className: 'text-green-800' },
              success
            )
          ),

          // Submit button
          React.createElement(
            'div',
            { className: 'flex justify-end space-x-4' },
            React.createElement(
              'button',
              {
                type: 'button',
                onClick: onBack,
                className: 'px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300'
              },
              'Cancel'
            ),
            React.createElement(
              'button',
              {
                type: 'submit',
                disabled: !file || loading,
                className: `px-6 py-2 rounded-lg font-medium ${
                  !file || loading
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`
              },
              loading ? 'Importing...' : 'Import Catalog'
            )
          )
        )
      )
    )
  );
};

export default ImportCatalogWizard;
