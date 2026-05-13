'use client';

import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCog, faShieldAlt, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { useAuthStore } from '@/stores/useAuthStore';
import { useDarkModeStore } from '@/stores/useDarkModeStore';
import { useLanguageStore } from '@/stores/useLanguageStore';
import { isAdmin } from '@/lib/utils/roleUtils';
import { getUserDisplayRole } from '@/lib/utils/roleUtils';

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const { dark, setDark } = useDarkModeStore();
  const { language, changeLanguage, t } = useLanguageStore();
  const userIsAdmin = isAdmin(user);
  const displayRole = getUserDisplayRole(user);

  const [activeTab, setActiveTab] = useState<'preferences' | 'security'>('preferences');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (newPassword !== confirmPassword) {
      setPasswordError(t('passwordsDoNotMatch'));
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      return;
    }

    setSaving(true);
    try {
      // API call would go here
      setPasswordSuccess(t('passwordUpdatedSuccess'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPasswordError(err.message || t('failedToUpdatePassword'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold dark:text-white">{t('settings')}</h2>
        <p className="text-gray-500 dark:text-gray-400">{t('manageProfileAndSettings')}</p>
      </div>

      {/* User Card */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
        <div className="flex items-center space-x-4">
          <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center text-white text-2xl font-bold">
            {(user?.username || user?.name || 'U').charAt(0).toUpperCase()}
          </div>
          <div>
            <h3 className="text-xl font-semibold dark:text-white">{user?.username || user?.name || 'User'}</h3>
            <p className="text-gray-500 dark:text-gray-400">{displayRole}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-2 mb-6">
        <button onClick={() => setActiveTab('preferences')}
          className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center space-x-2 ${activeTab === 'preferences' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}>
          <FontAwesomeIcon icon={faCog} /><span>{t('systemPreferences')}</span>
        </button>
        <button onClick={() => setActiveTab('security')}
          className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center space-x-2 ${activeTab === 'security' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}>
          <FontAwesomeIcon icon={faShieldAlt} /><span>{t('securitySettings')}</span>
        </button>
      </div>

      {/* Preferences Tab */}
      {activeTab === 'preferences' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-6">
          {/* Language */}
          <div>
            <label className="block text-sm font-semibold dark:text-gray-300 mb-2">{t('language')}</label>
            <select value={language} onChange={(e) => changeLanguage(e.target.value as 'en' | 'so')}
              className="w-full md:w-64 px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white">
              <option value="en">English</option>
              <option value="so">Somali</option>
            </select>
          </div>

          {/* Theme */}
          <div>
            <label className="block text-sm font-semibold dark:text-gray-300 mb-2">{t('theme')}</label>
            <select value={dark ? 'dark' : 'light'} onChange={(e) => setDark(e.target.value === 'dark')}
              className="w-full md:w-64 px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white">
              <option value="light">{t('light')}</option>
              <option value="dark">{t('dark')}</option>
            </select>
          </div>

          {/* Timezone */}
          <div>
            <label className="block text-sm font-semibold dark:text-gray-300 mb-2">{t('timezone')}</label>
            <select className="w-full md:w-64 px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white">
              <option value="UTC">{t('utc')}</option>
              <option value="EAT">{t('eat')}</option>
              <option value="GMT">{t('gmt')}</option>
            </select>
          </div>

          {/* Date Format */}
          <div>
            <label className="block text-sm font-semibold dark:text-gray-300 mb-2">{t('dateFormat')}</label>
            <select className="w-full md:w-64 px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white">
              <option value="MM/DD/YYYY">{t('mmddyyyy')}</option>
              <option value="DD/MM/YYYY">{t('ddmmyyyy')}</option>
              <option value="YYYY-MM-DD">{t('yyyymmdd')}</option>
            </select>
          </div>

          {/* Time Format */}
          <div>
            <label className="block text-sm font-semibold dark:text-gray-300 mb-2">{t('timeFormat')}</label>
            <select className="w-full md:w-64 px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white">
              <option value="12">{t('hour12')}</option>
              <option value="24">{t('hour24')}</option>
            </select>
          </div>
        </div>
      )}

      {/* Security Tab */}
      {activeTab === 'security' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold dark:text-white mb-4">{t('updatePassword')}</h3>

          {passwordError && <div className="mb-4 p-3 text-red-700 bg-red-100 rounded-lg dark:bg-red-900 dark:text-red-200">{passwordError}</div>}
          {passwordSuccess && <div className="mb-4 p-3 text-green-700 bg-green-100 rounded-lg dark:bg-green-900 dark:text-green-200">{passwordSuccess}</div>}

          <form onSubmit={handlePasswordSubmit} className="space-y-4 max-w-md">
            <div>
              <label className="block text-sm font-medium dark:text-gray-300 mb-1">{t('currentPassword')}</label>
              <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder={t('enterCurrentPassword')} className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" required />
            </div>
            <div>
              <label className="block text-sm font-medium dark:text-gray-300 mb-1">{t('newPassword')}</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t('enterNewPassword')} className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" required />
            </div>
            <div>
              <label className="block text-sm font-medium dark:text-gray-300 mb-1">{t('confirmNewPassword')}</label>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t('confirmNewPasswordPlaceholder')} className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" required />
            </div>
            <button type="submit" disabled={saving} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center space-x-2">
              {saving && <FontAwesomeIcon icon={faSpinner} spin />}
              <span>{t('updatePassword')}</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
