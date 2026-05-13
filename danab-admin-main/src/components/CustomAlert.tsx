'use client';

import { useEffect } from 'react';

interface CustomAlertProps {
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  onClose: () => void;
}

export default function CustomAlert({ message, type, onClose }: CustomAlertProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`custom-alert ${type}`}>
      <span>{message}</span>
      <button onClick={onClose} className="close-btn">
        &times;
      </button>
    </div>
  );
}
