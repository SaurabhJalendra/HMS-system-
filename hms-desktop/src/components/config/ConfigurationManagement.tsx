import React, { useState, useEffect } from 'react';
import configService from '../../lib/api/services/configService';
import { CURRENCIES, TIMEZONES } from '../../lib/utils/currencyAndTimezone';
import { useHospitalConfig } from '../../lib/contexts/HospitalConfigContext';
import { HospitalConfig } from '../../types';
import { config as envConfig } from '../../config/environment';
import { autoSelectIfZero, autoSelectIfZeroMouseDown } from '../../lib/utils/numberInput';
import AppUpdatePanel from './AppUpdatePanel';

// Type for API response
type ApiHospitalConfig = any;

interface ConfigurationManagementProps {
  user: any;
}

type TabType = 'profile' | 'bank' | 'updates';

const ConfigurationManagement: React.FC<ConfigurationManagementProps> = ({ user }) => {
  console.log('ConfigurationManagement: Component rendering, user=', user);
  const { refreshConfig } = useHospitalConfig();
  const [config, setConfig] = useState<HospitalConfig | null>(null);
  const [loading, setLoading] = useState<boolean>(true); // Start with true to show loading initially
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [activeTab, setActiveTab] = useState<TabType>('profile');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState<boolean>(false);
  const [logoJustUploaded, setLogoJustUploaded] = useState<boolean>(false);
  const [logoLoadAttempted, setLogoLoadAttempted] = useState<boolean>(false);
  /** Display value for consultation fee so user can clear with backspace and we avoid leading zeros */
  const [consultationFeeDisplay, setConsultationFeeDisplay] = useState<string>('');

  // Profile form data
  const [profileData, setProfileData] = useState({
    hospitalName: '',
    hospitalCode: '',
    logoUrl: '',
    address: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'India',
    phone: '',
    email: '',
    emergencyContact: '',
    hospitalLicenseNumber: '',
    taxId: '',
    timezone: 'Asia/Kolkata',
    defaultLanguage: 'en',
    currency: 'INR',
    displayCurrency: 'INR',
    appointmentSlotDuration: 30,
    defaultDoctorConsultationDuration: 30,
    defaultConsultationFee: 0,
    workingHours: {
      workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
      startTime: '09:00',
      endTime: '17:00'
    },
    labTestsEnabled: true,
    ipdEnabled: true,
    billingEnabled: true,
    appointmentsEnabled: true,
    consultationsEnabled: true,
    prescriptionsEnabled: true,
    pharmacyEnabled: true,
  });

  // Bank & Invoice Details form data
  const [bankData, setBankData] = useState({
    // Tax Information
    gstin: '',
    pan: '',
    tan: '',
    hospitalRegistrationNumber: '',
    registrationIssuedBy: '',

    // Bank Details
    bankName: '',
    bankBranch: '',
    accountNumber: '',
    ifscCode: '',
    upiId: '',

    // Payment & Legal
    paymentTerms: 'Net 15 days',
    jurisdictionCity: '',
    overdueInterestRate: '2% monthly',
    billingDepartmentContact: '',

    // Additional
    website: '',
    certifications: '',
  });

  const languages = [
    { value: 'en', label: 'English' },
    { value: 'hi', label: 'Hindi' },
    { value: 'mr', label: 'Marathi' },
    { value: 'gu', label: 'Gujarati' },
    { value: 'ta', label: 'Tamil' },
    { value: 'te', label: 'Telugu' },
  ];

  const workingDaysOptions = [
    { value: 'Mon', label: 'Monday' },
    { value: 'Tue', label: 'Tuesday' },
    { value: 'Wed', label: 'Wednesday' },
    { value: 'Thu', label: 'Thursday' },
    { value: 'Fri', label: 'Friday' },
    { value: 'Sat', label: 'Saturday' },
    { value: 'Sun', label: 'Sunday' },
  ];

  useEffect(() => {
    console.log('ConfigurationManagement: Component mounted, loading config...');
    loadConfig();
    // Fallback: if loading takes too long, show the form anyway
    const timeout = setTimeout(() => {
      console.warn('ConfigurationManagement: Loading timeout - showing form anyway');
      setLoading(false);
    }, 5000); // 5 second timeout

    return () => clearTimeout(timeout);
  }, []);

  // Sync logo preview with profileData.logoUrl when it changes
  useEffect(() => {
    if (profileData.logoUrl) {
      console.log('Syncing logo preview from profileData.logoUrl:', profileData.logoUrl);
      let logoPreviewUrl = profileData.logoUrl.trim();
      
      // If it's already an absolute URL, use it directly
      if (logoPreviewUrl.startsWith('http') || logoPreviewUrl.startsWith('data:')) {
        console.log('Setting logo preview to (absolute URL):', logoPreviewUrl);
        setLogoPreview(logoPreviewUrl);
      } else {
        // Construct full URL using API base URL
        let apiBaseUrl = envConfig.API_URL;
        if (apiBaseUrl.endsWith('/api')) {
          apiBaseUrl = apiBaseUrl.replace('/api', '');
        }
        apiBaseUrl = apiBaseUrl.replace(/\/$/, '');
        
        if (!logoPreviewUrl.startsWith('/')) {
          logoPreviewUrl = `/${logoPreviewUrl}`;
        }
        
        const finalUrl = `${apiBaseUrl}${logoPreviewUrl}`;
        console.log('Setting logo preview to (constructed URL):', finalUrl);
        setLogoPreview(finalUrl);
      }
    } else if (!profileData.logoUrl && logoPreview) {
      // Clear preview if logoUrl is removed
      console.log('Clearing logo preview - no logoUrl in profileData');
      setLogoPreview(null);
    }
  }, [profileData.logoUrl]);

  const loadConfig = async (): Promise<void> => {
    console.log('ConfigurationManagement: Starting loadConfig...');
    setLoading(true);
    setError('');
    try {
      console.log('ConfigurationManagement: Calling configService.getHospitalConfig()...');
      const response = await configService.getHospitalConfig();
      console.log('ConfigurationManagement: Received response:', response);
      const cfg: ApiHospitalConfig = response.config || {};

      setConfig(cfg as HospitalConfig);

      const feeNum = (() => {
        const v = cfg.defaultConsultationFee;
        if (v === '' || v === null || v === undefined) return 0;
        const n = Number(v);
        return Number.isFinite(n) && n >= 0 ? n : 0;
      })();

      // Load profile data
      setProfileData({
        hospitalName: cfg.hospitalName || '',
        hospitalCode: cfg.hospitalCode || '',
        logoUrl: cfg.logoUrl || '',
        address: cfg.address || '',
        city: cfg.city || '',
        state: cfg.state || '',
        postalCode: cfg.postalCode || '',
        country: cfg.country || 'India',
        phone: cfg.phone || '',
        email: cfg.email || '',
        emergencyContact: cfg.emergencyContact || '',
        hospitalLicenseNumber: cfg.hospitalLicenseNumber || '',
        taxId: cfg.taxId || '',
        timezone: cfg.timezone || 'Asia/Kolkata',
        defaultLanguage: cfg.defaultLanguage || 'en',
        currency: cfg.currency || 'INR',
        displayCurrency: cfg.displayCurrency || cfg.currency || 'INR',
        appointmentSlotDuration: cfg.appointmentSlotDuration || 30,
        defaultDoctorConsultationDuration: cfg.defaultDoctorConsultationDuration || 30,
        defaultConsultationFee: feeNum,
        workingHours: (cfg.workingHours as any) || {
          workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
          startTime: '09:00',
          endTime: '17:00'
        },
        labTestsEnabled: cfg.labTestsEnabled ?? true,
        ipdEnabled: cfg.ipdEnabled ?? true,
        billingEnabled: cfg.billingEnabled ?? true,
        appointmentsEnabled: cfg.modulesEnabled?.appointments ?? true,
        consultationsEnabled: cfg.modulesEnabled?.consultations ?? true,
        prescriptionsEnabled: cfg.modulesEnabled?.prescriptions ?? true,
        pharmacyEnabled: cfg.modulesEnabled?.pharmacy ?? true,
      });
      setConsultationFeeDisplay(feeNum === 0 ? '' : String(feeNum));

      // Load bank & invoice details from modulesEnabled.billingSettings.invoiceFooter
      const modulesEnabled = cfg.modulesEnabled as any;
      const invoiceFooter = modulesEnabled?.billingSettings?.invoiceFooter || {};
      setBankData({
        gstin: invoiceFooter.gstin || '',
        pan: invoiceFooter.pan || '',
        tan: invoiceFooter.tan || '',
        hospitalRegistrationNumber: invoiceFooter.hospitalRegistrationNumber || cfg.hospitalLicenseNumber || '',
        registrationIssuedBy: invoiceFooter.registrationIssuedBy || '',
        bankName: invoiceFooter.bankName || '',
        bankBranch: invoiceFooter.bankBranch || '',
        accountNumber: invoiceFooter.accountNumber || '',
        ifscCode: invoiceFooter.ifscCode || '',
        upiId: invoiceFooter.upiId || '',
        paymentTerms: invoiceFooter.paymentTerms || (cfg as any).defaultPaymentTerms || 'Net 15 days',
        jurisdictionCity: invoiceFooter.jurisdictionCity || cfg.city || '',
        overdueInterestRate: invoiceFooter.overdueInterestRate || '2% monthly',
        billingDepartmentContact: invoiceFooter.billingDepartmentContact || cfg.phone || '',
        website: invoiceFooter.website || '',
        certifications: invoiceFooter.certifications || '',
      });

      // Set logo preview from saved logoUrl or logoData (stored in database)
      // Priority: logoData (from DB) > logoUrl (file path or data URL)
      const logoSource = (cfg as any).logoData || cfg.logoUrl;
      
      if (logoSource) {
        // Handle both string and Buffer types
        let logoPreviewUrl: string;
        if (typeof logoSource === 'string') {
          logoPreviewUrl = logoSource.trim();
        } else if (Buffer.isBuffer(logoSource)) {
          // If it's a Buffer, convert to data URL
          const mimeType = (cfg as any).logoMimeType || 'image/png';
          const base64 = logoSource.toString('base64');
          logoPreviewUrl = `data:${mimeType};base64,${base64}`;
        } else {
          // Try to convert to string
          logoPreviewUrl = String(logoSource).trim();
        }
        
        console.log('Loading logo from config, source:', logoPreviewUrl.startsWith('data:') ? 'database (base64)' : 'file path');
        
        // Reset logo load attempt flag when loading new config
        setLogoLoadAttempted(false);
        
        // If it's a data URL (stored in database), use it directly
        if (logoPreviewUrl.startsWith('data:')) {
          console.log('Setting logo preview (from database):', logoPreviewUrl.substring(0, 50) + '...');
          setLogoPreview(logoPreviewUrl);
        }
        // If it's already an absolute URL (http/https), use it directly
        else if (logoPreviewUrl.startsWith('http')) {
          console.log('Setting logo preview (absolute URL):', logoPreviewUrl);
          setLogoPreview(logoPreviewUrl);
        } else {
          // For relative paths like /api/uploads/logos/..., construct full URL using API base URL
          // Extract base URL from API_URL (remove /api suffix if present)
          let apiBaseUrl = envConfig.API_URL;
          if (apiBaseUrl.endsWith('/api')) {
            apiBaseUrl = apiBaseUrl.replace('/api', '');
          }
          // Remove trailing slash
          apiBaseUrl = apiBaseUrl.replace(/\/$/, '');
          
          // Ensure logoUrl starts with /
          if (!logoPreviewUrl.startsWith('/')) {
            logoPreviewUrl = `/${logoPreviewUrl}`;
          }
          
          const fullUrl = `${apiBaseUrl}${logoPreviewUrl}`;
          console.log('Setting logo preview (constructed URL):', fullUrl);
          setLogoPreview(fullUrl);
        }
      } else {
        // Clear preview if no logo URL
        console.log('No logo URL in config, clearing preview');
        setLogoPreview(null);
        setLogoLoadAttempted(false);
      }
    } catch (err: any) {
      console.error('ConfigurationManagement: Load config error:', err);
      const errorMessage = err?.response?.data?.message || err?.message || 'Failed to load hospital configuration.';
      setError(`Failed to load hospital configuration: ${errorMessage}. You can still create a new configuration.`);
      // Don't block rendering - allow user to create new config
    } finally {
      console.log('ConfigurationManagement: loadConfig completed, setting loading to false');
      setLoading(false);
    }
  };

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (file) {
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        setError('Invalid file type. Please select an image file (JPEG, PNG, GIF, WebP).');
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        setError('File size too large. Please select a file smaller than 5MB.');
        return;
      }

      setLogoFile(file);
      setError('');

      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUploadLogo = async (): Promise<void> => {
    if (!logoFile) return;

    setUploadingLogo(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('logo', logoFile);

      const response = await configService.uploadHospitalLogo(formData);
      console.log('Logo upload response:', response);
      
      // Handle response structure
      // The service returns: { config: HospitalConfig, logoUrl: string }
      let uploadedLogoUrl = null;
      if (response) {
        // The service returns response.data.data which is { config, logoUrl }
        // So response.logoUrl should be available directly
        if (response.logoUrl) {
          uploadedLogoUrl = response.logoUrl;
        } 
        // Also check config.logoUrl as fallback
        else if (response.config?.logoUrl) {
          uploadedLogoUrl = response.config.logoUrl;
        }
      }
      
      console.log('Extracted logoUrl:', uploadedLogoUrl);
      
      if (uploadedLogoUrl) {
        // Update profileData with the logo URL (which is now a data URL from database)
        setProfileData(prev => ({ ...prev, logoUrl: uploadedLogoUrl }));
        
        // Clear any previous errors before setting the preview
        setError('');
        
        // The uploadedLogoUrl is now a data URL (data:image/png;base64,...) stored in database
        // Use it directly - no need to construct URLs
        if (uploadedLogoUrl.startsWith('data:')) {
          console.log('Setting logo preview from database (data URL):', uploadedLogoUrl.substring(0, 50) + '...');
          setLogoPreview(uploadedLogoUrl);
        } else {
          // Fallback for old file-based URLs
          let previewUrl = uploadedLogoUrl;
          if (!previewUrl.startsWith('http') && !previewUrl.startsWith('data:') && !previewUrl.startsWith('/')) {
            previewUrl = `/${previewUrl}`;
          }
          
          if (previewUrl.startsWith('http')) {
            setLogoPreview(previewUrl);
          } else {
            // Construct full URL for relative paths using API base URL
            let apiBaseUrl = envConfig.API_URL;
            if (apiBaseUrl.endsWith('/api')) {
              apiBaseUrl = apiBaseUrl.replace('/api', '');
            }
            apiBaseUrl = apiBaseUrl.replace(/\/$/, '');
            
            if (!previewUrl.startsWith('/')) {
              previewUrl = `/${previewUrl}`;
            }
            
            const fullUrl = `${apiBaseUrl}${previewUrl}`;
            console.log('Setting logo preview URL:', fullUrl);
            setLogoPreview(fullUrl);
          }
        }
        
        setLogoFile(null);
        setSuccess('Logo uploaded and saved successfully!');
        setLogoJustUploaded(true); // Flag to prevent immediate error on image load
        setTimeout(() => setSuccess(''), 3000);
        
        // Clear the flag after a delay to allow image to load
        setTimeout(() => {
          setLogoJustUploaded(false);
        }, 2000);
        
        // Reload config to ensure everything is in sync
        // Use a small delay to ensure the file is fully written to disk
        setTimeout(async () => {
          await loadConfig();
        }, 500);
      } else {
        const errorMsg = 'Logo uploaded but URL not received. Please try again.';
        setError(errorMsg);
        throw new Error(errorMsg); // Throw so calling function knows it failed
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to upload logo. Please try again.';
      setError(errorMsg);
      throw err; // Re-throw so calling function can handle it
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>): void => {
    const { name, value, type } = e.target;

    if (name.startsWith('workingHours.')) {
      const field = name.split('.')[1];
      setProfileData(prev => ({
        ...prev,
        workingHours: {
          ...prev.workingHours,
          [field]: field === 'workingDays'
            ? (e.target as HTMLSelectElement).selectedOptions
              ? Array.from((e.target as HTMLSelectElement).selectedOptions).map(opt => opt.value)
              : value.split(',').map(s => s.trim())
            : value
        }
      }));
    } else if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setProfileData(prev => ({ ...prev, [name]: checked }));
    } else if (name === 'defaultConsultationFee') {
      // Handled by handleConsultationFeeChange (string display, allow empty, strip leading zeros)
      return;
    } else if (type === 'number') {
      const numValue = value === '' ? 0 : (isNaN(Number(value)) ? 0 : Number(value));
      setProfileData(prev => ({ ...prev, [name]: numValue }));
    } else {
      setProfileData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleBankChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>): void => {
    const { name, value } = e.target;
    setBankData(prev => ({ ...prev, [name]: value }));
  };

  const handleConsultationFeeChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const raw = e.target.value;
    if (raw === '') {
      setConsultationFeeDisplay('');
      setProfileData(prev => ({ ...prev, defaultConsultationFee: 0 }));
      return;
    }
    const allowed = raw.replace(/[^\d.]/g, '');
    const parts = allowed.split('.');
    const oneDecimal = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : allowed;
    const stripped = oneDecimal.replace(/^0+(?=\d)/, '');
    const display = stripped === '' ? '0' : stripped === '.' ? '0.' : stripped;
    const num = parseFloat(display);
    setConsultationFeeDisplay(display);
    setProfileData(prev => ({ ...prev, defaultConsultationFee: Number.isFinite(num) && num >= 0 ? num : 0 }));
  };



  const handleSaveProfile = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      // Upload logo first if a new file is selected
      let finalLogoUrl = profileData.logoUrl;
      if (logoFile) {
        // Clear any previous errors before uploading logo
        setError('');
        try {
          await handleUploadLogo();
          // Wait a bit to ensure logo URL is updated in profileData
          await new Promise(resolve => setTimeout(resolve, 200));
          // Get the updated logoUrl from profileData after upload
          finalLogoUrl = profileData.logoUrl;
          // Clear any errors that might have been set during logo upload if upload succeeded
          setError('');
        } catch (logoError: any) {
          // If logo upload fails, log it but don't block profile save
          console.warn('Logo upload failed, but continuing with profile save:', logoError);
          // Clear the error from logo upload - we'll proceed with profile save
          setError('');
          // The logo will just use the existing logoUrl
        }
      }

      // Prepare payload - exclude fields that don't exist in schema
      const { appointmentsEnabled, consultationsEnabled, prescriptionsEnabled, pharmacyEnabled, ...baseProfileData } = profileData;
      
      // Ensure logoUrl is included in the payload - use the most recent value
      const payload = {
        ...baseProfileData,
        currency: 'INR', // Application uses INR only
        displayCurrency: 'INR', // Application uses INR only
        logoUrl: finalLogoUrl || baseProfileData.logoUrl || config?.logoUrl || '', // Ensure logoUrl is always included
        modulesEnabled: {
          ...(config?.modulesEnabled || {}),
          appointments: appointmentsEnabled,
          consultations: consultationsEnabled,
          prescriptions: prescriptionsEnabled,
          pharmacy: pharmacyEnabled,
        }
      };

      console.log('[ConfigurationManagement] 💾 Saving profile with payload:', {
        displayCurrency: payload.displayCurrency,
        currency: payload.currency,
        hasDisplayCurrency: payload.displayCurrency !== undefined && payload.displayCurrency !== null,
        displayCurrencyValue: payload.displayCurrency,
        logoUrl: payload.logoUrl
      });

      const response = await configService.updateHospitalConfig(payload);

      if (response && response.config) {
        // Clear any previous errors before showing success (including any from logo upload)
        setError('');
        setSuccess('Hospital profile saved successfully!');
        const updatedConfig = response.config as HospitalConfig;
        setConfig(updatedConfig);
        
        // IMPORTANT: Refresh the global config context so all components get the updated displayCurrency
        console.log('[ConfigurationManagement] 🔄 Refreshing global config context after save', {
          savedDisplayCurrency: updatedConfig.displayCurrency,
          savedCurrency: updatedConfig.currency,
          hasDisplayCurrency: updatedConfig.displayCurrency !== undefined && updatedConfig.displayCurrency !== null,
          fullConfig: updatedConfig
        });
        // Force a full refresh of the config context
        console.log('[ConfigurationManagement] Calling refreshConfig()...');
        try {
          await refreshConfig();
          console.log('[ConfigurationManagement] refreshConfig() completed');
          
          // CRITICAL: Also reload the page after a short delay to ensure all components get the updated config
          // This is a workaround for React context not updating immediately
          setTimeout(async () => {
            try {
              // Verify the config was saved correctly by fetching directly
              const freshConfig = await configService.getHospitalConfig();
              console.log('[ConfigurationManagement] ✅ Direct config fetch after refresh:', {
                displayCurrency: freshConfig.config?.displayCurrency,
                currency: freshConfig.config?.currency,
                hasDisplayCurrency: freshConfig.config?.displayCurrency !== undefined && freshConfig.config?.displayCurrency !== null
              });
              
              // CRITICAL: Force multiple refreshes to ensure context updates (no manual refresh needed)
              if (freshConfig.config?.displayCurrency && freshConfig.config.displayCurrency !== 'USD') {
                console.log('[ConfigurationManagement] 🔄 Forcing multiple config refreshes to ensure context updates...');
                
                // Refresh 3 times with delays to ensure propagation
                for (let i = 1; i <= 3; i++) {
                  await new Promise(resolve => setTimeout(resolve, 300));
                  await refreshConfig();
                  console.log(`[ConfigurationManagement] ✅ Refresh ${i}/3 complete`);
                }
                
                console.log('[ConfigurationManagement] ✅ All automatic refreshes complete. Currency should now be updated in all components.');
                console.log('[ConfigurationManagement] 💡 Navigate to Medicine Management to see updated currency.');
                
                // Update success message
                setSuccess(`Configuration saved! Display currency updated to ${freshConfig.config.displayCurrency}. Navigate to Medicine Management to see the changes.`);
              }
            } catch (err) {
              console.error('[ConfigurationManagement] Failed to verify config:', err);
            }
          }, 1000);
        } catch (error) {
          console.error('[ConfigurationManagement] refreshConfig() failed:', error);
        }
        
        // Update logo preview from the saved config
        if (updatedConfig.logoUrl) {
          // Handle both string and Buffer types
          let logoPreviewUrl: string;
          if (typeof updatedConfig.logoUrl === 'string') {
            logoPreviewUrl = updatedConfig.logoUrl.trim();
          } else if (Buffer.isBuffer(updatedConfig.logoUrl)) {
            // If it's a Buffer, convert to data URL
            const mimeType = updatedConfig.logoMimeType || 'image/png';
            const base64 = updatedConfig.logoUrl.toString('base64');
            logoPreviewUrl = `data:${mimeType};base64,${base64}`;
          } else {
            // Try to convert to string
            logoPreviewUrl = String(updatedConfig.logoUrl).trim();
          }
          
          if (logoPreviewUrl.startsWith('http') || logoPreviewUrl.startsWith('data:')) {
            setLogoPreview(logoPreviewUrl);
          } else {
            // Construct full URL using API base URL
            let apiBaseUrl = envConfig.API_URL;
            if (apiBaseUrl.endsWith('/api')) {
              apiBaseUrl = apiBaseUrl.replace('/api', '');
            }
            apiBaseUrl = apiBaseUrl.replace(/\/$/, '');
            
            if (!logoPreviewUrl.startsWith('/')) {
              logoPreviewUrl = `/${logoPreviewUrl}`;
            }
            
            const fullUrl = `${apiBaseUrl}${logoPreviewUrl}`;
            setLogoPreview(fullUrl);
          }
        }
        
        // Update profileData with the saved logoUrl
        setProfileData(prev => ({ ...prev, logoUrl: updatedConfig.logoUrl || prev.logoUrl }));
        
        await refreshConfig();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError('Failed to save profile. Please try again.');
      }
    } catch (err: any) {
      console.error('Save profile error:', err);
      setError(err.response?.data?.message || 'Failed to save profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBankDetails = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      // Save bank details in modulesEnabled.billingSettings.invoiceFooter
      const updateData = {
        modulesEnabled: {
          billingSettings: {
            invoiceFooter: bankData
          }
        }
      };

      const response = await configService.updateHospitalConfig(updateData);

      if (response && response.config) {
        setSuccess('Bank & Invoice details saved successfully!');
        setConfig(response.config as HospitalConfig);
        await refreshConfig();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError('Failed to save bank details. Please try again.');
      }
    } catch (err: any) {
      console.error('Save bank details error:', err);
      setError(err.response?.data?.message || 'Failed to save bank details. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  console.log('ConfigurationManagement: Rendering, loading=', loading, 'activeTab=', activeTab);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#F9FAFB', padding: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '48px', height: '48px', border: '4px solid #E5E7EB', borderTopColor: '#2563EB', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }}></div>
          <p style={{ color: '#6B7280' }}>Loading hospital configuration...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F0F0F0', padding: '8px' }}>
      <div style={{ maxWidth: '100%', margin: '0 auto' }}>
        {/* Header - Desktop style */}
        <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #C8C8C8', padding: '8px 12px', marginBottom: '8px' }}>
          <h1 style={{ fontSize: '16px', fontWeight: '600', color: '#000000', margin: 0, marginBottom: '4px' }}>⚙️ Hospital Configuration</h1>
          <p style={{ fontSize: '12px', color: '#666666', margin: 0 }}>Manage your hospital profile and invoice settings</p>
        </div>

        {/* Tabs Navigation - Desktop style */}
        <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #C8C8C8', marginBottom: '8px' }}>
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'profile'}
                onClick={() => setActiveTab('profile')}
                className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'profile'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
              >
                🏥 Profile Setup
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'bank'}
                onClick={() => setActiveTab('bank')}
                className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'bank'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
              >
                🏦 Bank & Invoice Details
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'updates'}
                onClick={() => setActiveTab('updates')}
                className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'updates'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
              >
                ⬆️ App updates
              </button>
            </nav>
          </div>
        </div>

        {/* Success/Error Messages */}
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg mb-6">
            {success}
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* Profile Setup Tab */}
        {activeTab === 'profile' && (
          <form onSubmit={handleSaveProfile} className="space-y-6">
            {/* Hospital Profile Section */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-6 pb-3 border-b">Hospital Profile</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Logo Upload */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Hospital Logo</label>
                  <div className="flex items-center space-x-4">
                    {logoPreview ? (
                      <div className="w-32 h-32 border-2 border-gray-300 rounded-lg overflow-hidden bg-gray-50 flex items-center justify-center">
                        <img 
                          src={logoPreview} 
                          alt="Hospital Logo" 
                          className="max-w-full max-h-full object-contain"
                          onError={(e) => {
                            console.error('Logo image failed to load:', logoPreview);
                            console.error('Error event:', e);
                            
                            // Don't show error if we just uploaded successfully
                            if (logoJustUploaded) {
                              console.log('Logo just uploaded, retrying image load...');
                              const imgElement = e.target as HTMLImageElement;
                              // Try to reload the image after a short delay
                              setTimeout(() => {
                                if (imgElement && logoPreview) {
                                  // Force reload by adding timestamp to URL
                                  const separator = logoPreview.includes('?') ? '&' : '?';
                                  imgElement.src = `${logoPreview}${separator}_t=${Date.now()}`;
                                }
                              }, 1000);
                              return;
                            }
                            
                            // Mark that we've attempted to load the logo
                            if (!logoLoadAttempted) {
                              setLogoLoadAttempted(true);
                              // First attempt: try to reload once silently
                              const imgElement = e.target as HTMLImageElement;
                              setTimeout(() => {
                                if (imgElement && logoPreview) {
                                  const newImg = new Image();
                                  newImg.onload = () => {
                                    imgElement.src = logoPreview;
                                  };
                                  newImg.onerror = () => {
                                    // Only show error if user is actively trying to use the logo
                                    // Don't show error on initial page load - just clear the preview
                                    console.warn('Logo image failed to load after retry, clearing preview');
                                    setLogoPreview(null);
                                    // Don't set error - just silently fail and show placeholder
                                  };
                                  newImg.src = logoPreview;
                                }
                              }, 1000);
                              return;
                            }
                            
                            // If we've already attempted and it still fails, just clear the preview
                            // Don't show error message - user can re-upload if needed
                            console.warn('Logo image failed to load, clearing preview');
                            setLogoPreview(null);
                          }}
                          onLoad={() => {
                            console.log('Logo image loaded successfully:', logoPreview);
                            // Clear any error when image loads successfully
                            setError('');
                            setLogoLoadAttempted(false);
                          }}
                        />
                      </div>
                    ) : (
                      <div className="w-32 h-32 border-2 border-gray-300 rounded-lg overflow-hidden bg-gray-50 flex items-center justify-center">
                        <div className="text-center text-gray-400">
                          <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <p className="text-xs">Hospital Logo</p>
                        </div>
                      </div>
                    )}
                    <div className="flex-1">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleLogoFileChange}
                        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                      />
                      {logoFile && (
                        <button
                          type="button"
                          onClick={handleUploadLogo}
                          disabled={uploadingLogo}
                          className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {uploadingLogo ? 'Uploading...' : 'Upload Logo'}
                        </button>
                      )}
                      <p className="mt-1 text-xs text-gray-500">Recommended: 200x200px, Max 5MB (PNG, JPG, GIF, WebP)</p>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Hospital Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="hospitalName"
                    value={profileData.hospitalName}
                    onChange={handleProfileChange}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter hospital name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Hospital Code</label>
                  <input
                    type="text"
                    name="hospitalCode"
                    value={profileData.hospitalCode}
                    onChange={handleProfileChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., HOSP001"
                  />
                </div>
              </div>
            </div>

            {/* Address Information */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-6 pb-3 border-b">Address Information</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Street Address</label>
                  <textarea
                    name="address"
                    value={profileData.address}
                    onChange={handleProfileChange}
                    rows={2}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter street address"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">City</label>
                  <input
                    type="text"
                    name="city"
                    value={profileData.city}
                    onChange={handleProfileChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter city"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">State</label>
                  <input
                    type="text"
                    name="state"
                    value={profileData.state}
                    onChange={handleProfileChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter state"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Postal Code</label>
                  <input
                    type="text"
                    name="postalCode"
                    value={profileData.postalCode}
                    onChange={handleProfileChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter postal code"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Country</label>
                  <input
                    type="text"
                    name="country"
                    value={profileData.country}
                    onChange={handleProfileChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter country"
                  />
                </div>
              </div>
            </div>

            {/* Contact Information */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-6 pb-3 border-b">Contact Information</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Phone</label>
                  <input
                    type="tel"
                    name="phone"
                    value={profileData.phone}
                    onChange={handleProfileChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="+91-XX-XXXX-XXXX"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                  <input
                    type="email"
                    name="email"
                    value={profileData.email}
                    onChange={handleProfileChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="info@hospital.com"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Emergency Contact</label>
                  <input
                    type="tel"
                    name="emergencyContact"
                    value={profileData.emergencyContact}
                    onChange={handleProfileChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Emergency contact number"
                  />
                </div>
              </div>
            </div>

            {/* Regulatory Information */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-6 pb-3 border-b">Regulatory Information</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Hospital License Number</label>
                  <input
                    type="text"
                    name="hospitalLicenseNumber"
                    value={profileData.hospitalLicenseNumber}
                    onChange={handleProfileChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter license number"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Tax ID / GSTIN</label>
                  <input
                    type="text"
                    name="taxId"
                    value={profileData.taxId}
                    onChange={handleProfileChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter tax ID or GSTIN"
                  />
                </div>
              </div>
            </div>

            {/* Operational Settings */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-6 pb-3 border-b">Operational Settings</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Timezone</label>
                  <select
                    name="timezone"
                    value={profileData.timezone}
                    onChange={handleProfileChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {TIMEZONES.map(tz => (
                      <option key={tz.value} value={tz.value}>{tz.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Default Language</label>
                  <select
                    name="defaultLanguage"
                    value={profileData.defaultLanguage}
                    onChange={handleProfileChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {languages.map(lang => (
                      <option key={lang.value} value={lang.value}>{lang.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Currency (Fixed to INR)</label>
                  <input
                    type="text"
                    value="INR - Indian Rupee (₹)"
                    disabled
                    className="w-full px-4 py-2 border border-gray-300 rounded-md bg-gray-100 cursor-not-allowed"
                  />
                  <p className="mt-1 text-xs text-gray-500">Application uses INR (Indian Rupee) only. Currency conversion is disabled.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Appointment Slot Duration (minutes)</label>
                  <input
                    type="number"
                    name="appointmentSlotDuration"
                    value={profileData.appointmentSlotDuration}
                    onChange={handleProfileChange}
                    onFocus={autoSelectIfZero}
                    onMouseDown={autoSelectIfZeroMouseDown}
                    min="5"
                    max="120"
                    step="5"
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Pricing & Fees */}
            <div className="bg-white rounded-lg shadow-sm p-6 border-2 border-blue-200">
              <h2 className="text-xl font-semibold text-gray-900 mb-6 pb-3 border-b">💰 Pricing & Fees</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Default Consultation Fee <span className="text-blue-600 font-semibold">*</span> ({profileData.currency || 'USD'})
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    name="defaultConsultationFee"
                    value={consultationFeeDisplay}
                    onChange={handleConsultationFeeChange}
                    onFocus={autoSelectIfZero}
                    onMouseDown={autoSelectIfZeroMouseDown}
                    placeholder="Enter consultation fee (e.g., 500.00)"
                    className="w-full px-4 py-2 border-2 border-blue-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg font-medium"
                  />
                  <p className="mt-2 text-sm text-gray-600 bg-blue-50 p-3 rounded-md">
                    <strong>💡 Important:</strong> This fee will be automatically applied to <strong>all new consultations</strong> for <strong>all doctors</strong>. 
                    The amount is stored in your base currency ({profileData.currency || 'USD'}) and will be converted to your display currency ({profileData.displayCurrency || profileData.currency || 'USD'}) when shown in bills.
                  </p>
                </div>
              </div>
            </div>

            {/* Working Hours */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-6 pb-3 border-b">Working Hours</h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-3">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Working Days</label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {workingDaysOptions.map(day => (
                      <label key={day.value} className="flex items-center space-x-3 p-3 border rounded-md hover:bg-gray-50 cursor-pointer transition-colors">
                        <input
                          type="checkbox"
                          value={day.value}
                          checked={profileData.workingHours.workingDays.includes(day.value)}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            const value = day.value;
                            setProfileData(prev => {
                              const currentDays = prev.workingHours.workingDays;
                              let newDays;
                              if (checked) {
                                newDays = [...currentDays, value];
                              } else {
                                newDays = currentDays.filter(d => d !== value);
                              }
                              // Sort days to keep them in order
                              const dayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                              newDays.sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));

                              return {
                                ...prev,
                                workingHours: {
                                  ...prev.workingHours,
                                  workingDays: newDays
                                }
                              };
                            });
                          }}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <span className="text-sm text-gray-700 font-medium">{day.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Start Time</label>
                  <input
                    type="time"
                    name="workingHours.startTime"
                    value={profileData.workingHours.startTime}
                    onChange={handleProfileChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">End Time</label>
                  <input
                    type="time"
                    name="workingHours.endTime"
                    value={profileData.workingHours.endTime}
                    onChange={handleProfileChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Module Toggles */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-6 pb-3 border-b">Module Settings</h2>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <label className="text-sm font-medium text-gray-900">Appointments Module</label>
                    <p className="text-xs text-gray-500">Enable or disable patient appointment scheduling</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      name="appointmentsEnabled"
                      checked={profileData.appointmentsEnabled}
                      onChange={handleProfileChange}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <label className="text-sm font-medium text-gray-900">Consultations Module</label>
                    <p className="text-xs text-gray-500">Enable or disable doctor consultations and diagnosis</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      name="consultationsEnabled"
                      checked={profileData.consultationsEnabled}
                      onChange={handleProfileChange}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <label className="text-sm font-medium text-gray-900">Prescriptions Module</label>
                    <p className="text-xs text-gray-500">Enable or disable digital prescription management</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      name="prescriptionsEnabled"
                      checked={profileData.prescriptionsEnabled}
                      onChange={handleProfileChange}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <label className="text-sm font-medium text-gray-900">Pharmacy & Medicines Module</label>
                    <p className="text-xs text-gray-500">Enable or disable pharmacy inventory and dispensing</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      name="pharmacyEnabled"
                      checked={profileData.pharmacyEnabled}
                      onChange={handleProfileChange}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <label className="text-sm font-medium text-gray-900">Lab Tests Module</label>
                    <p className="text-xs text-gray-500">Enable or disable laboratory test management</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      name="labTestsEnabled"
                      checked={profileData.labTestsEnabled}
                      onChange={handleProfileChange}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <label className="text-sm font-medium text-gray-900">IPD Management Module</label>
                    <p className="text-xs text-gray-500">Enable or disable inpatient department management</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      name="ipdEnabled"
                      checked={profileData.ipdEnabled}
                      onChange={handleProfileChange}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <label className="text-sm font-medium text-gray-900">Billing Module</label>
                    <p className="text-xs text-gray-500">Enable or disable billing and invoicing</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      name="billingEnabled"
                      checked={profileData.billingEnabled}
                      onChange={handleProfileChange}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex justify-end space-x-4">
                <button
                  type="button"
                  onClick={loadConfig}
                  className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Bank & Invoice Details Tab */}
        {activeTab === 'bank' && (
          <form onSubmit={handleSaveBankDetails} className="space-y-6">
            {/* Tax Information */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-6 pb-3 border-b">Tax Information</h2>
              <p className="text-sm text-gray-600 mb-6">These details will appear on invoices and bills</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">GSTIN</label>
                  <input
                    type="text"
                    name="gstin"
                    value={bankData.gstin}
                    onChange={handleBankChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="29ABCDE1234F1Z5"
                    maxLength={15}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">PAN Number</label>
                  <input
                    type="text"
                    name="pan"
                    value={bankData.pan}
                    onChange={handleBankChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="ABCDE1234F"
                    maxLength={10}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">TAN Number</label>
                  <input
                    type="text"
                    name="tan"
                    value={bankData.tan}
                    onChange={handleBankChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="ABCD12345E"
                    maxLength={10}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Hospital Registration Number</label>
                  <input
                    type="text"
                    name="hospitalRegistrationNumber"
                    value={bankData.hospitalRegistrationNumber}
                    onChange={handleBankChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter registration number"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Registration Issued By</label>
                  <input
                    type="text"
                    name="registrationIssuedBy"
                    value={bankData.registrationIssuedBy}
                    onChange={handleBankChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., Directorate of Health Services, Maharashtra"
                  />
                </div>
              </div>
            </div>

            {/* Bank Details */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-6 pb-3 border-b">Bank Account Details</h2>
              <p className="text-sm text-gray-600 mb-6">Bank information for payment receipts and invoices</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Bank Name</label>
                  <input
                    type="text"
                    name="bankName"
                    value={bankData.bankName}
                    onChange={handleBankChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., State Bank of India"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Branch Name</label>
                  <input
                    type="text"
                    name="bankBranch"
                    value={bankData.bankBranch}
                    onChange={handleBankChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., Andheri West Branch"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Account Number</label>
                  <input
                    type="text"
                    name="accountNumber"
                    value={bankData.accountNumber}
                    onChange={handleBankChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter account number"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">IFSC Code</label>
                  <input
                    type="text"
                    name="ifscCode"
                    value={bankData.ifscCode}
                    onChange={handleBankChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="SBIN0001234"
                    maxLength={11}
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">UPI ID</label>
                  <input
                    type="text"
                    name="upiId"
                    value={bankData.upiId}
                    onChange={handleBankChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="hospital@paytm or hospital@ybl"
                  />
                </div>
              </div>
            </div>

            {/* Payment & Legal Information */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-6 pb-3 border-b">Payment & Legal Information</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Payment Terms</label>
                  <input
                    type="text"
                    name="paymentTerms"
                    value={bankData.paymentTerms}
                    onChange={handleBankChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., Net 15 days"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Jurisdiction City</label>
                  <input
                    type="text"
                    name="jurisdictionCity"
                    value={bankData.jurisdictionCity}
                    onChange={handleBankChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="City for legal jurisdiction"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Overdue Interest Rate</label>
                  <input
                    type="text"
                    name="overdueInterestRate"
                    value={bankData.overdueInterestRate}
                    onChange={handleBankChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., 2% monthly"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Billing Department Contact</label>
                  <input
                    type="text"
                    name="billingDepartmentContact"
                    value={bankData.billingDepartmentContact}
                    onChange={handleBankChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Phone or email for billing queries"
                  />
                </div>
              </div>
            </div>

            {/* Additional Information */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-6 pb-3 border-b">Additional Information</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Website</label>
                  <input
                    type="url"
                    name="website"
                    value={bankData.website}
                    onChange={handleBankChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="https://www.hospital.com"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Certifications</label>
                  <textarea
                    name="certifications"
                    value={bankData.certifications}
                    onChange={handleBankChange}
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., ISO 9001:2015, NABH Accredited, NABL Accredited"
                  />
                  <p className="mt-1 text-xs text-gray-500">List any certifications or accreditations (ISO, NABH, NABL, etc.)</p>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex justify-end space-x-4">
                <button
                  type="button"
                  onClick={loadConfig}
                  className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving...' : 'Save Bank & Invoice Details'}
                </button>
              </div>
            </div>
          </form>
        )}

        {activeTab === 'updates' && (
          <div className="space-y-6">
            <AppUpdatePanel />
          </div>
        )}
      </div>
    </div>
  );
};

export default ConfigurationManagement;
