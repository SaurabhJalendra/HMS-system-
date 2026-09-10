import React, { useState, useEffect } from 'react';
import medicineService from '../../lib/api/services/medicineService';
import { useHospitalConfig } from '../../lib/contexts/HospitalConfigContext';
import { autoSelectIfZero, autoSelectIfZeroMouseDown } from '../../lib/utils/numberInput';

const OrderManagement = ({ onBack, onInventoryChanged }) => {
  const { formatCurrency, formatDate: formatDateUtil } = useHospitalConfig();
  const [activeTab, setActiveTab] = useState('orders'); // 'orders', 'new-order', 'suppliers'
  const [orders, setOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // New order form state
  const [newOrder, setNewOrder] = useState({
    supplierId: '',
    expectedDelivery: '',
    notes: '',
    orderItems: []
  });

  // Supplier form state
  const [newSupplier, setNewSupplier] = useState({
    name: '',
    address: '',
    contact: '',
    email: '',
    gstNumber: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [ordersRes, suppliersRes, medicinesRes] = await Promise.all([
        medicineService.getOrders().catch(err => {
          console.error('Error loading orders:', err);
          return { success: false, error: err };
        }),
        medicineService.getSuppliers().catch(err => {
          console.error('Error loading suppliers:', err);
          return { success: false, error: err };
        }),
        medicineService.getMedicines().catch(err => {
          console.error('Error loading medicines:', err);
          return { success: false, error: err };
        })
      ]);

      // Handle orders response - the service returns response.data, so ordersRes is already unwrapped
      if (ordersRes && ordersRes.success !== false) {
        if (ordersRes.data && ordersRes.data.orders) {
          // Expected structure: { success: true, data: { orders: [] } }
          setOrders(ordersRes.data.orders || []);
        } else if (ordersRes.orders) {
          // Fallback: direct orders array
          setOrders(ordersRes.orders || []);
        } else if (Array.isArray(ordersRes)) {
          // Fallback: response is directly an array
          setOrders(ordersRes);
        } else {
          setOrders([]);
          console.warn('Unexpected orders response structure:', ordersRes);
        }
      } else {
        setOrders([]);
        if (ordersRes?.error) {
          console.error('Orders API error:', ordersRes.error);
        }
      }

      // Handle suppliers response
      if (suppliersRes && suppliersRes.success !== false) {
        if (suppliersRes.data && suppliersRes.data.suppliers) {
          // Expected structure: { success: true, data: { suppliers: [] } }
          setSuppliers(suppliersRes.data.suppliers || []);
        } else if (suppliersRes.suppliers) {
          // Fallback: direct suppliers array
          setSuppliers(suppliersRes.suppliers || []);
        } else if (Array.isArray(suppliersRes)) {
          // Fallback: response is directly an array
          setSuppliers(suppliersRes);
        } else {
          setSuppliers([]);
          console.warn('Unexpected suppliers response structure:', suppliersRes);
        }
      } else {
        setSuppliers([]);
        if (suppliersRes?.error) {
          console.error('Suppliers API error:', suppliersRes.error);
        }
      }

      // Handle medicines response
      if (medicinesRes && medicinesRes.success !== false) {
        if (medicinesRes.data) {
          // Could be { success: true, data: { medicines: [] } } or { success: true, data: { prescriptions: [] } }
          setMedicines(medicinesRes.data.medicines || medicinesRes.data.prescriptions || (Array.isArray(medicinesRes.data) ? medicinesRes.data : []) || []);
        } else if (medicinesRes.medicines) {
          // Fallback: direct medicines array
          setMedicines(medicinesRes.medicines || []);
        } else if (Array.isArray(medicinesRes)) {
          // Fallback: response is directly an array
          setMedicines(medicinesRes);
        } else {
          setMedicines([]);
          console.warn('Unexpected medicines response structure:', medicinesRes);
        }
      } else {
        setMedicines([]);
        if (medicinesRes?.error) {
          console.error('Medicines API error:', medicinesRes.error);
        }
      }

      // Set error message if any API call failed
      const errors = [];
      if (ordersRes?.error) errors.push('Orders: ' + (ordersRes.error.response?.data?.message || ordersRes.error.message));
      if (suppliersRes?.error) errors.push('Suppliers: ' + (suppliersRes.error.response?.data?.message || suppliersRes.error.message));
      if (medicinesRes?.error) errors.push('Medicines: ' + (medicinesRes.error.response?.data?.message || medicinesRes.error.message));
      
      if (errors.length > 0) {
        setError('Error loading data: ' + errors.join(', '));
      }
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Error loading data: ' + (err.response?.data?.message || err.message || 'Unknown error'));
      // Set empty arrays on error to prevent further errors
      setOrders([]);
      setSuppliers([]);
      setMedicines([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddOrderItem = (source) => {
    setNewOrder(prev => ({
      ...prev,
      orderItems: [...prev.orderItems, {
        source,
        medicineId: '',
        quantity: 1,
        unitPrice: 0,
        newMedicine: source === 'new' ? {
          name: '',
          genericName: '',
          manufacturer: '',
          category: '',
          code: '',
          lowStockThreshold: 10
        } : undefined
      }]
    }));
  };

  const handleOrderItemChange = (index, field, value) => {
    setNewOrder(prev => ({
      ...prev,
      orderItems: prev.orderItems.map((item, i) => 
        i === index ? { ...item, [field]: value } : item
      )
    }));
  };

  const handleNewMedicineChange = (index, field, value) => {
    setNewOrder(prev => ({
      ...prev,
      orderItems: prev.orderItems.map((item, itemIndex) =>
        itemIndex === index
          ? { ...item, newMedicine: { ...item.newMedicine, [field]: value } }
          : item
      )
    }));
  };

  const handleRemoveOrderItem = (index) => {
    setNewOrder(prev => ({
      ...prev,
      orderItems: prev.orderItems.filter((_, i) => i !== index)
    }));
  };

  const handleViewOrder = (orderId) => {
    try {
      // Find order in the list
      const order = orders.find(o => o.id === orderId);
      if (order) {
        // Show order details in a modal or alert
        const itemsList = order.orderItems?.map((item, idx) => 
          `  ${idx + 1}. ${item.medicine?.name || 'Medicine'} - Qty: ${item.quantity} - Price: ${formatCurrency(item.unitPrice || 0)}`
        ).join('\n') || 'No items';
        
        const orderDetails = `
Order Details:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Order Number: ${order.orderNumber || 'N/A'}
Supplier: ${order.supplier?.name || 'N/A'}
Status: ${order.status || 'N/A'}
Total Amount: ${formatCurrency(order.totalAmount || 0)}
Order Date: ${formatDateUtil(order.orderDate)}
Expected Delivery: ${order.expectedDelivery ? formatDateUtil(order.expectedDelivery) : 'N/A'}
Notes: ${order.notes || 'None'}

Order Items:
${itemsList}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        `;
        alert(orderDetails);
      } else {
        setError('Order not found');
      }
    } catch (err) {
      setError('Failed to display order details: ' + (err.message || 'Unknown error'));
    }
  };

  const handleCreateOrder = async (e) => {
    e.preventDefault();
    if (newOrder.orderItems.length === 0) {
      setError('Please add at least one medicine to the order');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await medicineService.createOrder(newOrder);
      if (response.success) {
        setSuccess('Order created successfully!');
        setNewOrder({
          supplierId: '',
          expectedDelivery: '',
          notes: '',
          orderItems: []
        });
        loadData(); // Reload orders
        setActiveTab('orders');
      } else {
        setError(response.message || 'Failed to create order');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Error creating order');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkDelivered = async (order) => {
    if (!window.confirm(`Mark order ${order.orderNumber} as delivered and add all ordered quantities to inventory?`)) {
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const response = await medicineService.updateOrderStatus(order.id, {
        status: 'DELIVERED',
        actualDelivery: new Date().toISOString()
      });
      if (!response.success) {
        setError(response.message || 'Failed to mark order as delivered');
        return;
      }
      setSuccess('Order marked as delivered and inventory stock updated.');
      await loadData();
      await onInventoryChanged?.();
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to mark order as delivered');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSupplier = async (e) => {
    e.preventDefault();
    if (!newSupplier.gstNumber.trim()) {
      setError('GST number is required');
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await medicineService.createSupplier(newSupplier);
      if (response.success) {
        setSuccess('Supplier created successfully!');
        setNewSupplier({
          name: '',
          address: '',
          contact: '',
          email: '',
          gstNumber: ''
        });
        loadData(); // Reload suppliers
      } else {
        setError(response.message || 'Failed to create supplier');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Error creating supplier');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      PENDING: 'bg-yellow-100 text-yellow-800',
      CONFIRMED: 'bg-blue-100 text-blue-800',
      SHIPPED: 'bg-purple-100 text-purple-800',
      DELIVERED: 'bg-green-100 text-green-800',
      CANCELLED: 'bg-red-100 text-red-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const renderOrdersTab = () => (
    React.createElement(
      'div',
      { className: 'space-y-6' },
      // Orders table
      React.createElement(
        'div',
        { className: 'bg-white rounded-lg shadow overflow-hidden' },
        React.createElement(
          'div',
          { className: 'px-6 py-4 border-b border-gray-200' },
          React.createElement(
            'h3',
            { className: 'text-lg font-medium text-gray-900' },
            `Orders (${orders.length})`
          )
        ),
        orders.length === 0 ? React.createElement(
          'div',
          { className: 'px-6 py-8 text-center text-gray-500' },
          'No orders found'
        ) : React.createElement(
          'div',
          { className: 'overflow-x-auto' },
          React.createElement(
            'table',
            { className: 'min-w-full divide-y divide-gray-200' },
            React.createElement(
              'thead',
              { className: 'bg-gray-50' },
              React.createElement(
                'tr',
                null,
                React.createElement('th', { className: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider' }, 'Order #'),
                React.createElement('th', { className: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider' }, 'Supplier'),
                React.createElement('th', { className: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider' }, 'Date'),
                React.createElement('th', { className: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider' }, 'Status'),
                React.createElement('th', { className: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider' }, 'Total'),
                React.createElement('th', { className: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider' }, 'Actions')
              )
            ),
            React.createElement(
              'tbody',
              { className: 'bg-white divide-y divide-gray-200' },
              orders.map(order => React.createElement(
                'tr',
                { key: order.id, className: 'hover:bg-gray-50' },
                React.createElement(
                  'td',
                  { className: 'px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900' },
                  order.orderNumber
                ),
                React.createElement(
                  'td',
                  { className: 'px-6 py-4 whitespace-nowrap text-sm text-gray-500' },
                  order.supplier?.name || 'N/A'
                ),
                React.createElement(
                  'td',
                  { className: 'px-6 py-4 whitespace-nowrap text-sm text-gray-500' },
                  formatDateUtil(order.orderDate)
                ),
                React.createElement(
                  'td',
                  { className: 'px-6 py-4 whitespace-nowrap' },
                  React.createElement(
                    'span',
                    { className: `px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(order.status)}` },
                    order.status
                  )
                ),
                React.createElement(
                  'td',
                  { className: 'px-6 py-4 whitespace-nowrap text-sm text-gray-500' },
                  formatCurrency(order.totalAmount || 0)
                ),
                React.createElement(
                  'td',
                  { className: 'px-6 py-4 whitespace-nowrap text-sm font-medium' },
                  React.createElement(
                    'button',
                    {
                      className: 'text-blue-600 hover:text-blue-900 cursor-pointer mr-3',
                      onClick: () => handleViewOrder(order.id)
                    },
                    'View'
                  ),
                  !['DELIVERED', 'CANCELLED'].includes(order.status) && React.createElement(
                    'button',
                    {
                      className: 'text-green-700 hover:text-green-900 cursor-pointer disabled:opacity-50',
                      onClick: () => handleMarkDelivered(order),
                      disabled: loading
                    },
                    'Mark Delivered'
                  )
                )
              ))
            )
          )
        )
      )
    )
  );

  const renderNewOrderTab = () => (
    React.createElement(
      'div',
      { className: 'space-y-6' },
      React.createElement(
        'form',
        { onSubmit: handleCreateOrder },
        // Supplier selection
        React.createElement(
          'div',
          { className: 'bg-white rounded-lg shadow p-6' },
          React.createElement(
            'h3',
            { className: 'text-lg font-medium text-gray-900 mb-4' },
            'Order Details'
          ),
          React.createElement(
            'div',
            { className: 'grid grid-cols-1 md:grid-cols-2 gap-4' },
            React.createElement(
              'div',
              null,
              React.createElement(
                'label',
                { className: 'block text-sm font-medium text-gray-700 mb-2' },
                'Supplier *'
              ),
              React.createElement(
                'select',
                {
                  value: newOrder.supplierId,
                  onChange: (e) => setNewOrder(prev => ({ ...prev, supplierId: e.target.value })),
                  className: 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
                  required: true
                },
                React.createElement('option', { value: '' }, 'Select Supplier'),
                ...suppliers.map(supplier => React.createElement(
                  'option',
                  { key: supplier.id, value: supplier.id },
                  supplier.name
                ))
              )
            ),
            React.createElement(
              'div',
              null,
              React.createElement(
                'label',
                { className: 'block text-sm font-medium text-gray-700 mb-2' },
                'Expected Delivery'
              ),
              React.createElement(
                'input',
                {
                  type: 'date',
                  value: newOrder.expectedDelivery,
                  onChange: (e) => setNewOrder(prev => ({ ...prev, expectedDelivery: e.target.value })),
                  className: 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                }
              )
            )
          ),
          React.createElement(
            'div',
            { className: 'mt-4' },
            React.createElement(
              'label',
              { className: 'block text-sm font-medium text-gray-700 mb-2' },
              'Notes'
            ),
            React.createElement(
              'textarea',
              {
                value: newOrder.notes,
                onChange: (e) => setNewOrder(prev => ({ ...prev, notes: e.target.value })),
                className: 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
                rows: 3
              }
            )
          )
        ),

        // Order items
        React.createElement(
          'div',
          { className: 'bg-white rounded-lg shadow p-6' },
          React.createElement(
            'div',
            { className: 'flex justify-between items-center mb-4' },
            React.createElement(
              'h3',
              { className: 'text-lg font-medium text-gray-900' },
              'Order Items'
            ),
            React.createElement(
              'div',
              { className: 'flex gap-2' },
              React.createElement(
                'button',
                {
                  type: 'button',
                  onClick: () => handleAddOrderItem('inventory'),
                  className: 'px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700'
                },
                '+ Select from Inventory'
              ),
              React.createElement(
                'button',
                {
                  type: 'button',
                  onClick: () => handleAddOrderItem('new'),
                  className: 'px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700'
                },
                '+ Add a New Item'
              )
            )
          ),
          newOrder.orderItems.length === 0 ? React.createElement(
            'div',
            { className: 'text-center py-8 text-gray-500' },
            'No items added yet. Click "Add Item" to start.'
          ) : React.createElement(
            'div',
            { className: 'space-y-4' },
            ...newOrder.orderItems.map((item, index) => React.createElement(
              'div',
              { key: index, className: 'grid grid-cols-1 md:grid-cols-4 gap-4 items-end border border-gray-200 rounded-lg p-4' },
              item.source === 'inventory' && React.createElement(
                'div',
                { className: 'md:col-span-2' },
                React.createElement(
                  'label',
                  { className: 'block text-sm font-medium text-gray-700 mb-2' },
                  'Select from Inventory *'
                ),
                React.createElement(
                  'select',
                  {
                    value: item.medicineId,
                    onChange: (e) => handleOrderItemChange(index, 'medicineId', e.target.value),
                    className: 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
                    required: true
                  },
                  React.createElement('option', { value: '' }, 'Select Medicine'),
                  ...medicines.map(medicine => React.createElement(
                    'option',
                    { key: medicine.id, value: medicine.id },
                    medicine.name
                  ))
                )
              ),
              item.source === 'new' && React.createElement(
                React.Fragment,
                null,
                ...[
                  ['name', 'Medicine Name *', 'text'],
                  ['genericName', 'Generic Name *', 'text'],
                  ['manufacturer', 'Manufacturer *', 'text'],
                  ['category', 'Category *', 'text'],
                  ['code', 'Medicine Code', 'text'],
                  ['lowStockThreshold', 'Low Stock Alert *', 'number']
                ].map(([field, label, type]) => React.createElement(
                  'div',
                  { key: field },
                  React.createElement('label', { className: 'block text-sm font-medium text-gray-700 mb-2' }, label),
                  React.createElement('input', {
                    type,
                    min: type === 'number' ? 0 : undefined,
                    value: item.newMedicine?.[field] ?? '',
                    onChange: (event) => handleNewMedicineChange(
                      index,
                      field,
                      type === 'number' ? Number(event.target.value) : event.target.value
                    ),
                    required: label.endsWith('*'),
                    className: 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                  })
                ))
              ),
              React.createElement(
                'div',
                null,
                React.createElement(
                  'label',
                  { className: 'block text-sm font-medium text-gray-700 mb-2' },
                  'Quantity'
                ),
                React.createElement(
                  'input',
                  {
                    type: 'number',
                    min: 1,
                    value: item.quantity,
                    onChange: (e) => handleOrderItemChange(index, 'quantity', parseInt(e.target.value)),
                    onFocus: autoSelectIfZero,
                    onMouseDown: autoSelectIfZeroMouseDown,
                    className: 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
                    required: true
                  }
                )
              ),
              React.createElement(
                'div',
                null,
                React.createElement(
                  'label',
                  { className: 'block text-sm font-medium text-gray-700 mb-2' },
                  'Unit Price'
                ),
                React.createElement(
                  'input',
                  {
                    type: 'number',
                    min: 0.01,
                    step: 0.01,
                    value: item.unitPrice,
                    onChange: (e) => handleOrderItemChange(index, 'unitPrice', parseFloat(e.target.value)),
                    onFocus: autoSelectIfZero,
                    onMouseDown: autoSelectIfZeroMouseDown,
                    className: 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
                    required: true
                  }
                )
              ),
              React.createElement(
                'button',
                {
                  type: 'button',
                  onClick: () => handleRemoveOrderItem(index),
                  className: 'px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700'
                },
                'Remove'
              )
            ))
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
              onClick: () => setActiveTab('orders'),
              className: 'px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300'
            },
            'Cancel'
          ),
          React.createElement(
            'button',
            {
              type: 'submit',
              disabled: loading || newOrder.orderItems.length === 0,
              className: `px-6 py-2 rounded-lg font-medium ${
                loading || newOrder.orderItems.length === 0
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`
            },
            loading ? 'Creating...' : 'Create Order'
          )
        )
      )
    )
  );

  const renderSuppliersTab = () => (
    React.createElement(
      'div',
      { className: 'space-y-6' },
      // Suppliers list
      React.createElement(
        'div',
        { className: 'bg-white rounded-lg shadow overflow-hidden' },
        React.createElement(
          'div',
          { className: 'px-6 py-4 border-b border-gray-200' },
          React.createElement(
            'h3',
            { className: 'text-lg font-medium text-gray-900' },
            `Suppliers (${suppliers.length})`
          )
        ),
        suppliers.length === 0 ? React.createElement(
          'div',
          { className: 'px-6 py-8 text-center text-gray-500' },
          'No suppliers found'
        ) : React.createElement(
          'div',
          { className: 'overflow-x-auto' },
          React.createElement(
            'table',
            { className: 'min-w-full divide-y divide-gray-200' },
            React.createElement(
              'thead',
              { className: 'bg-gray-50' },
              React.createElement(
                'tr',
                null,
                React.createElement('th', { className: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider' }, 'Name'),
                React.createElement('th', { className: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider' }, 'Contact'),
                React.createElement('th', { className: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider' }, 'Email'),
                React.createElement('th', { className: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider' }, 'GST Number')
              )
            ),
            React.createElement(
              'tbody',
              { className: 'bg-white divide-y divide-gray-200' },
              suppliers.map(supplier => React.createElement(
                'tr',
                { key: supplier.id, className: 'hover:bg-gray-50' },
                React.createElement(
                  'td',
                  { className: 'px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900' },
                  supplier.name
                ),
                React.createElement(
                  'td',
                  { className: 'px-6 py-4 whitespace-nowrap text-sm text-gray-500' },
                  supplier.contact || 'N/A'
                ),
                React.createElement(
                  'td',
                  { className: 'px-6 py-4 whitespace-nowrap text-sm text-gray-500' },
                  supplier.email || 'N/A'
                ),
                React.createElement(
                  'td',
                  { className: 'px-6 py-4 whitespace-nowrap text-sm text-gray-500' },
                  supplier.gstNumber || 'N/A'
                )
              ))
            )
          )
        )
      ),

      // Add supplier form
      React.createElement(
        'div',
        { className: 'bg-white rounded-lg shadow p-6' },
        React.createElement(
          'h3',
          { className: 'text-lg font-medium text-gray-900 mb-4' },
          'Add New Supplier'
        ),
        React.createElement(
          'form',
          { onSubmit: handleCreateSupplier },
          React.createElement(
            'div',
            { className: 'grid grid-cols-1 md:grid-cols-2 gap-4' },
            React.createElement(
              'div',
              null,
              React.createElement(
                'label',
                { className: 'block text-sm font-medium text-gray-700 mb-2' },
                'Name *'
              ),
              React.createElement(
                'input',
                {
                  type: 'text',
                  value: newSupplier.name,
                  onChange: (e) => setNewSupplier(prev => ({ ...prev, name: e.target.value })),
                  className: 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
                  required: true
                }
              )
            ),
            React.createElement(
              'div',
              null,
              React.createElement(
                'label',
                { className: 'block text-sm font-medium text-gray-700 mb-2' },
                'Contact'
              ),
              React.createElement(
                'input',
                {
                  type: 'text',
                  value: newSupplier.contact,
                  onChange: (e) => setNewSupplier(prev => ({ ...prev, contact: e.target.value })),
                  className: 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                }
              )
            ),
            React.createElement(
              'div',
              null,
              React.createElement(
                'label',
                { className: 'block text-sm font-medium text-gray-700 mb-2' },
                'Email'
              ),
              React.createElement(
                'input',
                {
                  type: 'email',
                  value: newSupplier.email,
                  onChange: (e) => setNewSupplier(prev => ({ ...prev, email: e.target.value })),
                  className: 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                }
              )
            ),
            React.createElement(
              'div',
              null,
              React.createElement(
                'label',
                { className: 'block text-sm font-medium text-gray-700 mb-2' },
                'GST Number *'
              ),
              React.createElement(
                'input',
                {
                  type: 'text',
                  value: newSupplier.gstNumber,
                  onChange: (e) => setNewSupplier(prev => ({ ...prev, gstNumber: e.target.value.toUpperCase() })),
                  required: true,
                  minLength: 15,
                  maxLength: 15,
                  pattern: '[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]',
                  title: 'Enter a valid 15-character GSTIN',
                  placeholder: '22AAAAA0000A1Z5',
                  className: 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                }
              )
            )
          ),
          React.createElement(
            'div',
            { className: 'mt-4' },
            React.createElement(
              'label',
              { className: 'block text-sm font-medium text-gray-700 mb-2' },
              'Address'
            ),
            React.createElement(
              'textarea',
              {
                value: newSupplier.address,
                onChange: (e) => setNewSupplier(prev => ({ ...prev, address: e.target.value })),
                className: 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
                rows: 3
              }
            )
          ),
          React.createElement(
            'div',
            { className: 'mt-6 flex justify-end' },
            React.createElement(
              'button',
              {
                type: 'submit',
                disabled: loading,
                className: `px-6 py-2 rounded-lg font-medium ${
                  loading
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`
              },
              loading ? 'Creating...' : 'Add Supplier'
            )
          )
        )
      )
    )
  );

  return React.createElement(
    'div',
    { className: 'min-h-screen bg-gray-50 py-8 px-4' },
    React.createElement(
      'div',
      { className: 'max-w-7xl mx-auto' },
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
          'Order Management'
        )
      ),

      // Error/Success messages
      error && React.createElement(
        'div',
        { className: 'mb-6 p-4 bg-red-50 border border-red-200 rounded-lg' },
        React.createElement(
          'p',
          { className: 'text-red-800' },
          error
        )
      ),

      success && React.createElement(
        'div',
        { className: 'mb-6 p-4 bg-green-50 border border-green-200 rounded-lg' },
        React.createElement(
          'p',
          { className: 'text-green-800' },
          success
        )
      ),

      // Tabs
      React.createElement(
        'div',
        { className: 'mb-6' },
        React.createElement(
          'div',
          { className: 'border-b border-gray-200' },
          React.createElement(
            'nav',
            { className: '-mb-px flex space-x-8' },
            React.createElement(
              'button',
              {
                onClick: () => setActiveTab('orders'),
                className: `py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'orders'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`
              },
              'Orders'
            ),
            React.createElement(
              'button',
              {
                onClick: () => setActiveTab('new-order'),
                className: `py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'new-order'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`
              },
              'New Order'
            ),
            React.createElement(
              'button',
              {
                onClick: () => setActiveTab('suppliers'),
                className: `py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'suppliers'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`
              },
              'Suppliers'
            )
          )
        )
      ),

      // Tab content
      activeTab === 'orders' && renderOrdersTab(),
      activeTab === 'new-order' && renderNewOrderTab(),
      activeTab === 'suppliers' && renderSuppliersTab()
    )
  );
};

export default OrderManagement;
