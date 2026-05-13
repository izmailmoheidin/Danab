'use client';

import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faTimes,
  faStore,
  faMapMarkerAlt,
  faSpinner,
  faCheckCircle,
  faExclamationTriangle,
} from '@fortawesome/free-solid-svg-icons';
import { apiService } from '@/lib/api';

interface AddStationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddStation?: (data: any) => void;
  initialValues?: any;
  mode?: 'add' | 'edit';
}

export default function AddStationModal({ isOpen, onClose, onAddStation, initialValues = null, mode = 'add' }: AddStationModalProps) {
  const [formData, setFormData] = useState({ imei: '', name: '', iccid: '', location: '', totalSlots: '' });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    if (initialValues) {
      setFormData({
        imei: initialValues.imei || '',
        name: initialValues.name || '',
        iccid: initialValues.iccid || '',
        location: initialValues.location || '',
        totalSlots: initialValues.totalSlots || '',
      });
    } else {
      setFormData({ imei: '', name: '', iccid: '', location: '', totalSlots: '' });
    }
  }, [initialValues, isOpen]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.imei.trim()) newErrors.imei = 'IMEI is required';
    if (!formData.name.trim()) newErrors.name = 'Station name is required';
    if (!formData.iccid.trim()) newErrors.iccid = 'ICCID is required';
    if (!formData.location.trim()) newErrors.location = 'Location is required';
    if (!formData.totalSlots || isNaN(Number(formData.totalSlots)) || Number(formData.totalSlots) < 1) {
      newErrors.totalSlots = 'Total slots must be at least 1';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError('');
    setSuccessMessage('');
    if (!validateForm()) return;

    setLoading(true);
    try {
      const stationData = {
        imei: formData.imei,
        name: formData.name,
        iccid: formData.iccid,
        location: formData.location,
        totalSlots: Number(formData.totalSlots),
      };
      const response = await apiService.addStation(stationData);
      if (onAddStation) onAddStation(formData);
      setFormData({ imei: '', name: '', iccid: '', location: '', totalSlots: '' });
      setSuccessMessage(response.data.message || 'Station added successfully');
      setTimeout(() => {
        setSuccessMessage('');
        onClose();
      }, 2000);
    } catch (error: any) {
      setApiError(error.response?.data?.message || error.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-blue-100/80 via-white/90 to-blue-200/80 dark:from-gray-900/90 dark:via-gray-800/95 dark:to-gray-900/90 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto border border-blue-100 dark:border-gray-700 relative animate-fadeInUp">
        <div className="flex items-center justify-between p-6 border-b dark:border-gray-700 bg-gradient-to-r from-blue-50 to-blue-100 dark:from-gray-800 dark:to-gray-900 rounded-t-3xl">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-blue-200 dark:bg-blue-900 rounded-xl shadow">
              <FontAwesomeIcon icon={faStore} className="text-blue-700 dark:text-blue-300 text-2xl" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
                {mode === 'edit' ? 'Edit Station' : 'Add New Station'}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {mode === 'edit' ? 'Update station details' : 'Register a new power bank rental station'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-blue-600 dark:hover:text-white transition-colors rounded-full p-2">
            <FontAwesomeIcon icon={faTimes} className="text-2xl" />
          </button>
        </div>

        {successMessage ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <FontAwesomeIcon icon={faCheckCircle} className="text-green-500 dark:text-green-400 text-5xl mb-4" />
            <h4 className="text-xl font-semibold text-green-700 dark:text-green-400 mb-2">Success!</h4>
            <p className="text-gray-600 dark:text-gray-300">{successMessage}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            <div className="space-y-4">
              <InputField label="IMEI" name="imei" value={formData.imei} error={errors.imei} onChange={handleInputChange} placeholder="e.g., WSEP161741066505" />
              <InputField label="Station Name" name="name" value={formData.name} error={errors.name} onChange={handleInputChange} placeholder="e.g., DANAB Deynile" />
              <InputField label="ICCID" name="iccid" value={formData.iccid} error={errors.iccid} onChange={handleInputChange} placeholder="e.g., 8925211200394875539f" />
              <InputField label="Location" name="location" value={formData.location} error={errors.location} onChange={handleInputChange} placeholder="e.g., Mogadishu Somalia Deynile" icon={faMapMarkerAlt} />
              <InputField label="Total Slots" name="totalSlots" type="number" value={formData.totalSlots} error={errors.totalSlots} onChange={handleInputChange} placeholder="e.g., 8" />
            </div>

            {apiError && (
              <div className="flex items-center justify-center space-x-2 text-red-600 bg-red-100 dark:bg-red-900 dark:text-red-300 rounded-xl px-4 py-2 text-center font-medium shadow">
                <FontAwesomeIcon icon={faExclamationTriangle} />
                <span>{apiError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-400 hover:from-blue-700 hover:to-blue-500 text-white py-3 px-4 rounded-xl font-bold shadow-lg transition-all disabled:opacity-60 flex items-center justify-center text-lg"
            >
              {loading && <FontAwesomeIcon icon={faSpinner} spin className="mr-2" />}
              {mode === 'edit' ? 'Update Station' : 'Register Station'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function InputField({ label, name, value, onChange, error, placeholder, type = 'text', icon }: {
  label: string; name: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  error?: string; placeholder: string; type?: string; icon?: any;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
        {icon && <FontAwesomeIcon icon={icon} className="mr-2 text-gray-400" />}
        {label} <span className="text-red-500">*</span>
      </label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        className={`w-full px-4 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-gray-700 dark:border-gray-600 dark:text-white shadow-sm transition-all ${error ? 'border-red-500 focus:ring-red-500' : 'border-gray-200'}`}
        placeholder={placeholder}
        autoComplete="off"
      />
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
