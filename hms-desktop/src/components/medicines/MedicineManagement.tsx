import React, { useState, useEffect, useRef } from 'react';
import medicineService from '../../lib/api/services/medicineService';
import InfoButton from '../common/InfoButton';
import { getInfoContent } from '../../lib/infoContent';
import OrderManagement from './OrderManagement';
import ImportCatalogWizard from './ImportCatalogWizard';
import { useHospitalConfig } from '../../lib/contexts/HospitalConfigContext';
import { formatCurrencySync } from '../../lib/utils/currencyAndTimezone';
import { autoSelectIfZero, autoSelectIfZeroMouseDown } from '../../lib/utils/numberInput';

const MedicineManagement = ({ user, isAuthenticated, onBack }) => {
  const { formatCurrency, config, displayCurrency, baseCurrency, refreshConfig } = useHospitalConfig();
  const directlyFetchedCurrencyRef = useRef(null);
  const [currentDisplayCurrency, setCurrentDisplayCurrency] = useState(null);
  
  // CRITICAL: Force reload config from database when component mounts
  React.useEffect(() => {
    // Always refresh config when component mounts to get latest displayCurrency
    console.log('[MedicineManagement] 🔄 Component mounted - forcing config refresh to get latest displayCurrency...');
    console.log('[MedicineManagement] 📊 Current context values:', {
      contextDisplayCurrency: displayCurrency,
      configDisplayCurrency: config?.displayCurrency,
      baseCurrency
    });
    
    const forceConfigRefresh = async () => {
      try {
        // Import configService to fetch directly
        const configService = await import('../../lib/api/services/configService');
        const freshConfig = await configService.default.getHospitalConfig();
        
        const fetchedDisplayCurrency = freshConfig.config?.displayCurrency 
          ? (typeof freshConfig.config.displayCurrency === 'string' ? freshConfig.config.displayCurrency.trim().toUpperCase() : null)
          : null;
        const currentContextDisplayCurrency = displayCurrency 
          ? (typeof displayCurrency === 'string' ? displayCurrency.trim().toUpperCase() : null)
          : null;
        
        console.log('[MedicineManagement] 📥 Direct config fetch from backend:', {
          displayCurrency: freshConfig.config?.displayCurrency,
          displayCurrencyType: typeof freshConfig.config?.displayCurrency,
          displayCurrencyRaw: JSON.stringify(freshConfig.config?.displayCurrency),
          fetchedDisplayCurrency,
          currency: freshConfig.config?.currency,
          hasDisplayCurrency: !!freshConfig.config?.displayCurrency,
          currentContextDisplayCurrency,
          willRefresh: fetchedDisplayCurrency && fetchedDisplayCurrency !== currentContextDisplayCurrency
        });
        
        // Always refresh if there's a mismatch OR if we got a displayCurrency from backend but context doesn't have it
        if (fetchedDisplayCurrency && (
          !currentContextDisplayCurrency || 
          fetchedDisplayCurrency !== currentContextDisplayCurrency
        )) {
          console.log('[MedicineManagement] 🔄 Mismatch detected! Backend has:', fetchedDisplayCurrency, 'but context has:', currentContextDisplayCurrency, '- refreshing context...');
          
          // Update local state immediately with the fetched value
          // This ensures we use the correct currency even if context hasn't updated yet
          if (fetchedDisplayCurrency) {
            console.log('[MedicineManagement] 🔄 Updating local state immediately to:', fetchedDisplayCurrency);
            directlyFetchedCurrencyRef.current = fetchedDisplayCurrency;
            setCurrentDisplayCurrency(fetchedDisplayCurrency);
          }
          
          // Force refresh the context (this will update the context's config state)
          await refreshConfig();
          await new Promise(resolve => setTimeout(resolve, 200));
          
          // Verify the context was updated by checking config.displayCurrency
          // If it's still not updated, update local state again
          const updatedConfigDisplayCurrency = config?.displayCurrency 
            ? (typeof config.displayCurrency === 'string' ? config.displayCurrency.trim().toUpperCase() : null)
            : null;
          
          if (updatedConfigDisplayCurrency !== fetchedDisplayCurrency) {
            console.log('[MedicineManagement] ⚠️ Context still not updated after refresh. Forcing another refresh...');
            await refreshConfig();
            await new Promise(resolve => setTimeout(resolve, 200));
            
            // Update local state again to ensure we have the correct value
            if (fetchedDisplayCurrency) {
              directlyFetchedCurrencyRef.current = fetchedDisplayCurrency;
              setCurrentDisplayCurrency(fetchedDisplayCurrency);
            }
          }
          
          console.log('[MedicineManagement] ✅ Config refresh complete. Using displayCurrency:', fetchedDisplayCurrency);
        } else if (!fetchedDisplayCurrency) {
          console.warn('[MedicineManagement] ⚠️ Backend returned no displayCurrency. Check if it was saved correctly in database.');
        } else {
          console.log('[MedicineManagement] ✅ Context already has correct displayCurrency:', fetchedDisplayCurrency);
        }
      } catch (err) {
        console.error('[MedicineManagement] ❌ Failed to fetch config directly:', err);
      }
    };
    
    forceConfigRefresh();
  }, []); // Only run once on mount
  
  // CRITICAL: Listen for config changes and refresh if displayCurrency doesn't match
  React.useEffect(() => {
    // Check if config has displayCurrency but context doesn't match
    if (config?.displayCurrency) {
      const configDisplayCurrency = (config.displayCurrency || '').toString().trim().toUpperCase();
      const contextDisplayCurrency = (displayCurrency || '').toString().trim().toUpperCase();
      
      if (configDisplayCurrency && configDisplayCurrency !== contextDisplayCurrency && configDisplayCurrency !== 'USD') {
        console.log('[MedicineManagement] ⚠️ Currency mismatch detected!', {
          configDisplayCurrency,
          contextDisplayCurrency,
          note: 'Config has correct value but context is stale - refreshing...'
        });
        console.log('[MedicineManagement] 🔄 Calling refreshConfig() to update context...');
        // Call refreshConfig multiple times to ensure it updates
        const refreshMultiple = async () => {
          for (let i = 1; i <= 2; i++) {
            try {
              await refreshConfig();
              await new Promise(resolve => setTimeout(resolve, 300));
              console.log(`[MedicineManagement] ✅ Config refresh ${i}/2 complete`);
            } catch (err) {
              console.error(`[MedicineManagement] ❌ Config refresh ${i} failed:`, err);
            }
          }
          console.log('[MedicineManagement] ✅ All config refreshes complete. Context should now have correct displayCurrency.');
        };
        refreshMultiple();
      }
    }
  }, [config?.displayCurrency, displayCurrency, refreshConfig]);
  
  // State declarations - must be before any useEffect that uses them
  const [medicines, setMedicines] = useState([]);
  
  // Debug: Log currency values when component mounts or currencies change
  React.useEffect(() => {
    console.log('[MedicineManagement] 🔍 Currency values from context:', {
      baseCurrency,
      displayCurrency,
      hasBaseCurrency: !!baseCurrency,
      hasDisplayCurrency: !!displayCurrency,
      currenciesMatch: baseCurrency === displayCurrency,
      shouldConvert: baseCurrency !== displayCurrency && !!baseCurrency && !!displayCurrency,
      timestamp: new Date().toISOString(),
      configDisplayCurrency: config?.displayCurrency,
      contextBaseCurrency: baseCurrency,
      contextDisplayCurrency: displayCurrency
    });
    
    // If displayCurrency changed, force a re-conversion of prices
    if (baseCurrency && displayCurrency && baseCurrency !== displayCurrency) {
      console.log('[MedicineManagement] 💡 Display currency changed - prices will be converted');
    }
  }, [baseCurrency, displayCurrency, config?.displayCurrency]);
  
  // Also listen for when displayCurrency changes in context (moved after medicines declaration)
  React.useEffect(() => {
    if (displayCurrency && displayCurrency !== 'USD') {
      console.log('[MedicineManagement] 💡 DisplayCurrency updated in context:', displayCurrency);
      // Force a re-conversion of prices when displayCurrency changes
      if (medicines.length > 0) {
        console.log('[MedicineManagement] 🔄 DisplayCurrency changed, prices will be re-converted on next render');
      }
    }
  }, [displayCurrency, medicines.length]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [inventorySyncBanner, setInventorySyncBanner] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [activeTab, setActiveTab] = useState('list');
  
  // Inventory Management State
  const [stats, setStats] = useState(null);
  const [lowStockMedicines, setLowStockMedicines] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [transactionsPage, setTransactionsPage] = useState(1);
  const [transactionsTotalPages, setTransactionsTotalPages] = useState(1);
  const [showStockUpdateModal, setShowStockUpdateModal] = useState(false);
  const [selectedMedicine, setSelectedMedicine] = useState(null);
  const [stockUpdateForm, setStockUpdateForm] = useState({
    operation: 'add',
    quantity: '',
    reason: ''
  });
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingMedicine, setEditingMedicine] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [medicineToDelete, setMedicineToDelete] = useState(null);
  
  const [formData, setFormData] = useState({
    name: '',
    genericName: '',
    manufacturer: '',
    category: '',
    price: '',
    quantity: '',
    lowStockThreshold: '',
    code: '',
    description: '',
    therapeuticClass: '',
    atcCode: '',
    dosageForm: '',
    strength: '',
    unit: '',
    expiryDate: '',
    supplier: '',
    batchNumber: '',
    storageConditions: '',
    prescriptionRequired: true
  });

  useEffect(() => {
    // Only load medicines if user is authenticated
    if (isAuthenticated && user) {
      loadMedicines();
      if (activeTab === 'inventory') {
        loadInventoryData();
      }
    } else {
      console.warn('[MedicineManagement] User not authenticated, skipping medicine load');
    }
  }, [currentPage, searchTerm, filterCategory, activeTab, isAuthenticated, user]);

  useEffect(() => {
    if (activeTab === 'inventory' && transactionsPage) {
      loadTransactions();
    }
  }, [transactionsPage]);

  // Application uses INR only - no currency conversion needed

  const loadMedicines = async () => {
    // Check authentication before making API call
    if (!isAuthenticated || !user) {
      console.warn('[MedicineManagement] User not authenticated, skipping medicine load');
      setError('Please log in to view medicines');
      setLoading(false);
      return;
    }
    
    setLoading(true);
    setError(''); // Clear previous errors
    try {
      const response = await medicineService.getMedicines({
        page: currentPage,
        search: searchTerm,
        category: filterCategory
      });
      if (response.success) {
        setMedicines(response.data.medicines);
        setTotalPages(response.data.pagination.totalPages);
      }
    } catch (err: any) {
      // Check for network/connection errors
      if (err.code === 'ERR_NETWORK' || err.message === 'Network Error' || !err.response) {
        setError('Cannot connect to backend server. Please ensure the backend server is running.');
      } else {
        setError('Failed to load medicines. Please try again.');
      }
      console.error('Error loading medicines:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await medicineService.createMedicine(formData);
      if (response.success) {
        setShowAddForm(false);
        setFormData({
          name: '',
          genericName: '',
          manufacturer: '',
          category: '',
          price: '',
          quantity: '',
          lowStockThreshold: '',
          code: '',
          description: '',
          therapeuticClass: '',
          atcCode: '',
          dosageForm: '',
          strength: '',
          unit: '',
          expiryDate: '',
          supplier: '',
          batchNumber: '',
          storageConditions: '',
          prescriptionRequired: true
        });
        loadMedicines();
      } else {
        setError(response.message);
      }
    } catch (err) {
      setError('Failed to create medicine');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  // Inventory Management Functions
  const loadInventoryData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadStats(),
        loadLowStockMedicines(),
        loadTransactions()
      ]);
    } catch (err) {
      setError('Failed to load inventory data');
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const response = await medicineService.getStats();
      if (response.success) {
        setStats(response.data);
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  const loadLowStockMedicines = async () => {
    try {
      const response = await medicineService.getLowStockMedicines();
      if (response.success) {
        setLowStockMedicines(response.data.medicines || []);
      }
    } catch (err) {
      console.error('Failed to load low stock medicines:', err);
    }
  };

  const loadTransactions = async () => {
    try {
      const response = await medicineService.getTransactions(undefined, transactionsPage, 10);
      if (response.success) {
        setTransactions(response.data.transactions || []);
        setTransactionsTotalPages(response.data.pagination?.totalPages || 1);
      }
    } catch (err) {
      console.error('Failed to load transactions:', err);
    }
  };

  const handleOpenStockUpdate = (medicine) => {
    setSelectedMedicine(medicine);
    setStockUpdateForm({
      operation: 'add',
      quantity: '',
      reason: ''
    });
    setShowStockUpdateModal(true);
  };

  const handleStockUpdate = async (e) => {
    e.preventDefault();
    if (!selectedMedicine) return;

    const qty = parseInt(String(stockUpdateForm.quantity).trim(), 10);
    if (!Number.isFinite(qty) || qty < 0 || !Number.isInteger(qty)) {
      setError('Please enter a valid whole number (0 or greater).');
      return;
    }
    if (stockUpdateForm.operation !== 'set' && qty < 1) {
      setError('For Add or Subtract, enter a quantity of at least 1.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await medicineService.updateStock(selectedMedicine.id, {
        operation: stockUpdateForm.operation,
        quantity: qty,
        reason: stockUpdateForm.reason || undefined
      });

      if (response.success) {
        setShowStockUpdateModal(false);
        setSelectedMedicine(null);
        setStockUpdateForm({ operation: 'add', quantity: '', reason: '' });
        // Reload all inventory data
        await loadInventoryData();
        await loadMedicines();
        setError('');
      } else {
        const zodDetail =
          Array.isArray(response.errors) && response.errors.length > 0
            ? response.errors.map((issue: { message?: string; path?: (string | number)[] }) =>
                issue.path?.length ? `${issue.path.join('.')}: ${issue.message || ''}` : issue.message
              ).join('; ')
            : '';
        setError(zodDetail ? `${response.message || 'Validation error'} — ${zodDetail}` : response.message || 'Failed to update stock');
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message;
      setError(msg ? String(msg) : 'Failed to update stock. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleStockUpdateFormChange = (e) => {
    const { name, value } = e.target;
    setStockUpdateForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Handle Edit Medicine
  const handleEdit = (medicine) => {
    setEditingMedicine(medicine);
    setEditFormData({
      name: medicine.name || '',
      genericName: medicine.genericName || '',
      manufacturer: medicine.manufacturer || '',
      category: medicine.category || 'General',
      therapeuticClass: medicine.therapeuticClass || '',
      atcCode: medicine.atcCode || '',
      price: medicine.price || medicine.sellingPrice || 0,
      quantity: medicine.stockQuantity || medicine.quantity || 0,
      lowStockThreshold: medicine.lowStockThreshold || 10,
      expiryDate: medicine.expiryDate || '',
      code: medicine.code || ''
    });
    setShowEditModal(true);
    setError('');
  };

  const handleEditInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setEditFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleUpdateMedicine = async (e) => {
    e.preventDefault();
    if (!editingMedicine) return;

    const priceNum = parseFloat(String(editFormData.price ?? '').replace(/,/g, ''));
    const qtyNum = parseInt(String(editFormData.quantity ?? '').trim(), 10);
    const thresholdNum = parseInt(String(editFormData.lowStockThreshold ?? '').trim(), 10);

    if (!editFormData.name || !String(editFormData.name).trim()) {
      setError('Medicine name is required.');
      return;
    }
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      setError('Price must be a number greater than zero.');
      return;
    }
    if (!Number.isFinite(qtyNum) || qtyNum < 0 || !Number.isInteger(qtyNum)) {
      setError('Stock quantity must be a whole number (0 or greater).');
      return;
    }
    if (!Number.isFinite(thresholdNum) || thresholdNum < 0 || !Number.isInteger(thresholdNum)) {
      setError('Low stock threshold must be a whole number (0 or greater).');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const updateData = {
        name: String(editFormData.name).trim(),
        genericName: editFormData.genericName?.trim() || undefined,
        manufacturer: editFormData.manufacturer?.trim() || undefined,
        category: editFormData.category?.trim() || 'General',
        therapeuticClass: editFormData.therapeuticClass?.trim() || undefined,
        atcCode: editFormData.atcCode?.trim() || undefined,
        price: priceNum,
        quantity: qtyNum,
        lowStockThreshold: thresholdNum,
        expiryDate: editFormData.expiryDate?.trim() || undefined,
        code: editFormData.code?.trim() || undefined
      };

      const response = await medicineService.updateMedicine(editingMedicine.id, updateData);
      
      if (response.success) {
        setShowEditModal(false);
        setEditingMedicine(null);
        setEditFormData({});
        await loadMedicines();
        setError('');
      } else {
        const zodDetail =
          Array.isArray(response.errors) && response.errors.length > 0
            ? response.errors.map((issue: { message?: string; path?: (string | number)[] }) =>
                issue.path?.length ? `${issue.path.join('.')}: ${issue.message || ''}` : issue.message
              ).join('; ')
            : '';
        setError(zodDetail ? `${response.message || 'Validation error'} — ${zodDetail}` : response.message || 'Failed to update medicine');
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message;
      setError(msg ? String(msg) : 'Failed to update medicine. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Handle Delete Medicine
  const handleDelete = (medicine) => {
    setMedicineToDelete(medicine);
    setShowDeleteConfirm(true);
    setError('');
  };

  const confirmDelete = async () => {
    if (!medicineToDelete) return;

    setLoading(true);
    setError('');
    try {
      const response = await medicineService.deleteMedicine(medicineToDelete.id);
      
      if (response.success) {
        setShowDeleteConfirm(false);
        setMedicineToDelete(null);
        await loadMedicines();
        setError('');
      } else {
        setError(response.message || 'Failed to delete medicine');
      }
    } catch (err) {
      setError('Failed to delete medicine. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) {
    return React.createElement(
      'div',
      { className: 'min-h-screen bg-gray-50 flex items-center justify-center' },
      React.createElement(
        'div',
        { className: 'text-center' },
        React.createElement('h1', { className: 'text-2xl font-bold text-gray-900 mb-4' }, 'Access Denied'),
        React.createElement('p', { className: 'text-gray-600' }, 'Please log in to access this page.')
      )
    );
  }

  const finalDisplayCurrency =
    (config?.displayCurrency && typeof config.displayCurrency === 'string'
      ? config.displayCurrency.trim().toUpperCase()
      : null) ||
    currentDisplayCurrency ||
    displayCurrency ||
    'INR';

  return React.createElement(
    'div',
    { style: { display: 'flex', flexDirection: 'column', gap: '8px', backgroundColor: '#F0F0F0', padding: '8px' } },
    React.createElement(
      'div',
      { style: { backgroundColor: '#FFFFFF', border: '1px solid #C8C8C8', padding: '8px 12px' } },
      React.createElement(
        'div',
        { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', paddingBottom: '6px', borderBottom: '1px solid #C8C8C8' } },
        React.createElement(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
          React.createElement(
            'h1',
            { style: { fontSize: '16px', fontWeight: '600', color: '#000000', margin: 0 } },
            '💊 Medicine Management'
          ),
          React.createElement(InfoButton, {
            title: getInfoContent('medicines').title,
            content: getInfoContent('medicines').content,
            size: 'md',
            variant: 'info'
          })
        )
      ),

    // Error/Success messages
    error && React.createElement(
      'div',
      { style: { backgroundColor: '#FFF4F4', border: '1px solid #FFB3B3', color: '#C4281C', padding: '6px 8px', borderRadius: '2px', marginBottom: '8px', fontSize: '13px' } },
      error
    ),

    // Tabs
    React.createElement(
      'div',
      { style: { backgroundColor: '#FFFFFF', border: '1px solid #C8C8C8', marginBottom: '8px' } },
      React.createElement(
        'div',
        { className: 'border-b border-gray-200' },
        React.createElement(
          'nav',
          { className: '-mb-px flex space-x-8' },
          React.createElement(
            'button',
            {
              onClick: () => setActiveTab('list'),
              className: `py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'list' 
                  ? 'border-blue-500 text-blue-600' 
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`
            },
            'Medicine List'
          ),
          React.createElement(
            'button',
            {
              onClick: () => setActiveTab('inventory'),
              className: `py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'inventory' 
                  ? 'border-blue-500 text-blue-600' 
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`
            },
            'Inventory Management'
          ),
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
            'Order Management'
          ),
          React.createElement(
            'button',
            {
              onClick: () => setActiveTab('import'),
              className: `py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'import' 
                  ? 'border-blue-500 text-blue-600' 
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`
            },
            'Import Catalog'
          )
        )
      )
    ),

    // Tab Content
    activeTab === 'list' && React.createElement(
      'div',
      { style: { backgroundColor: '#FFFFFF', border: '1px solid #C8C8C8', padding: '8px 12px', marginBottom: '8px' } },
      // Search and Filters
      React.createElement(
        'div',
        { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '8px', backgroundColor: '#FFFFFF', border: '1px solid #C8C8C8', padding: '6px 8px' } },
        React.createElement(
          'input',
          {
            type: 'text',
            placeholder: 'Search medicines...',
            value: searchTerm,
            onChange: (e) => setSearchTerm(e.target.value),
            style: { padding: '4px 8px', border: '1px solid #C8C8C8', borderRadius: '2px', fontSize: '13px', backgroundColor: '#FFFFFF', boxShadow: 'inset 0 1px 2px 0 rgba(0, 0, 0, 0.05)' }
          }
        ),
        React.createElement(
          'select',
          {
            value: filterCategory,
            onChange: (e) => setFilterCategory(e.target.value),
            style: { padding: '4px 8px', border: '1px solid #C8C8C8', borderRadius: '2px', fontSize: '13px', backgroundColor: '#FFFFFF', boxShadow: 'inset 0 1px 2px 0 rgba(0, 0, 0, 0.05)' }
          },
          React.createElement('option', { value: '' }, 'All Categories'),
          React.createElement('option', { value: 'Antibiotic' }, 'Antibiotic'),
          React.createElement('option', { value: 'Painkiller' }, 'Painkiller'),
          React.createElement('option', { value: 'Vitamin' }, 'Vitamin'),
          React.createElement('option', { value: 'Other' }, 'Other')
        ),
        React.createElement(
          'button',
          {
            onClick: loadMedicines,
            style: {
              backgroundColor: '#6C757D',
              color: '#FFFFFF',
              border: '1px solid #5A6268',
              padding: '4px 12px',
              borderRadius: '2px',
              fontSize: '13px',
              fontWeight: '400',
              cursor: 'pointer',
              boxShadow: 'inset 0 1px 0 0 rgba(255, 255, 255, 0.2)'
            },
            onMouseOver: (e) => {
              e.target.style.backgroundColor = '#5A6268';
            },
            onMouseOut: (e) => {
              e.target.style.backgroundColor = '#6C757D';
            }
          },
          'Search'
        )
      ),

      // Medicine List
        React.createElement(
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
                React.createElement('th', { className: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider' }, 'Generic Name'),
                React.createElement('th', { className: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider' }, 'Category'),
                React.createElement('th', { className: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider' }, 'Price'),
                React.createElement('th', { className: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider' }, 'Stock'),
                React.createElement('th', { className: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider' }, 'Status')
              )
            ),
            React.createElement(
              'tbody',
              { className: 'bg-white divide-y divide-gray-200' },
              medicines.map(medicine => {
                const stockQuantity = medicine.stockQuantity || medicine.quantity || 0;
                const lowStockThreshold = medicine.lowStockThreshold || 10;
                const stockStatus = medicine.stockStatus || (stockQuantity <= lowStockThreshold ? 'LOW' : 'OK');
                return React.createElement(
                  'tr',
                  { key: medicine.id, className: 'hover:bg-gray-50' },
                  React.createElement('td', { className: 'px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900' }, medicine.name),
                  React.createElement('td', { className: 'px-6 py-4 whitespace-nowrap text-sm text-gray-500' }, medicine.genericName || '-'),
                  React.createElement('td', { className: 'px-6 py-4 whitespace-nowrap text-sm text-gray-500' }, medicine.category || '-'),
                  React.createElement('td', { className: 'px-6 py-4 whitespace-nowrap text-sm text-gray-500' }, 
                    (() => {
                      const price = parseFloat(medicine.sellingPrice || medicine.price || 0);
                      // Use converted price if available, otherwise use original
                      const displayPrice = price; // Application uses INR only - no conversion needed
                      
                      // CRITICAL: Always format with the finalDisplayCurrency (from config) if available
                      // CRITICAL: Always use finalDisplayCurrency which reads directly from config.displayCurrency
                      const currencyForFormatting = finalDisplayCurrency;
                      
                      // Log what we're doing for debugging
                      if (medicine.id === medicines[0]?.id) {
                        console.log('[MedicineManagement] 💰 Price formatting for first medicine:', {
                          medicineId: medicine.id,
                          medicineName: medicine.name,
                          originalPrice: price,
                          displayPrice,
                          convertedPrice: price, // Application uses INR only
                          baseCurrency,
                          displayCurrency,
                          finalDisplayCurrency,
                          configDisplayCurrency: config?.displayCurrency,
                          currencyForFormatting,
                          willFormatWith: currencyForFormatting,
                          hasConvertedPrice: false, // Application uses INR only - no conversion
                          currenciesMatch: baseCurrency === currencyForFormatting
                        });
                      }
                      
                      // CRITICAL: Format using the correct currency
                      // Use formatCurrencySync directly with the correct currency
                      const formatted = formatCurrencySync(displayPrice, currencyForFormatting);
                      
                      // Verify the formatted result
                      if (medicine.id === medicines[0]?.id) {
                        console.log('[MedicineManagement] ✅ Formatted result:', formatted, 'using currency:', currencyForFormatting);
                      }
                      
                      return formatted;
                    })()
                  ),
                  React.createElement('td', { className: 'px-6 py-4 whitespace-nowrap text-sm text-gray-500' }, medicine.stockQuantity || medicine.quantity || 0),
                  React.createElement(
                    'td',
                    { className: 'px-6 py-4 whitespace-nowrap text-sm' },
                    React.createElement(
                      'span',
                      { className: `px-2 py-1 text-xs font-medium rounded-full ${stockStatus === 'LOW' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}` },
                      stockStatus
                    )
                  )
                );
              })
            )
          )
        )
      )
    ),

    // Add Medicine Form
    showAddForm && React.createElement(
      'div',
      {
        className: 'fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4',
        onClick: () => setShowAddForm(false),
      },
      React.createElement(
        'div',
        {
          className: 'bg-white rounded-lg shadow-xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto',
          onClick: (event) => event.stopPropagation(),
        },
        React.createElement(
          'h3',
          { className: 'text-lg font-medium text-gray-900 mb-6' },
          'Add New Medicine'
        ),
        React.createElement(
          'form',
          { onSubmit: handleSubmit, className: 'space-y-6' },
          // Basic Information
          React.createElement(
            'div',
            { className: 'space-y-4' },
            React.createElement(
              'h4',
              { className: 'text-md font-medium text-gray-800 flex items-center gap-2' },
              'Basic Information',
              React.createElement(InfoButton, {
                title: getInfoContent('medicines', 'overview').title,
                content: getInfoContent('medicines', 'overview').content,
                size: 'sm'
              })
            ),
            React.createElement(
              'div',
              { className: 'grid grid-cols-1 md:grid-cols-2 gap-4' },
              React.createElement(
                'div',
                null,
                React.createElement(
                  'label',
                  { className: 'block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2' },
                  'Brand Name (Medicine Name) *',
                  React.createElement(InfoButton, {
                    title: 'Brand Name',
                    content: 'Enter the commercial/brand name of the medicine (e.g., "Crocin", "Dolo 650"). This is the name patients will see.',
                    size: 'xs'
                  })
                ),
                React.createElement('input', {
                  type: 'text',
                  name: 'name',
                  required: true,
                  value: formData.name,
                  onChange: handleInputChange,
                  className: 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                })
              ),
              React.createElement(
                'div',
                null,
                React.createElement(
                  'label',
                  { className: 'block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2' },
                  'Generic Name (Salt) *',
                  React.createElement(InfoButton, {
                    title: 'Generic Name / Salt',
                    content: 'Enter the generic/salt name of the medicine (e.g., "Paracetamol", "Acetaminophen"). This is the active pharmaceutical ingredient.',
                    size: 'xs'
                  })
                ),
                React.createElement('input', {
                  type: 'text',
                  name: 'genericName',
                  required: true,
                  value: formData.genericName,
                  onChange: handleInputChange,
                  className: 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                })
              ),
              React.createElement(
                'div',
                null,
                React.createElement(
                  'label',
                  { className: 'block text-sm font-medium text-gray-700 mb-2' },
                  'Manufacturer *'
                ),
                React.createElement('input', {
                  type: 'text',
                  name: 'manufacturer',
                  required: true,
                  value: formData.manufacturer,
                  onChange: handleInputChange,
                  className: 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                })
              ),
              React.createElement(
                'div',
                null,
                React.createElement(
                  'label',
                  { className: 'block text-sm font-medium text-gray-700 mb-2' },
                  'Category *'
                ),
                React.createElement(
                  'select',
                  {
                    name: 'category',
                    required: true,
                    value: formData.category,
                    onChange: handleInputChange,
                    className: 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                  },
                  React.createElement('option', { value: '' }, 'Select Category'),
                  React.createElement('option', { value: 'Antibiotic' }, 'Antibiotic'),
                  React.createElement('option', { value: 'Painkiller' }, 'Painkiller'),
                  React.createElement('option', { value: 'Vitamin' }, 'Vitamin'),
                  React.createElement('option', { value: 'Other' }, 'Other')
                )
              )
            )
          ),

          // Pricing and Inventory
          React.createElement(
            'div',
            { className: 'space-y-4' },
            React.createElement(
              'h4',
              { className: 'text-md font-medium text-gray-800 flex items-center gap-2' },
              'Pricing & Inventory',
              React.createElement(InfoButton, {
                title: getInfoContent('medicines', 'inventory').title,
                content: getInfoContent('medicines', 'inventory').content,
                size: 'sm'
              })
            ),
            React.createElement(
              'div',
              { className: 'grid grid-cols-1 md:grid-cols-3 gap-4' },
              React.createElement(
                'div',
                null,
                React.createElement(
                  'label',
                  { className: 'block text-sm font-medium text-gray-700 mb-2' },
                  'Price *'
                ),
                React.createElement('input', {
                  type: 'number',
                  name: 'price',
                  required: true,
                  min: '0',
                  step: '0.01',
                  value: formData.price,
                  onChange: handleInputChange,
                  onFocus: autoSelectIfZero,
                  onMouseDown: autoSelectIfZeroMouseDown,
                  className: 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                })
              ),
              React.createElement(
                'div',
                null,
                React.createElement(
                  'label',
                  { className: 'block text-sm font-medium text-gray-700 mb-2' },
                  'Stock Quantity *'
                ),
                React.createElement('input', {
                  type: 'number',
                  name: 'quantity',
                  required: true,
                  min: '0',
                  value: formData.quantity,
                  onChange: handleInputChange,
                  onFocus: autoSelectIfZero,
                  onMouseDown: autoSelectIfZeroMouseDown,
                  className: 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                })
              ),
              React.createElement(
                'div',
                null,
                React.createElement(
                  'label',
                  { className: 'block text-sm font-medium text-gray-700 mb-2' },
                  'Low Stock Alert *'
                ),
                React.createElement('input', {
                  type: 'number',
                  name: 'lowStockThreshold',
                  required: true,
                  min: '0',
                  value: formData.lowStockThreshold,
                  onChange: handleInputChange,
                  onFocus: autoSelectIfZero,
                  onMouseDown: autoSelectIfZeroMouseDown,
                  className: 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                })
              )
            )
          ),

          // Submit Button
          React.createElement(
            'div',
            { className: 'flex justify-end space-x-3' },
            React.createElement(
              'button',
              {
                type: 'button',
                onClick: () => setShowAddForm(false),
                className: 'px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50'
              },
              'Cancel'
            ),
            React.createElement(
              'button',
              {
                type: 'submit',
                disabled: loading,
                className: 'px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50'
              },
              loading ? 'Adding...' : 'Add Medicine'
            )
          )
        )
      )
    ),

    // Inventory Management Tab
    activeTab === 'inventory' && React.createElement(
      'div',
      { className: 'space-y-6 flex flex-col' },
      inventorySyncBanner &&
        React.createElement(
          'div',
          {
            className: 'rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900 whitespace-pre-wrap',
          },
          inventorySyncBanner,
        ),
      // Statistics Dashboard
      stats && React.createElement(
        'div',
        { className: 'grid grid-cols-1 md:grid-cols-4 gap-4 order-1' },
        React.createElement(
          'div',
          { className: 'bg-white rounded-lg shadow p-6' },
          React.createElement('div', { className: 'text-sm font-medium text-gray-500 mb-1' }, 'Total Medicines'),
          React.createElement('div', { className: 'text-2xl font-bold text-gray-900' }, stats.totalMedicines || 0)
        ),
        React.createElement(
          'div',
          { className: 'bg-white rounded-lg shadow p-6' },
          React.createElement('div', { className: 'text-sm font-medium text-gray-500 mb-1' }, 'Low Stock Items'),
          React.createElement('div', { className: 'text-2xl font-bold text-red-600' }, stats.lowStockMedicines || 0)
        ),
        React.createElement(
          'div',
          { className: 'bg-white rounded-lg shadow p-6' },
          React.createElement('div', { className: 'text-sm font-medium text-gray-500 mb-1' }, 'Total Inventory Value'),
          React.createElement('div', { className: 'text-2xl font-bold text-green-600' }, formatCurrency(parseFloat(stats.totalInventoryValue || 0)))
        ),
        React.createElement(
          'div',
          { className: 'bg-white rounded-lg shadow p-6' },
          React.createElement('div', { className: 'text-sm font-medium text-gray-500 mb-1' }, 'Total Quantity'),
          React.createElement('div', { className: 'text-2xl font-bold text-blue-600' }, stats.totalQuantity || 0)
        )
      ),

      // Low Stock Alerts
      React.createElement(
        'div',
        { className: 'bg-white rounded-lg shadow order-3' },
        React.createElement(
          'div',
          { className: 'px-6 py-4 border-b border-gray-200' },
          React.createElement(
            'div',
            { className: 'flex items-center justify-between' },
            React.createElement('h3', { className: 'text-lg font-medium text-gray-900' }, '⚠️ Low Stock Alerts'),
            React.createElement(
              'span',
              { className: `px-3 py-1 rounded-full text-sm font-medium ${lowStockMedicines.length > 0 ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}` },
              `${lowStockMedicines.length} item${lowStockMedicines.length !== 1 ? 's' : ''}`
            )
          )
        ),
        React.createElement(
          'div',
          { className: 'overflow-x-auto' },
          lowStockMedicines.length > 0 ? React.createElement(
            'table',
            { className: 'min-w-full divide-y divide-gray-200' },
            React.createElement(
              'thead',
              { className: 'bg-gray-50' },
              React.createElement(
                'tr',
                null,
                React.createElement('th', { className: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase' }, 'Medicine'),
                React.createElement('th', { className: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase' }, 'Current Stock'),
                React.createElement('th', { className: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase' }, 'Threshold'),
                React.createElement('th', { className: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase' }, 'Price'),
                React.createElement('th', { className: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase' }, 'Actions')
              )
            ),
            React.createElement(
              'tbody',
              { className: 'bg-white divide-y divide-gray-200' },
              lowStockMedicines.map(medicine => React.createElement(
                'tr',
                { key: medicine.id, className: 'hover:bg-gray-50' },
                React.createElement('td', { className: 'px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900' }, medicine.name),
                React.createElement('td', { className: 'px-6 py-4 whitespace-nowrap text-sm text-red-600 font-semibold' }, medicine.quantity),
                React.createElement('td', { className: 'px-6 py-4 whitespace-nowrap text-sm text-gray-500' }, medicine.lowStockThreshold),
                React.createElement('td', { className: 'px-6 py-4 whitespace-nowrap text-sm text-gray-500' }, 
                  (() => {
                    const price = parseFloat(medicine.price || 0);
                    const displayPrice = price; // Application uses INR only - no conversion
                    return formatCurrency(displayPrice);
                  })()
                ),
                React.createElement(
                  'td',
                  { className: 'px-6 py-4 whitespace-nowrap text-sm font-medium' },
                  React.createElement(
                    'button',
                    {
                      onClick: () => handleOpenStockUpdate(medicine),
                      className: 'text-blue-600 hover:text-blue-900'
                    },
                    'Update Stock'
                  )
                )
              ))
            )
          ) : React.createElement(
            'div',
            { className: 'px-6 py-8 text-center text-gray-500' },
            '✅ No low stock items. All medicines are well stocked!'
          )
        )
      ),

      // Stock Update Modal
      showStockUpdateModal && selectedMedicine && React.createElement(
        'div',
        { className: 'fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50' },
        React.createElement(
          'div',
          { className: 'relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white' },
          React.createElement(
            'div',
            { className: 'mt-3' },
            React.createElement(
              'h3',
              { className: 'text-lg font-medium text-gray-900 mb-4' },
              `Update Stock: ${selectedMedicine.name}`
            ),
            React.createElement(
              'p',
              { className: 'text-sm text-gray-500 mb-4' },
              `Current stock: ${selectedMedicine.stockQuantity ?? selectedMedicine.quantity ?? 0} | Low-stock threshold: ${selectedMedicine.lowStockThreshold ?? 10}`
            ),
            React.createElement(
              'form',
              { onSubmit: handleStockUpdate, className: 'space-y-4' },
              React.createElement(
                'div',
                null,
                React.createElement('label', { className: 'block text-sm font-medium text-gray-700 mb-2' }, 'Operation *'),
                React.createElement(
                  'select',
                  {
                    name: 'operation',
                    value: stockUpdateForm.operation,
                    onChange: handleStockUpdateFormChange,
                    required: true,
                    className: 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500'
                  },
                  React.createElement('option', { value: 'add' }, 'Add Stock'),
                  React.createElement('option', { value: 'subtract' }, 'Subtract Stock'),
                  React.createElement('option', { value: 'set' }, 'Set Stock')
                )
              ),
              React.createElement(
                'div',
                null,
                React.createElement('label', { className: 'block text-sm font-medium text-gray-700 mb-2' }, 'Quantity *'),
                React.createElement('input', {
                  type: 'number',
                  name: 'quantity',
                  value: stockUpdateForm.quantity,
                  onChange: handleStockUpdateFormChange,
                onFocus: autoSelectIfZero,
                onMouseDown: autoSelectIfZeroMouseDown,
                  required: true,
                  min: '1',
                  className: 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500'
                })
              ),
              React.createElement(
                'div',
                null,
                React.createElement('label', { className: 'block text-sm font-medium text-gray-700 mb-2' }, 'Reason (Optional)'),
                React.createElement('textarea', {
                  name: 'reason',
                  value: stockUpdateForm.reason,
                  onChange: handleStockUpdateFormChange,
                  rows: 3,
                  placeholder: 'e.g., New shipment received, Damaged items removed, etc.',
                  className: 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500'
                })
              ),
              React.createElement(
                'div',
                { className: 'flex justify-end space-x-3 pt-4' },
                React.createElement(
                  'button',
                  {
                    type: 'button',
                    onClick: () => {
                      setShowStockUpdateModal(false);
                      setSelectedMedicine(null);
                    },
                    className: 'px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50'
                  },
                  'Cancel'
                ),
                React.createElement(
                  'button',
                  {
                    type: 'submit',
                    disabled: loading,
                    className: 'px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50'
                  },
                  loading ? 'Updating...' : 'Update Stock'
                )
              )
            )
          )
        )
      ),

      // Transaction History
      React.createElement(
        'div',
        { className: 'bg-white rounded-lg shadow order-4' },
        React.createElement(
          'div',
          { className: 'px-6 py-4 border-b border-gray-200' },
          React.createElement('h3', { className: 'text-lg font-medium text-gray-900' }, '📋 Transaction History')
        ),
        React.createElement(
          'div',
          { className: 'overflow-x-auto' },
          transactions.length > 0 ? React.createElement(
            'table',
            { className: 'min-w-full divide-y divide-gray-200' },
            React.createElement(
              'thead',
              { className: 'bg-gray-50' },
              React.createElement(
                'tr',
                null,
                React.createElement('th', { className: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase' }, 'Date'),
                React.createElement('th', { className: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase' }, 'Medicine'),
                React.createElement('th', { className: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase' }, 'Quantity'),
                React.createElement('th', { className: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase' }, 'Patient'),
                React.createElement('th', { className: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase' }, 'Dispensed By')
              )
            ),
            React.createElement(
              'tbody',
              { className: 'bg-white divide-y divide-gray-200' },
              transactions.map(transaction => React.createElement(
                'tr',
                { key: transaction.id, className: 'hover:bg-gray-50' },
                React.createElement('td', { className: 'px-6 py-4 whitespace-nowrap text-sm text-gray-500' }, new Date(transaction.dispensedAt).toLocaleDateString()),
                React.createElement('td', { className: 'px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900' }, transaction.medicine?.name || 'N/A'),
                React.createElement('td', { className: 'px-6 py-4 whitespace-nowrap text-sm text-gray-500' }, transaction.quantityDispensed),
                React.createElement('td', { className: 'px-6 py-4 whitespace-nowrap text-sm text-gray-500' }, transaction.prescription?.patient?.name || 'N/A'),
                React.createElement('td', { className: 'px-6 py-4 whitespace-nowrap text-sm text-gray-500' }, transaction.dispensedByUser?.fullName || 'N/A')
              ))
            )
          ) : React.createElement(
            'div',
            { className: 'px-6 py-8 text-center text-gray-500' },
            'No transactions found'
          )
        ),
        transactions.length > 0 && React.createElement(
          'div',
          { className: 'px-6 py-4 border-t border-gray-200 flex items-center justify-between' },
          React.createElement(
            'button',
            {
              onClick: () => setTransactionsPage(p => Math.max(1, p - 1)),
              disabled: transactionsPage === 1,
              className: 'px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed'
            },
            'Previous'
          ),
          React.createElement(
            'span',
            { className: 'text-sm text-gray-700' },
            `Page ${transactionsPage} of ${transactionsTotalPages}`
          ),
          React.createElement(
            'button',
            {
              onClick: () => setTransactionsPage(p => p + 1),
              disabled: transactionsPage >= transactionsTotalPages,
              className: 'px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed'
            },
            'Next'
          )
        )
      ),

      // Quick Actions
      React.createElement(
        'div',
        { className: 'bg-white rounded-lg shadow p-6 order-2' },
        React.createElement('h3', { className: 'text-lg font-medium text-gray-900 mb-4' }, '⚡ Quick Actions'),
      React.createElement(
        'div',
        { className: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4' },
          React.createElement(
            'button',
            {
              onClick: loadInventoryData,
              disabled: loading,
              className: 'px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center'
            },
            React.createElement('span', { className: 'mr-2' }, '🔄'),
            loading ? 'Refreshing...' : 'Refresh Inventory'
          ),
          React.createElement(
            'button',
            {
              onClick: async () => {
                setLoading(true);
                setError('');
                setInventorySyncBanner('');
                try {
                  const res = await medicineService.reconcileDispensedStock();
                  const parts = [res.message || 'Done'];
                  const d = res.data;
                  if (d?.applied?.length) {
                    parts.push(
                      `Adjusted: ${d.applied
                        .map((a: { medicineName: string; unitsAdjusted: number }) => `${a.medicineName} (−${a.unitsAdjusted})`)
                        .join(', ')}`,
                    );
                  }
                  if (d?.warnings?.length) parts.push(`Warnings: ${d.warnings.join(' | ')}`);
                  if (d?.errors?.length) parts.push(`Errors: ${d.errors.join(' | ')}`);
                  const text = parts.join('\n\n');
                  if (d?.errors?.length) {
                    setError(text);
                  } else {
                    setInventorySyncBanner(text);
                  }
                  await loadInventoryData();
                  await loadMedicines();
                } catch (err: any) {
                  setError(err.response?.data?.message || err.message || 'Reconciliation failed');
                } finally {
                  setLoading(false);
                }
              },
              disabled: loading,
              className: 'px-4 py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 flex items-center justify-center text-left'
            },
            React.createElement('span', { className: 'mr-2 shrink-0' }, '📋'),
            'Sync stock from dispensed prescriptions'
          ),
          React.createElement(
            'button',
            {
              onClick: () => {
                setFilterCategory('');
                setSearchTerm('');
                setActiveTab('list');
              },
              className: 'px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center justify-center'
            },
            React.createElement('span', { className: 'mr-2' }, '📦'),
            'View All Medicines'
          ),
          React.createElement(
            'button',
            {
              onClick: () => {
                setShowAddForm(true);
                setError('');
              },
              className: 'px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center justify-center'
            },
            React.createElement('span', { className: 'mr-2' }, '➕'),
            'Add New Medicine'
          )
        )
      )
    ),

    // Order Management Tab
    activeTab === 'orders' && React.createElement(
      OrderManagement,
      {
        onBack: () => setActiveTab('list'),
        onInventoryChanged: async () => {
          await loadMedicines();
          await loadInventoryData();
        }
      }
    ),

    // Import Catalog Tab
    activeTab === 'import' && React.createElement(
      ImportCatalogWizard,
      {
        onBack: () => setActiveTab('list'),
        onSuccess: () => {
          loadMedicines(); // Reload medicines after successful import
          setActiveTab('list'); // Switch back to list view
        },
        user: user,
        isAuthenticated: isAuthenticated
      }
    ),

    // Edit Medicine Modal
    showEditModal && editingMedicine && React.createElement(
      'div',
      {
        className: 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50',
        onClick: () => {
          setShowEditModal(false);
          setEditingMedicine(null);
        }
      },
      React.createElement(
        'div',
        {
          className: 'bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto',
          onClick: (e) => e.stopPropagation()
        },
        React.createElement(
          'div',
          { className: 'px-6 py-4 border-b border-gray-200' },
          React.createElement(
            'div',
            { className: 'flex items-center justify-between' },
            React.createElement('h3', { className: 'text-lg font-medium text-gray-900' }, `Edit Medicine: ${editingMedicine.name}`),
            React.createElement(
              'button',
              {
                onClick: () => {
                  setShowEditModal(false);
                  setEditingMedicine(null);
                },
                className: 'text-gray-400 hover:text-gray-500'
              },
              '✕'
            )
          )
        ),
        React.createElement(
          'form',
          { onSubmit: handleUpdateMedicine, className: 'px-6 py-4 space-y-4' },
          React.createElement(
            'div',
            { className: 'grid grid-cols-2 gap-4' },
            React.createElement(
              'div',
              null,
              React.createElement('label', { className: 'block text-sm font-medium text-gray-700 mb-1' }, 'Medicine Name *'),
              React.createElement('input', {
                type: 'text',
                name: 'name',
                value: editFormData.name || '',
                onChange: handleEditInputChange,
                required: true,
                className: 'w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
              })
            ),
            React.createElement(
              'div',
              null,
              React.createElement('label', { className: 'block text-sm font-medium text-gray-700 mb-1' }, 'Generic Name'),
              React.createElement('input', {
                type: 'text',
                name: 'genericName',
                value: editFormData.genericName || '',
                onChange: handleEditInputChange,
                className: 'w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
              })
            ),
            React.createElement(
              'div',
              null,
              React.createElement('label', { className: 'block text-sm font-medium text-gray-700 mb-1' }, 'Manufacturer'),
              React.createElement('input', {
                type: 'text',
                name: 'manufacturer',
                value: editFormData.manufacturer || '',
                onChange: handleEditInputChange,
                className: 'w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
              })
            ),
            React.createElement(
              'div',
              null,
              React.createElement('label', { className: 'block text-sm font-medium text-gray-700 mb-1' }, 'Category'),
              React.createElement('input', {
                type: 'text',
                name: 'category',
                value: editFormData.category || '',
                onChange: handleEditInputChange,
                className: 'w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
              })
            ),
            React.createElement(
              'div',
              null,
              React.createElement('label', { className: 'block text-sm font-medium text-gray-700 mb-1' }, 'Price *'),
              React.createElement('input', {
                type: 'number',
                name: 'price',
                value: editFormData.price || 0,
                onChange: handleEditInputChange,
                onFocus: autoSelectIfZero,
                onMouseDown: autoSelectIfZeroMouseDown,
                required: true,
                min: 0,
                step: '0.01',
                className: 'w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
              })
            ),
            React.createElement(
              'div',
              null,
              React.createElement('label', { className: 'block text-sm font-medium text-gray-700 mb-1' }, 'Stock Quantity'),
              React.createElement('input', {
                type: 'number',
                name: 'quantity',
                value: editFormData.quantity || 0,
                onChange: handleEditInputChange,
                onFocus: autoSelectIfZero,
                onMouseDown: autoSelectIfZeroMouseDown,
                min: 0,
                className: 'w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
              })
            ),
            React.createElement(
              'div',
              null,
              React.createElement('label', { className: 'block text-sm font-medium text-gray-700 mb-1' }, 'Low Stock Threshold'),
              React.createElement('input', {
                type: 'number',
                name: 'lowStockThreshold',
                value: editFormData.lowStockThreshold || 10,
                onChange: handleEditInputChange,
                onFocus: autoSelectIfZero,
                onMouseDown: autoSelectIfZeroMouseDown,
                min: 0,
                className: 'w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
              })
            ),
            React.createElement(
              'div',
              null,
              React.createElement('label', { className: 'block text-sm font-medium text-gray-700 mb-1' }, 'ATC Code'),
              React.createElement('input', {
                type: 'text',
                name: 'atcCode',
                value: editFormData.atcCode || '',
                onChange: handleEditInputChange,
                className: 'w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
              })
            )
          ),
          error && React.createElement(
            'div',
            { className: 'bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded' },
            error
          ),
          React.createElement(
            'div',
            { className: 'flex justify-end gap-3 pt-4 border-t border-gray-200' },
            React.createElement(
              'button',
              {
                type: 'button',
                onClick: () => {
                  setShowEditModal(false);
                  setEditingMedicine(null);
                },
                className: 'px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50'
              },
              'Cancel'
            ),
            React.createElement(
              'button',
              {
                type: 'submit',
                disabled: loading,
                className: 'px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50'
              },
              loading ? 'Updating...' : 'Update Medicine'
            )
          )
        )
      )
    ),

    // Delete Confirmation Modal
    showDeleteConfirm && medicineToDelete && React.createElement(
      'div',
      {
        className: 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50',
        onClick: () => {
          setShowDeleteConfirm(false);
          setMedicineToDelete(null);
        }
      },
      React.createElement(
        'div',
        {
          className: 'bg-white rounded-lg shadow-xl max-w-md w-full mx-4',
          onClick: (e) => e.stopPropagation()
        },
        React.createElement(
          'div',
          { className: 'px-6 py-4 border-b border-gray-200' },
          React.createElement('h3', { className: 'text-lg font-medium text-gray-900' }, 'Confirm Delete')
        ),
        React.createElement(
          'div',
          { className: 'px-6 py-4' },
          React.createElement(
            'p',
            { className: 'text-gray-700 mb-4' },
            `Are you sure you want to delete "${medicineToDelete.name}"? This action cannot be undone.`
          ),
          error && React.createElement(
            'div',
            { className: 'bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4' },
            error
          ),
          React.createElement(
            'div',
            { className: 'flex justify-end gap-3' },
            React.createElement(
              'button',
              {
                type: 'button',
                onClick: () => {
                  setShowDeleteConfirm(false);
                  setMedicineToDelete(null);
                },
                className: 'px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50'
              },
              'Cancel'
            ),
            React.createElement(
              'button',
              {
                onClick: confirmDelete,
                disabled: loading,
                className: 'px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50'
              },
              loading ? 'Deleting...' : 'Delete'
            )
          )
        )
      )
    )
  );
};

export default MedicineManagement;